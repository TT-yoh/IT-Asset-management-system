import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission, asyncHandler } from '../middleware';
import { hasPermission } from '../permissions';
import { recordAuditEvent } from '../audit';

export const departmentRouter = Router();
departmentRouter.use(authenticate);

const EXPLICIT_DEPARTMENT_COLUMNS = `
  \`id\`, \`org_id\`, \`name\`, \`head_count\`, \`budget_allocated\`, \`version\`, \`created_at\`
`;

const CreateDepartmentSchema = z.object({
  name: z.string().trim().min(1, 'Department name is required').max(100),
  headCount: z.coerce.number().int().min(0).default(0),
  head_count: z.coerce.number().int().min(0).optional(),
  budgetAllocated: z.coerce.number().min(0).default(0),
  budget_allocated: z.coerce.number().min(0).optional()
});

const UpdateDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  headCount: z.coerce.number().int().min(0).optional(),
  head_count: z.coerce.number().int().min(0).optional(),
  budgetAllocated: z.coerce.number().min(0).optional(),
  budget_allocated: z.coerce.number().min(0).optional(),
  baseVersion: z.number().int().positive().optional()
});

/**
 * GET /api/departments
 * Scoped strictly by tenant org_id with explicit columns
 */
departmentRouter.get('/', requirePermission('departments:read'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId } = req.auth!;

  const rows = await query(
    `SELECT ${EXPLICIT_DEPARTMENT_COLUMNS} FROM \`departments\` WHERE \`org_id\` = ? AND \`archived_at\` IS NULL ORDER BY \`name\` ASC;`,
    [orgId]
  );

  res.json({ departments: rows });
}));

/**
 * POST /api/departments
 * Ignores client-supplied id; generates UUID; plain INSERT; checks budgets:manage if budgetAllocated > 0.
 */
departmentRouter.post('/', requirePermission('departments:manage'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const parseResult = CreateDepartmentSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: parseResult.error.errors[0]?.message || 'Invalid department data',
      code: 'VALIDATION_ERROR'
    });
    return;
  }

  const data = parseResult.data;
  const name = data.name.trim();
  const headCount = data.head_count ?? data.headCount ?? 0;
  const budgetAllocated = data.budget_allocated ?? data.budgetAllocated ?? 0;

  // Modifying budget allocation requires budgets:manage permission
  if (budgetAllocated > 0 && !hasPermission(role, 'budgets:manage')) {
    res.status(403).json({
      error: 'Permission budgets:manage is required to allocate department budgets.',
      code: 'FORBIDDEN'
    });
    return;
  }

  const deptId = crypto.randomUUID();

  try {
    await withTransaction(async (tx) => {
      await tx(`
        INSERT INTO \`departments\` (\`id\`, \`org_id\`, \`name\`, \`head_count\`, \`budget_allocated\`, \`version\`)
        VALUES (?, ?, ?, ?, ?, 1);
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
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      res.status(409).json({
        error: `Department with name "${name}" already exists in this organization.`,
        code: 'DUPLICATE'
      });
      return;
    }
    res.status(500).json({ error: 'Department creation transaction failed.' });
  }
}));

/**
 * PUT /api/departments/:id
 * Enforces OCC via baseVersion. Requires budgets:manage if budget_allocated changes.
 */
departmentRouter.put('/:id', requirePermission('departments:manage'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const deptId = req.params.id;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const parseResult = UpdateDepartmentSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: parseResult.error.errors[0]?.message || 'Invalid department update payload',
      code: 'VALIDATION_ERROR'
    });
    return;
  }

  const data = parseResult.data;
  const existing = await query<any>(
    'SELECT * FROM \`departments\` WHERE \`id\` = ? AND \`org_id\` = ? AND \`archived_at\` IS NULL LIMIT 1;',
    [deptId, orgId]
  );

  if (existing.length === 0) {
    res.status(404).json({ error: 'Department not found in organization.' });
    return;
  }

  const prev = existing[0]!;
  if (data.baseVersion !== undefined && prev.version !== data.baseVersion) {
    res.status(409).json({
      error: 'Department record has been modified by another transaction.',
      code: 'VERSION_CONFLICT',
      currentVersion: prev.version,
      expectedVersion: data.baseVersion
    });
    return;
  }

  const name = data.name !== undefined ? data.name.trim() : prev.name;
  const headCount = data.head_count ?? data.headCount ?? prev.head_count;
  
  const reqBudget = data.budget_allocated ?? data.budgetAllocated;
  const hasBudgetChange = reqBudget !== undefined && Number(reqBudget) !== Number(prev.budget_allocated);

  if (hasBudgetChange && !hasPermission(role, 'budgets:manage')) {
    res.status(403).json({
      error: 'Permission budgets:manage is required to change department budget allocation.',
      code: 'FORBIDDEN'
    });
    return;
  }

  const budgetAllocated = reqBudget !== undefined ? Number(reqBudget) : Number(prev.budget_allocated);
  const newVersion = (prev.version || 1) + 1;

  try {
    await withTransaction(async (tx) => {
      await tx(`
        UPDATE \`departments\` SET
          \`name\` = ?, \`head_count\` = ?, \`budget_allocated\` = ?, \`version\` = ?
        WHERE \`id\` = ? AND \`org_id\` = ?;
      `, [name, headCount, budgetAllocated, newVersion, deptId, orgId]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'UPDATE_DEPARTMENT',
        entityType: 'Organization',
        entityId: deptId,
        entityName: name,
        changes: { previous: prev, updated: { name, headCount, budgetAllocated, version: newVersion } },
        ipAddress
      });
    });

    res.json({ success: true, message: 'Department updated successfully.', version: newVersion });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      res.status(409).json({
        error: `Department with name "${name}" already exists in this organization.`,
        code: 'DUPLICATE'
      });
      return;
    }
    res.status(500).json({ error: 'Department update transaction failed.' });
  }
}));

