import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission, idempotent, asyncHandler } from '../middleware';
import { recordAuditEvent } from '../audit';

export const maintenanceRouter = Router();
maintenanceRouter.use(authenticate);

const EXPLICIT_MAINTENANCE_COLUMNS = `
  m.\`id\`, m.\`org_id\`, m.\`branch_id\`, m.\`reported_by_user_id\`, m.\`asset_id\`, m.\`asset_code\`, m.\`asset_name\`,
  m.\`type\`, m.\`status\`, m.\`priority\`, m.\`description\`, m.\`reported_by\`, m.\`assigned_technician\`,
  m.\`start_date\`, m.\`expected_completion\`, m.\`actual_completion\`, m.\`cost\`, m.\`parts_replaced\`,
  m.\`notes\`, m.\`version\`, m.\`created_at\`, m.\`updated_at\`
`;

/**
 * GET /api/maintenance
 * Explicitly projected and tenant-scoped maintenance work orders
 */
maintenanceRouter.get('/', requirePermission('maintenance:read'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, role, branchId, userId } = req.auth!;

  let sql = `
    SELECT ${EXPLICIT_MAINTENANCE_COLUMNS} FROM \`maintenances\` m
    INNER JOIN \`assets\` a ON m.asset_id = a.id
    WHERE a.org_id = ?
  `;
  const params: any[] = [orgId];

  if (role === 'BRANCH_MANAGER') {
    if (!branchId) {
      res.json({ maintenance: [] });
      return;
    }
    sql += ' AND m.branch_id = ?';
    params.push(branchId);
  } else if (role === 'USER') {
    sql += ' AND m.reported_by_user_id = ?';
    params.push(userId);
  }

  sql += ' ORDER BY m.created_at DESC LIMIT 300;';

  const rows = await query(sql, params);
  res.json({ maintenance: rows });
}));

/**
 * GET /api/maintenance/summary
 * Authoritative server-side calculations for repairs summary and trends.
 * Replaces client-side multipliers and hardcoded trends with real DB aggregations.
 */
maintenanceRouter.get('/summary', requirePermission('maintenance:read'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, role, branchId, userId } = req.auth!;

  let baseSql = 'FROM `maintenances` WHERE `org_id` = ?';
  const baseParams: any[] = [orgId];

  if (role === 'BRANCH_MANAGER') {
    if (!branchId) {
      res.json({
        totalUnderRepair: 0,
        avgRepairDays: null,
        totalCostThisMonth: 0,
        totalCostYear: 0,
        mostRepairedTypes: [],
        technicianWorkload: [],
        costTrend: []
      });
      return;
    }
    baseSql += ' AND `branch_id` = ?';
    baseParams.push(branchId);
  } else if (role === 'USER') {
    baseSql += ' AND `reported_by_user_id` = ?';
    baseParams.push(userId);
  }

  // 1. Total under repair
  const underRepairRows = await query<any>(
    `SELECT COUNT(*) as count ${baseSql} AND \`status\` IN ('PENDING', 'IN_PROGRESS', 'WAITING_FOR_PARTS')`,
    baseParams
  );
  const totalUnderRepair = Number(underRepairRows[0]?.count || 0);

  // 2. All records matching tenant/branch scope for statistics
  const records = await query<any>(
    `SELECT \`start_date\`, \`actual_completion\`, \`cost\`, \`type\`, \`status\`, \`assigned_technician\`, \`created_at\`
     ${baseSql}`,
    baseParams
  );

  let totalDays = 0;
  let completedCountWithDates = 0;
  let totalCostMonth = 0;
  let totalCostYear = 0;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const trendMap = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
    trendMap.set(key, 0);
  }

  const typeMap = new Map<string, { count: number; totalCost: number }>();
  const techMap = new Map<string, { active: number; completed: number }>();

  for (const row of records) {
    const cost = Number(row.cost || 0);
    const rDate = row.start_date ? new Date(row.start_date) : (row.created_at ? new Date(row.created_at) : null);

    if (rDate && !isNaN(rDate.getTime())) {
      if (rDate.getFullYear() === currentYear) {
        totalCostYear += cost;
        if (rDate.getMonth() === currentMonth) {
          totalCostMonth += cost;
        }
      }
      const trendKey = `${monthNames[rDate.getMonth()]} ${rDate.getFullYear().toString().slice(2)}`;
      if (trendMap.has(trendKey)) {
        trendMap.set(trendKey, (trendMap.get(trendKey) || 0) + cost);
      }
    }

    if (row.status === 'COMPLETED' && row.start_date && row.actual_completion) {
      const dStart = new Date(row.start_date).getTime();
      const dEnd = new Date(row.actual_completion).getTime();
      if (!isNaN(dStart) && !isNaN(dEnd) && dEnd >= dStart) {
        const diffDays = Math.max(1, Math.round((dEnd - dStart) / 86400000));
        totalDays += diffDays;
        completedCountWithDates++;
      }
    }

    const tType = row.type || 'REPAIR';
    const curType = typeMap.get(tType) || { count: 0, totalCost: 0 };
    curType.count += 1;
    curType.totalCost += cost;
    typeMap.set(tType, curType);

    const tech = row.assigned_technician || 'Unassigned';
    const curTech = techMap.get(tech) || { active: 0, completed: 0 };
    if (row.status === 'COMPLETED') {
      curTech.completed += 1;
    } else {
      curTech.active += 1;
    }
    techMap.set(tech, curTech);
  }

  const avgRepairDays = completedCountWithDates > 0
    ? Math.round((totalDays / completedCountWithDates) * 10) / 10
    : null;

  const costTrend = Array.from(trendMap.entries()).map(([month, cost]) => ({ month, cost: Math.round(cost * 100) / 100 }));
  const mostRepairedTypes = Array.from(typeMap.entries()).map(([type, val]) => ({
    type,
    count: val.count,
    totalCost: Math.round(val.totalCost * 100) / 100
  }));
  const technicianWorkload = Array.from(techMap.entries()).map(([name, val]) => ({
    name,
    activeTickets: val.active,
    completedTickets: val.completed
  }));

  res.json({
    totalUnderRepair,
    avgRepairDays,
    totalCostThisMonth: Math.round(totalCostMonth * 100) / 100,
    totalCostYear: Math.round(totalCostYear * 100) / 100,
    mostRepairedTypes,
    technicianWorkload,
    costTrend
  });
}));

