import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission } from '../middleware';
import { recordAuditEvent } from '../audit';

export const budgetRouter = Router();
budgetRouter.use(authenticate);

/**
 * GET /api/budgets
 */
budgetRouter.get('/', requirePermission('budgets:read'), async (req: Request, res: Response) => {
  const { orgId } = req.auth!;

  const rows = await query(
    'SELECT * FROM `budgets` WHERE `org_id` = ? ORDER BY `fiscal_year` DESC;',
    [orgId]
  );

  res.json({ budgets: rows });
});

/**
 * POST /api/budgets
 * Records SET_BUDGET in the same DB transaction!
 */
budgetRouter.post('/', requirePermission('budgets:manage'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (!data.departmentName || !data.branchName || !data.allocated) {
    res.status(400).json({ error: 'Department name, branch name, and allocated budget are required.' });
    return;
  }

  const budgetId = data.id || `bg-${Date.now()}`;
  const year = data.fiscalYear || new Date().getFullYear();

  try {
    await withTransaction(async (tx) => {
      await tx(`
        INSERT INTO \`budgets\` (\`id\`, \`org_id\`, \`department_name\`, \`branch_name\`, \`fiscal_year\`, \`allocated\`, \`spent\`)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          \`department_name\` = VALUES(\`department_name\`),
          \`branch_name\` = VALUES(\`branch_name\`),
          \`fiscal_year\` = VALUES(\`fiscal_year\`),
          \`allocated\` = VALUES(\`allocated\`),
          \`spent\` = VALUES(\`spent\`);
      `, [
        budgetId,
        orgId,
        data.departmentName,
        data.branchName,
        year,
        Number(data.allocated) || 0,
        Number(data.spent) || 0
      ]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'SET_BUDGET',
        entityType: 'Budget',
        entityId: budgetId,
        entityName: `${data.departmentName} - ${data.branchName}`,
        changes: {
          allocated: Number(data.allocated),
          fiscalYear: year
        },
        ipAddress
      });
    });

    res.status(201).json({ success: true, id: budgetId });
  } catch (err: any) {
    res.status(500).json({ error: `Budget allocation transaction failed: ${err.message}` });
  }
});

/**
 * PUT /api/budgets/:id
 */
budgetRouter.put('/:id', requirePermission('budgets:manage'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const budgetId = req.params.id;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const existing = await query<any>('SELECT * FROM \`budgets\` WHERE \`id\` = ? AND \`org_id\` = ? LIMIT 1;', [budgetId, orgId]);
  if (existing.length === 0) {
    res.status(404).json({ error: 'Budget record not found in organization.' });
    return;
  }

  const prev = existing[0]!;
  const departmentName = data.departmentName || prev.department_name;
  const branchName = data.branchName || prev.branch_name;
  const fiscalYear = data.fiscalYear || prev.fiscal_year;
  const allocated = data.allocated !== undefined ? Number(data.allocated) : Number(prev.allocated);
  const spent = data.spent !== undefined ? Number(data.spent) : Number(prev.spent);

  try {
    await withTransaction(async (tx) => {
      await tx(`
        UPDATE \`budgets\` SET
          \`department_name\` = ?, \`branch_name\` = ?, \`fiscal_year\` = ?, \`allocated\` = ?, \`spent\` = ?
        WHERE \`id\` = ? AND \`org_id\` = ?;
      `, [departmentName, branchName, fiscalYear, allocated, spent, budgetId, orgId]);

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
          updated: { allocated, spent }
        },
        ipAddress
      });
    });

    res.json({ success: true, message: 'Budget updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: `Budget update transaction failed: ${err.message}` });
  }
});

/**
 * DELETE /api/budgets/:id
 */
budgetRouter.delete('/:id', requirePermission('budgets:manage'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const budgetId = req.params.id;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const existing = await query<any>('SELECT * FROM \`budgets\` WHERE \`id\` = ? AND \`org_id\` = ? LIMIT 1;', [budgetId, orgId]);
  if (existing.length === 0) {
    res.status(404).json({ error: 'Budget record not found in organization.' });
    return;
  }

  try {
    await withTransaction(async (tx) => {
      await tx('DELETE FROM \`budgets\` WHERE \`id\` = ? AND \`org_id\` = ?;', [budgetId, orgId]);

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
  } catch (err: any) {
    res.status(500).json({ error: `Budget deletion transaction failed: ${err.message}` });
  }
});
