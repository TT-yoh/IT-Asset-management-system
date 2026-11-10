import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission, idempotent } from '../middleware';
import { recordAuditEvent } from '../audit';

export const budgetRouter = Router();
budgetRouter.use(authenticate);

const EXPLICIT_BUDGET_COLUMNS = `
  \`id\`, \`org_id\`, \`department_name\`, \`branch_name\`, \`fiscal_year\`, \`allocated\`, \`spent\`, \`version\`, \`created_at\`
`;

const CreateBudgetSchema = z.object({
  departmentName: z.string().trim().min(1, 'Department name is required').max(100),
  branchName: z.string().trim().min(1, 'Branch name is required').max(100),
  fiscalYear: z.coerce.number().int().min(2000).max(2100).default(() => new Date().getFullYear()),
  allocated: z.coerce.number().min(0, 'Allocated budget cannot be negative')
});

const UpdateBudgetSchema = z.object({
  departmentName: z.string().trim().min(1).max(100).optional(),
  branchName: z.string().trim().min(1).max(100).optional(),
  fiscalYear: z.coerce.number().int().min(2000).max(2100).optional(),
  allocated: z.coerce.number().min(0).optional(),
  spent: z.coerce.number().min(0).optional(),
  reason: z.string().trim().min(3).optional(),
  baseVersion: z.number().int().positive().optional()
});

/**
 * GET /api/budgets
 * Scoped strictly by tenant org_id with explicit columns
 */
budgetRouter.get('/', requirePermission('budgets:read'), async (req: Request, res: Response) => {
  const { orgId } = req.auth!;

  const rows = await query(
    `SELECT ${EXPLICIT_BUDGET_COLUMNS} FROM \`budgets\` WHERE \`org_id\` = ? ORDER BY \`fiscal_year\` DESC;`,
    [orgId]
  );

  res.json({ budgets: rows });
});

/**
 * POST /api/budgets
 * Ignores client id; generates UUID; plain INSERT; spent initialized to 0 (never trusted from POST body).
 */
budgetRouter.post('/', requirePermission('budgets:manage'), idempotent(), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const parseResult = CreateBudgetSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: parseResult.error.errors[0]?.message || 'Invalid budget data',
      code: 'VALIDATION_ERROR'
    });
    return;
  }

  const data = parseResult.data;
  const budgetId = crypto.randomUUID();
  const departmentName = data.departmentName.trim();
  const branchName = data.branchName.trim();
  const fiscalYear = data.fiscalYear;
  const allocated = data.allocated;
  const initialSpent = 0.00; // Spent is derived or initialized to 0, never trusted from client POST

  try {
    await withTransaction(async (tx) => {
      await tx(`
        INSERT INTO \`budgets\` (\`id\`, \`org_id\`, \`department_name\`, \`branch_name\`, \`fiscal_year\`, \`allocated\`, \`spent\`, \`version\`)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1);
      `, [budgetId, orgId, departmentName, branchName, fiscalYear, allocated, initialSpent]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'SET_BUDGET',
        entityType: 'Budget',
        entityId: budgetId,
        entityName: `${departmentName} - ${branchName}`,
        changes: { allocated, fiscalYear, initialSpent },
        ipAddress
      });

      if (req.idempotency) {
        await req.idempotency.complete(tx, 201, { success: true, id: budgetId });
      }
    });

    res.status(201).json({ success: true, id: budgetId });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      res.status(409).json({
        error: `Budget for department "${departmentName}" at branch "${branchName}" for year ${fiscalYear} already exists.`,
        code: 'DUPLICATE'
      });
      return;
    }
    res.status(500).json({ error: 'Budget allocation transaction failed.' });
  }
});

/**
 * PUT /api/budgets/:id
 * Enforces OCC via baseVersion. If spent is modified, requires a reason.
 */
