import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission } from '../middleware';
import { recordAuditEvent } from '../audit';

export const departmentRouter = Router();
departmentRouter.use(authenticate);

const EXPLICIT_DEPARTMENT_COLUMNS = `
  \`id\`, \`org_id\`, \`name\`, \`head_count\`, \`budget_allocated\`, \`created_at\`
`;

/**
 * GET /api/departments
 * Scoped strictly by tenant org_id with explicit columns
 */
departmentRouter.get('/', requirePermission('departments:read'), async (req: Request, res: Response) => {
  const { orgId } = req.auth!;

  const rows = await query(
    `SELECT ${EXPLICIT_DEPARTMENT_COLUMNS} FROM \`departments\` WHERE \`org_id\` = ? ORDER BY \`name\` ASC;`,
    [orgId]
  );

  res.json({ departments: rows });
});

/**
 * POST /api/departments
 */
departmentRouter.post('/', requirePermission('departments:manage'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    res.status(400).json({ error: 'Department name is required.' });
    return;
  }

  const deptId = (data.id && typeof data.id === 'string' && /^[a-zA-Z0-9_-]{3,64}$/.test(data.id)) ? data.id : crypto.randomUUID();
  const name = data.name.trim();
  const budgetAllocated = parseFloat(data.budgetAllocated || data.budget_allocated) || 0;
  const headCount = parseInt(data.headCount || data.head_count, 10) || 0;

  try {
    await withTransaction(async (tx) => {
      await tx(`
        INSERT INTO \`departments\` (\`id\`, \`org_id\`, \`name\`, \`head_count\`, \`budget_allocated\`)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          \`name\` = VALUES(\`name\`),
          \`budget_allocated\` = VALUES(\`budget_allocated\`);
      `, [deptId, orgId, name, headCount, budgetAllocated]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'CREATE_DEPARTMENT',
        entityType: 'Organization',
        entityId: deptId,
        entityName: name,
        changes: { budgetAllocated, headCount },
        ipAddress
      });
    });

    res.status(201).json({ success: true, id: deptId });
  } catch (_err) {
    res.status(500).json({ error: 'Department creation transaction failed.' });
  }
});

/**
 * PUT /api/departments/:id
 */
departmentRouter.put('/:id', requirePermission('departments:manage'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const deptId = req.params.id;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const existing = await query<any>('SELECT * FROM `departments` WHERE `id` = ? AND `org_id` = ? LIMIT 1;', [deptId, orgId]);
  if (existing.length === 0) {
    res.status(404).json({ error: 'Department not found in organization.' });
    return;
  }

  const prev = existing[0]!;
  const name = (data.name && String(data.name).trim()) || prev.name;
  const budgetAllocated = data.budgetAllocated !== undefined 
    ? (parseFloat(data.budgetAllocated) || 0) 
    : (data.budget_allocated !== undefined ? parseFloat(data.budget_allocated) || 0 : prev.budget_allocated);

  try {
    await withTransaction(async (tx) => {
      await tx(`
        UPDATE \`departments\` SET
          \`name\` = ?, \`budget_allocated\` = ?
        WHERE \`id\` = ? AND \`org_id\` = ?;
      `, [name, budgetAllocated, deptId, orgId]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'UPDATE_DEPARTMENT',
        entityType: 'Organization',
        entityId: deptId,
        entityName: name,
        changes: { previous: prev, updated: { name, budgetAllocated } },
        ipAddress
      });
    });

    res.json({ success: true, message: 'Department updated successfully.' });
  } catch (_err) {
    res.status(500).json({ error: 'Department update transaction failed.' });
  }
});

/**
 * DELETE /api/departments/:id
 */
departmentRouter.delete('/:id', requirePermission('departments:manage'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const deptId = req.params.id;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const existing = await query<any>('SELECT * FROM `departments` WHERE `id` = ? AND `org_id` = ? LIMIT 1;', [deptId, orgId]);
  if (existing.length === 0) {
    res.status(404).json({ error: 'Department not found in organization.' });
    return;
  }

  // Check if active users belong to this department
  const usersCount = await query<any>("SELECT COUNT(*) as cnt FROM `users` WHERE `department_id` = ? AND `org_id` = ? AND `status` != 'DELETED';", [deptId, orgId]);
  if ((usersCount[0]?.cnt || 0) > 0) {
    res.status(409).json({
      error: `Cannot delete department with ${usersCount[0].cnt} associated staff member(s). Reassign staff first.`,
      code: 'DEPARTMENT_HAS_USERS'
    });
    return;
  }

  try {
    await withTransaction(async (tx) => {
      await tx('DELETE FROM `departments` WHERE `id` = ? AND `org_id` = ?;', [deptId, orgId]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'DELETE_DEPARTMENT',
        entityType: 'Organization',
        entityId: deptId,
        entityName: existing[0].name,
        changes: { deletedDeptId: deptId },
        ipAddress
      });
    });

    res.json({ success: true, message: 'Department removed successfully.' });
  } catch (_err) {
    res.status(500).json({ error: 'Department deletion transaction failed.' });
  }
});
