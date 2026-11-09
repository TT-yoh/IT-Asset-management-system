import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission } from '../middleware';
import { recordAuditEvent } from '../audit';

export const branchRouter = Router();
branchRouter.use(authenticate);

const EXPLICIT_BRANCH_COLUMNS = `
  \`id\`, \`org_id\`, \`name\`, \`code\`, \`location\`, \`city\`, \`country\`, \`manager_name\`, \`created_at\`
`;

/**
 * GET /api/branches
 * Scoped strictly by tenant org_id with explicit columns
 */
branchRouter.get('/', requirePermission('branches:read'), async (req: Request, res: Response) => {
  const { orgId } = req.auth!;

  const rows = await query(
    `SELECT ${EXPLICIT_BRANCH_COLUMNS} FROM \`branches\` WHERE \`org_id\` = ? ORDER BY \`name\` ASC;`,
    [orgId]
  );

  res.json({ branches: rows });
});

/**
 * POST /api/branches
 * Records CREATE_BRANCH in the same DB transaction!
 */
branchRouter.post('/', requirePermission('branches:manage'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (!data.name || !data.city) {
    res.status(400).json({ error: 'Branch name and city are required.' });
    return;
  }

  const branchId = (data.id && typeof data.id === 'string' && /^[a-zA-Z0-9_-]{3,64}$/.test(data.id)) ? data.id : crypto.randomUUID();
  const code = data.code || `BR-${data.name.slice(0, 3).toUpperCase()}`;
  const managerName = data.managerName || data.manager_name || 'Unassigned';

  try {
    await withTransaction(async (tx) => {
      await tx(`
        INSERT INTO \`branches\` (\`id\`, \`org_id\`, \`name\`, \`code\`, \`location\`, \`city\`, \`country\`, \`manager_name\`)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          \`name\` = VALUES(\`name\`),
          \`code\` = VALUES(\`code\`),
          \`location\` = VALUES(\`location\`),
          \`city\` = VALUES(\`city\`),
          \`country\` = VALUES(\`country\`),
          \`manager_name\` = VALUES(\`manager_name\`);
      `, [
        branchId,
        orgId,
        data.name.trim(),
        code.trim(),
        data.location || 'Site Facility',
        data.city.trim(),
        data.country || 'Australia',
        managerName.trim()
      ]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'CREATE_BRANCH',
        entityType: 'Organization',
        entityId: branchId,
        entityName: data.name.trim(),
        changes: { code: code.trim(), city: data.city.trim(), location: data.location, managerName },
        ipAddress
      });
    });

    res.status(201).json({ success: true, id: branchId });
  } catch (_err) {
    res.status(500).json({ error: 'Branch creation transaction failed.' });
  }
});

/**
 * PUT /api/branches/:id
 */
branchRouter.put('/:id', requirePermission('branches:manage'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const branchId = req.params.id;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const existing = await query<any>('SELECT * FROM `branches` WHERE `id` = ? AND `org_id` = ? LIMIT 1;', [branchId, orgId]);
  if (existing.length === 0) {
    res.status(404).json({ error: 'Branch not found in organization.' });
    return;
  }

  const prev = existing[0]!;
  const name = (data.name && String(data.name).trim()) || prev.name;
  const code = (data.code && String(data.code).trim()) || prev.code;
  const location = data.location ?? prev.location;
  const city = (data.city && String(data.city).trim()) ?? prev.city;
  const country = (data.country && String(data.country).trim()) ?? prev.country;
  const managerName = data.managerName || data.manager_name || prev.manager_name;

  try {
    await withTransaction(async (tx) => {
      await tx(`
        UPDATE \`branches\` SET
          \`name\` = ?, \`code\` = ?, \`location\` = ?, \`city\` = ?, \`country\` = ?, \`manager_name\` = ?
        WHERE \`id\` = ? AND \`org_id\` = ?;
      `, [name, code, location, city, country, managerName, branchId, orgId]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'UPDATE_BRANCH',
        entityType: 'Organization',
        entityId: branchId,
        entityName: name,
        changes: { previous: prev, updated: { name, code, location, city, country, managerName } },
        ipAddress
      });
    });

    res.json({ success: true, message: 'Branch updated successfully.' });
  } catch (_err) {
    res.status(500).json({ error: 'Branch update transaction failed.' });
  }
});

/**
 * DELETE /api/branches/:id
 */
branchRouter.delete('/:id', requirePermission('branches:manage'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const branchId = req.params.id;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const existing = await query<any>('SELECT * FROM `branches` WHERE `id` = ? AND `org_id` = ? LIMIT 1;', [branchId, orgId]);
  if (existing.length === 0) {
    res.status(404).json({ error: 'Branch not found in organization.' });
    return;
  }

  // Check if active assets belong to this branch
  const assetsCount = await query<any>('SELECT COUNT(*) as cnt FROM `assets` WHERE `branch_id` = ? AND `org_id` = ?;', [branchId, orgId]);
  if ((assetsCount[0]?.cnt || 0) > 0) {
    res.status(409).json({
      error: `Cannot delete branch with ${assetsCount[0].cnt} associated asset(s). Reassign assets first.`,
      code: 'BRANCH_HAS_ASSETS'
    });
    return;
  }

  // Check if active staff members belong to this branch
  const usersCount = await query<any>("SELECT COUNT(*) as cnt FROM `users` WHERE `branch_id` = ? AND `org_id` = ? AND `status` != 'DELETED';", [branchId, orgId]);
  if ((usersCount[0]?.cnt || 0) > 0) {
    res.status(409).json({
      error: `Cannot delete branch with ${usersCount[0].cnt} associated staff member(s). Reassign staff first.`,
      code: 'BRANCH_HAS_USERS'
    });
    return;
  }

  try {
    await withTransaction(async (tx) => {
      await tx('DELETE FROM `branches` WHERE `id` = ? AND `org_id` = ?;', [branchId, orgId]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'DELETE_BRANCH',
        entityType: 'Organization',
        entityId: branchId,
        entityName: existing[0].name,
        changes: { deletedBranchId: branchId },
        ipAddress
      });
    });

    res.json({ success: true, message: 'Branch removed successfully.' });
  } catch (_err) {
    res.status(500).json({ error: 'Branch deletion transaction failed.' });
  }
});
