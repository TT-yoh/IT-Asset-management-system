import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission } from '../middleware';
import { recordAuditEvent } from '../audit';

export const maintenanceRouter = Router();
maintenanceRouter.use(authenticate);

/**
 * GET /api/maintenance
 */
maintenanceRouter.get('/', requirePermission('maintenance:read'), async (req: Request, res: Response) => {
  const { orgId } = req.auth!;

  const rows = await query(`
    SELECT m.* FROM \`maintenances\` m
    INNER JOIN \`assets\` a ON m.asset_id = a.id
    WHERE a.org_id = ?
    ORDER BY m.created_at DESC LIMIT 300;
  `, [orgId]);

  res.json({ maintenance: rows });
});

/**
 * POST /api/maintenance
 * Records CREATE_MAINTENANCE in the same DB transaction!
 */
maintenanceRouter.post('/', requirePermission('maintenance:create'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (!data.assetId || !data.description) {
    res.status(400).json({ error: 'Asset ID and description are required.' });
    return;
  }

  const assets = await query<any>('SELECT * FROM `assets` WHERE `id` = ? AND `org_id` = ?;', [data.assetId, orgId]);
  if (assets.length === 0) {
    res.status(404).json({ error: 'Asset not found in organization.' });
    return;
  }

  const asset = assets[0]!;
  const mntId = data.id || `mnt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const insertSql = `
    INSERT INTO \`maintenances\` (
      \`id\`, \`asset_id\`, \`asset_code\`, \`asset_name\`, \`type\`, \`status\`,
      \`priority\`, \`description\`, \`reported_by\`, \`assigned_technician\`,
      \`start_date\`, \`expected_completion\`, \`cost\`, \`parts_replaced\`, \`notes\`
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `;

  try {
    await withTransaction(async (tx) => {
      await tx(insertSql, [
        mntId,
        asset.id,
        asset.asset_code,
        asset.name,
        data.type || 'REPAIR',
        data.status || 'PENDING',
        data.priority || 'MEDIUM',
        data.description,
        actorName,
        data.assignedTechnician || 'Unassigned',
        data.startDate || new Date().toISOString().split('T')[0],
        data.expectedCompletion || new Date().toISOString().split('T')[0],
        data.cost || 0,
        data.partsReplaced || null,
        data.notes || null
      ]);

      // Update asset status to REPAIR
      await tx('UPDATE `assets` SET `status` = "REPAIR" WHERE `id` = ?;', [asset.id]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'CREATE_MAINTENANCE',
        entityType: 'Maintenance',
        entityId: mntId,
        entityName: asset.name,
        changes: {
          assetId: asset.id,
          type: data.type || 'REPAIR',
          priority: data.priority || 'MEDIUM',
          description: data.description
        },
        ipAddress
      });
    });

    res.status(201).json({ success: true, id: mntId });
  } catch (err: any) {
    res.status(500).json({ error: `Maintenance creation transaction failed: ${err.message}` });
  }
});

/**
 * PUT /api/maintenance/:id
 * Records UPDATE_MAINTENANCE in the same DB transaction!
 */
maintenanceRouter.put('/:id', requirePermission('maintenance:update'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const mntId = req.params.id;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const records = await query<any>(`
    SELECT m.* FROM \`maintenances\` m
    INNER JOIN \`assets\` a ON m.asset_id = a.id
    WHERE m.id = ? AND a.org_id = ?;
  `, [mntId, orgId]);

  if (records.length === 0) {
    res.status(404).json({ error: 'Maintenance ticket not found in organization.' });
    return;
  }

  const rec = records[0]!;
  const currentVersion = Number(rec.version || 1);
  const newStatus = data.status || rec.status;

  const rawExpected = data.baseVersion ?? data.version ?? (req.headers['if-match'] ? parseInt(String(req.headers['if-match']).replace(/["w/]/gi, ''), 10) : undefined);
  if (rawExpected !== undefined) {
    const expectedVersion = Number(rawExpected);
    if (!isNaN(expectedVersion) && expectedVersion !== currentVersion) {
      res.status(409).json({
        error: `Conflict: Maintenance record version mismatch. Server is at version ${currentVersion}, but update was based on version ${expectedVersion}.`,
        currentVersion,
        expectedVersion
      });
      return;
    }
  }

  try {
    await withTransaction(async (tx) => {
      await tx(`
        UPDATE \`maintenances\` SET
          \`status\` = ?, \`actual_completion\` = ?, \`cost\` = ?, \`parts_replaced\` = ?, \`notes\` = ?,
          \`version\` = \`version\` + 1
        WHERE \`id\` = ?;
      `, [
        newStatus,
        newStatus === 'COMPLETED' ? new Date().toISOString().split('T')[0] : (data.actualCompletion || null),
        data.cost ?? rec.cost,
        data.partsReplaced ?? rec.parts_replaced,
        data.notes ?? rec.notes,
        mntId
      ]);

      if (newStatus === 'COMPLETED') {
        await tx('UPDATE `assets` SET `status` = "ACTIVE" WHERE `id` = ?;', [rec.asset_id]);
      }

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'UPDATE_MAINTENANCE',
        entityType: 'Maintenance',
        entityId: mntId,
        entityName: rec.asset_name,
        changes: {
          previousStatus: rec.status,
          updatedStatus: newStatus,
          cost: data.cost ?? rec.cost
        },
        ipAddress
      });
    });

    res.json({ success: true, message: 'Maintenance record updated.' });
  } catch (err: any) {
    res.status(500).json({ error: `Maintenance update transaction failed: ${err.message}` });
  }
});