budgetRouter.put('/:id', requirePermission('budgets:manage'), idempotent(), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const budgetId = req.params.id;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const parseResult = UpdateBudgetSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: parseResult.error.errors[0]?.message || 'Invalid budget update payload',
      code: 'VALIDATION_ERROR'
    });
    return;
  }

  const data = parseResult.data;
  const existing = await query<any>(
    'SELECT * FROM `budgets` WHERE `id` = ? AND `org_id` = ? LIMIT 1;',
    [budgetId, orgId]
  );

  if (existing.length === 0) {
    res.status(404).json({ error: 'Budget record not found in organization.' });
    return;
  }

  const prev = existing[0]!;
  if (data.baseVersion !== undefined && prev.version !== data.baseVersion) {
    res.status(409).json({
      error: 'Budget record has been modified by another transaction.',
      code: 'VERSION_CONFLICT',
      currentVersion: prev.version,
      expectedVersion: data.baseVersion
    });
    return;
  }

  const departmentName = data.departmentName !== undefined ? data.departmentName.trim() : prev.department_name;
  const branchName = data.branchName !== undefined ? data.branchName.trim() : prev.branch_name;
  const fiscalYear = data.fiscalYear !== undefined ? data.fiscalYear : prev.fiscal_year;
  const allocated = data.allocated !== undefined ? data.allocated : Number(prev.allocated);

  // If spent is updated manually, require reason
  const hasSpentChange = data.spent !== undefined && Number(data.spent) !== Number(prev.spent);
  if (hasSpentChange && !data.reason) {
    res.status(400).json({
      error: 'A reason is required when modifying budget spent amount.',
      code: 'REASON_REQUIRED'
    });
    return;
  }

  const spent = data.spent !== undefined ? Number(data.spent) : Number(prev.spent);
  const newVersion = (prev.version || 1) + 1;

  try {
    await withTransaction(async (tx) => {
      await tx(`
        UPDATE \`budgets\` SET
          \`department_name\` = ?, \`branch_name\` = ?, \`fiscal_year\` = ?, \`allocated\` = ?, \`spent\` = ?, \`version\` = ?
        WHERE \`id\` = ? AND \`org_id\` = ?;
      `, [departmentName, branchName, fiscalYear, allocated, spent, newVersion, budgetId, orgId]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'SET_BUDGET',
        entityType: 'Budget',
        entityId: budgetId,
        entityName: `${departmentName} - ${branchName}`,
        changes: {
          previous: { allocated: prev.allocated, spent: prev.spent },
          updated: { allocated, spent, version: newVersion },
          reason: data.reason
        },
        ipAddress
      });

      if (req.idempotency) {
        await req.idempotency.complete(tx, 200, { success: true, message: 'Budget updated successfully.', version: newVersion });
      }
    });

    res.json({ success: true, message: 'Budget updated successfully.', version: newVersion });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      res.status(409).json({
        error: `Budget for department "${departmentName}" at branch "${branchName}" for year ${fiscalYear} already exists.`,
        code: 'DUPLICATE'
      });
      return;
    }
    res.status(500).json({ error: 'Budget update transaction failed.' });
  }
});

/**
 * DELETE /api/budgets/:id
 */
budgetRouter.delete('/:id', requirePermission('budgets:manage'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const budgetId = req.params.id;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const existing = await query<any>('SELECT * FROM `budgets` WHERE `id` = ? AND `org_id` = ? LIMIT 1;', [budgetId, orgId]);
  if (existing.length === 0) {
    res.status(404).json({ error: 'Budget record not found in organization.' });
    return;
  }

  try {
    await withTransaction(async (tx) => {
      await tx('DELETE FROM `budgets` WHERE `id` = ? AND `org_id` = ?;', [budgetId, orgId]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'DELETE_BUDGET',
        entityType: 'Budget',
        entityId: budgetId,
        entityName: `${existing[0].department_name} - ${existing[0].branch_name}`,
        changes: { deletedBudgetId: budgetId },
        ipAddress
      });
    });

    res.json({ success: true, message: 'Budget record removed.' });
  } catch (_err) {
    res.status(500).json({ error: 'Budget deletion transaction failed.' });
  }
});