/**
 * POST /api/maintenance
 * Records CREATE_MAINTENANCE in the same DB transaction!
 * Restricts regular USER input to unprivileged triage values.
 * Moves ACTIVE asset to REPAIR; prevents modifying DISPOSED or SOLD assets.
 */
maintenanceRouter.post('/', requirePermission('maintenance:create'), idempotent(), asyncHandler(async (req: Request, res: Response) => {
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

  if (asset.status === 'DISPOSED' || asset.status === 'SOLD' || asset.status === 'DEPRECATED') {
    res.status(409).json({
      error: `Cannot create maintenance work order for asset in "${asset.status}" state.`,
      code: 'ASSET_NOT_ACTIVE'
    });
    return;
  }

  const mntId = (data.id && typeof data.id === 'string' && /^[a-zA-Z0-9_-]{3,64}$/.test(data.id)) ? data.id : crypto.randomUUID();

  // Enforce role-based defaults: USER reports hardware issue as PENDING, MEDIUM priority, zero cost, Unassigned
  const ticketStatus = role === 'USER' ? 'PENDING' : (data.status || 'PENDING');
  const ticketPriority = role === 'USER' ? 'MEDIUM' : (data.priority || 'MEDIUM');
  const ticketCost = role === 'USER' ? 0.00 : Number(data.cost || 0);
  const assignedTech = role === 'USER' ? 'Unassigned' : (data.assignedTechnician || 'Unassigned');

  const insertSql = `
    INSERT INTO \`maintenances\` (
      \`id\`, \`org_id\`, \`branch_id\`, \`reported_by_user_id\`, \`asset_id\`, \`asset_code\`, \`asset_name\`, \`type\`, \`status\`,
      \`priority\`, \`description\`, \`reported_by\`, \`assigned_technician\`,
      \`start_date\`, \`expected_completion\`, \`cost\`, \`parts_replaced\`, \`notes\`, \`version\`
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1);
  `;

  try {
    await withTransaction(async (tx) => {
      await tx(insertSql, [
        mntId,
        orgId,
        asset.branch_id || null,
        actorId,
        asset.id,
        asset.asset_code,
        asset.name,
        data.type || 'REPAIR',
        ticketStatus,
        ticketPriority,
        data.description,
        actorName,
        assignedTech,
        data.startDate || new Date().toISOString().split('T')[0],
        data.expectedCompletion || new Date().toISOString().split('T')[0],
        ticketCost,
        data.partsReplaced || null,
        data.notes || null
      ]);

      // Move asset to REPAIR status ONLY if currently ACTIVE (never overwrite DEPRECATED or other states)
      await tx("UPDATE `assets` SET `status` = 'REPAIR', `version` = `version` + 1 WHERE `id` = ? AND `status` = 'ACTIVE';", [asset.id]);

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
          priority: ticketPriority,
          description: data.description
        },
        ipAddress
      });

      if (req.idempotency) {
        await req.idempotency.complete(tx, 201, { success: true, id: mntId });
      }
    });

    res.status(201).json({ success: true, id: mntId });
  } catch (_err) {
    res.status(500).json({ error: 'Maintenance creation transaction failed.' });
  }
}));