/**
 * DELETE /api/departments/:id
 * Refuses inside one transaction when users or budgets reference it.
 */
departmentRouter.delete('/:id', requirePermission('departments:manage'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const deptId = req.params.id;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  try {
    await withTransaction(async (tx) => {
      const existing = await tx(
        'SELECT * FROM `departments` WHERE `id` = ? AND `org_id` = ? AND `archived_at` IS NULL LIMIT 1 FOR UPDATE;',
        [deptId, orgId]
      );
      if (existing.length === 0) {
        res.status(404).json({ error: 'Department not found in organization.' });
        return;
      }
      const deptRow = existing[0];

      // 1. Users check
      const usersCount = await tx(
        "SELECT COUNT(*) as cnt FROM `users` WHERE `department_id` = ? AND `org_id` = ? AND `status` != 'DELETED';",
        [deptId, orgId]
      );
      if ((usersCount[0]?.cnt || 0) > 0) {
        res.status(409).json({
          error: `Cannot delete department with ${usersCount[0].cnt} associated staff member(s). Reassign staff first.`,
          code: 'DEPARTMENT_HAS_USERS'
        });
        return;
      }

      // 2. Budgets check
      const budgetsCount = await tx(
        'SELECT COUNT(*) as cnt FROM `budgets` WHERE `department_name` = ? AND `org_id` = ?;',
        [deptRow.name, orgId]
      );
      if ((budgetsCount[0]?.cnt || 0) > 0) {
        res.status(409).json({
          error: `Cannot delete department with ${budgetsCount[0].cnt} associated budget record(s).`,
          code: 'DEPARTMENT_HAS_BUDGETS'
        });
        return;
      }

      await tx('DELETE FROM `departments` WHERE `id` = ? AND `org_id` = ?;', [deptId, orgId]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'DELETE_DEPARTMENT',
        entityType: 'Organization',
        entityId: deptId,
        entityName: deptRow.name,
        changes: { deletedDeptId: deptId },
        ipAddress
      });

      res.json({ success: true, message: 'Department removed successfully.' });
    });
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Department deletion transaction failed.' });
    }
  }
}));