/**
 * PUT /api/maintenance/:id
 * Records UPDATE_MAINTENANCE in the same DB transaction!
 * Checks baseVersion OCC, verifies active work orders before releasing asset to ACTIVE,
 * and updates branch department budget spend on completion.
 */
maintenanceRouter.put('/:id', requirePermission('maintenance:update'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const mntId = req.params.id;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const records = await query<any>(
    'SELECT * FROM `maintenances` WHERE `id` = ? AND `org_id` = ?;',
    [mntId, orgId]
  );

  if (records.length === 0) {
    res.status(404).json({ error: 'Maintenance ticket not found in organization.' });
    return;
  }

  const rec = records[0]!;
  const currentVersion = Number(rec.version || 1);
  const newStatus = data.status || rec.status;

  // Mandatory baseVersion for OCC
  const rawExpected = data.baseVersion ?? data.version ?? (req.headers['if-match'] ? parseInt(String(req.headers['if-match']).replace(/["w/]/gi, ''), 10) : undefined);
  if (rawExpected === undefined) {
    res.status(428).json({
      error: 'baseVersion is required for optimistic concurrency control',
      code: 'PRECONDITION_REQUIRED'
    });
    return;
  }

  const expectedVersion = Number(rawExpected);
  if (isNaN(expectedVersion) || expectedVersion !== currentVersion) {
    res.status(409).json({
      error: `Conflict: Maintenance record version mismatch. Server is at version ${currentVersion}, but update was based on version ${expectedVersion}.`,
      code: 'VERSION_CONFLICT',
      currentVersion,
      expectedVersion
    });
    return;
  }

  const newCost = data.cost !== undefined ? Number(data.cost) : Number(rec.cost);
  const costDiff = newCost - Number(rec.cost || 0);

  try {
    await withTransaction(async (tx) => {
      const updateRes = await tx(`
        UPDATE \`maintenances\` SET
          \`status\` = ?, \`actual_completion\` = ?, \`cost\` = ?, \`parts_replaced\` = ?, \`notes\` = ?,
          \`version\` = \`version\` + 1
        WHERE \`id\` = ? AND \`version\` = ?;
      `, [
        newStatus,
        newStatus === 'COMPLETED' ? (data.actualCompletion || new Date().toISOString().split('T')[0]) : (data.actualCompletion || null),
        newCost,
        data.partsReplaced ?? rec.parts_replaced,
        data.notes ?? rec.notes,
        mntId,
        currentVersion
      ]);

      const affected = (updateRes as any)?.affectedRows ?? (Array.isArray(updateRes) ? (updateRes as any)[0]?.affectedRows : undefined);
      if (affected !== undefined && affected === 0) {
        const err: any = new Error('Conflict: Maintenance record version mismatch.');
        err.statusCode = 409;
        err.code = 'VERSION_CONFLICT';
        throw err;
      }

      // If completing ticket: check if other active work orders exist for this asset
      if (newStatus === 'COMPLETED') {
        const openCheck = await tx<any>(
          "SELECT COUNT(*) as openCount FROM `maintenances` WHERE `asset_id` = ? AND `status` NOT IN ('COMPLETED', 'CANCELLED') AND `id` != ?;",
          [rec.asset_id, mntId]
        );
        const openCount = openCheck[0]?.openCount || 0;

        // Return asset to ACTIVE only if no other work orders remain open AND asset is currently in REPAIR
        if (openCount === 0) {
          await tx("UPDATE `assets` SET `status` = 'ACTIVE', `version` = `version` + 1 WHERE `id` = ? AND `status` = 'REPAIR';", [rec.asset_id]);
        }

        // Transactionally update departmental budget spent for this branch facility
        if (newCost > 0 && rec.branch_id) {
          await tx(
            "UPDATE `budgets` SET `spent` = `spent` + ? WHERE `org_id` = ? AND `branch_name` = (SELECT `name` FROM `branches` WHERE `id` = ? LIMIT 1) AND `fiscal_year` = YEAR(CURRENT_DATE) LIMIT 1;",
            [costDiff > 0 ? costDiff : newCost, orgId, rec.branch_id]
          );
        }
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
          cost: newCost,
          version: currentVersion + 1
        },
        ipAddress
      });
    });

    res.json({ success: true, message: 'Maintenance record updated.', version: currentVersion + 1 });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: statusCode === 409 ? err.message : 'Maintenance update transaction failed.' });
  }
}));
