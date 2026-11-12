import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission, asyncHandler } from '../middleware';
import { recordAuditEvent } from '../audit';
import { hasPermission } from '../permissions';
import { calculateFleetValuation, normalizeCondition } from '../../shared/finance';

export const reportRouter = Router();
reportRouter.use(authenticate);

/**
 * GET /api/reports/summary
 * Generates verified, tenant-scoped and branch-scoped executive metrics.
 * Derived entirely from real database records (zero fabricated numbers).
 */
reportRouter.get('/summary', requirePermission('reports:read'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, role, branchId } = req.auth!;

  let assetSql = `
    SELECT \`id\`, \`purchase_cost\`, \`purchase_date\`, \`status\`, \`asset_condition\`, \`category_name\`, \`branch_id\`, \`branch_name\`
    FROM \`assets\`
    WHERE \`org_id\` = ?
  `;
  const assetParams: any[] = [orgId];

  if (role === 'BRANCH_MANAGER') {
    if (!branchId) {
      res.json({
        summary: {
          totalAssets: 0,
          activeAssets: 0,
          inRepairAssets: 0,
          disposedAssets: 0,
          totalPurchaseCost: 0,
          totalBookValue: 0,
          totalAccumulatedDepreciation: 0,
          averageAgeMonths: 0,
          completedMaintenances: 0,
          totalMaintenanceCost: 0,
          averageRepairHours: null
        },
        categoryBreakdown: [],
        conditionDistribution: { NEW: 0, GOOD: 0, FAIR: 0, POOR: 0 },
        budgetSummary: { allocated: 0, spent: 0, remaining: 0, burnRateMonthly: 0 }
      });
      return;
    }
    assetSql += ' AND \`branch_id\` = ?';
    assetParams.push(branchId);
  }

  const assetRows = await query<any>(assetSql, assetParams);
  const fleetValuation = calculateFleetValuation(assetRows);

  let inRepairCount = 0;
  const conditionCounts: Record<string, number> = { NEW: 0, GOOD: 0, FAIR: 0, POOR: 0 };
  const catMap = new Map<string, { count: number; value: number }>();

  for (const a of assetRows) {
    if (a.status === 'REPAIR') inRepairCount++;
    const cond = normalizeCondition(a.asset_condition);
    conditionCounts[cond] = (conditionCounts[cond] || 0) + 1;

    const cat = a.category_name || 'General';
    const existing = catMap.get(cat) || { count: 0, value: 0 };
    existing.count++;
    existing.value += Number(a.purchase_cost) || 0;
    catMap.set(cat, existing);
  }

  const categoryBreakdown = Array.from(catMap.entries()).map(([name, data]) => ({
    name,
    count: data.count,
    totalValue: Math.round(data.value * 100) / 100
  }));

  // Real Maintenance Analytics
  let mntSql = `
    SELECT \`id\`, \`status\`, \`cost\`, \`start_date\`, \`actual_completion\`, \`created_at\`
    FROM \`maintenances\`
    WHERE \`org_id\` = ?
  `;
  const mntParams: any[] = [orgId];
  if (role === 'BRANCH_MANAGER' && branchId) {
    mntSql += ' AND \`branch_id\` = ?';
    mntParams.push(branchId);
  }

  const mntRows = await query<any>(mntSql, mntParams);
  let totalMaintenanceCost = 0;
  let completedCount = 0;
  let totalRepairHours = 0;
  let timedCompletedCount = 0;

  for (const m of mntRows) {
    totalMaintenanceCost += Number(m.cost) || 0;
    if (m.status === 'COMPLETED') {
      completedCount++;
      if (m.start_date && m.actual_completion) {
        const start = new Date(m.start_date).getTime();
        const end = new Date(m.actual_completion).getTime();
        if (!isNaN(start) && !isNaN(end) && end >= start) {
          const hours = Math.round((end - start) / (1000 * 3600));
          totalRepairHours += hours;
          timedCompletedCount++;
        }
      }
    }
  }

  const averageRepairHours = timedCompletedCount > 0 ? Math.round((totalRepairHours / timedCompletedCount) * 10) / 10 : null;

  // Real Budget Metrics
  let budgetSql = 'SELECT `allocated`, `spent`, `fiscal_year` FROM `budgets` WHERE `org_id` = ?';
  const budgetParams: any[] = [orgId];
  if (role === 'BRANCH_MANAGER' && branchId) {
    budgetSql += ' AND `branch_name` = (SELECT `name` FROM `branches` WHERE `id` = ? LIMIT 1)';
    budgetParams.push(branchId);
  }

  const budgetRows = await query<any>(budgetSql, budgetParams);
  let totalAllocated = 0;
  let totalSpent = 0;
  for (const b of budgetRows) {
    totalAllocated += Number(b.allocated) || 0;
    totalSpent += Number(b.spent) || 0;
  }
  const remainingBudget = Math.max(0, totalAllocated - totalSpent);

  // Real elapsed months in current calendar year (e.g. Month 1-12)
  const currentMonth = new Date().getMonth() + 1;
  const burnRateMonthly = currentMonth > 0 ? Math.round((totalSpent / currentMonth) * 100) / 100 : 0;

  res.json({
    summary: {
      totalAssets: fleetValuation.totalAssetsCount,
      activeAssets: fleetValuation.activeAssetsCount,
      inRepairAssets: inRepairCount,
      disposedAssets: fleetValuation.disposedAssetsCount,
      totalPurchaseCost: fleetValuation.totalPurchaseCost,
      totalBookValue: fleetValuation.totalBookValue,
      totalAccumulatedDepreciation: fleetValuation.totalAccumulatedDepreciation,
      averageAgeMonths: fleetValuation.averageAgeMonths,
      completedMaintenances: completedCount,
      totalMaintenanceCost: Math.round(totalMaintenanceCost * 100) / 100,
      averageRepairHours
    },
    categoryBreakdown,
    conditionDistribution: conditionCounts,
    budgetSummary: {
      allocated: Math.round(totalAllocated * 100) / 100,
      spent: Math.round(totalSpent * 100) / 100,
      remaining: Math.round(remainingBudget * 100) / 100,
      burnRateMonthly
    }
  });
}));

/**
 * POST /api/reports/export-audit
 * Audits every export action performed by users, recording actor, format, rowCount, and filters.
 */
reportRouter.post('/export-audit', requirePermission('assets:export'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const { format, rowCount, filters, entityType } = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  await withTransaction(async (tx) => {
    await recordAuditEvent(tx, {
      orgId,
      actorId,
      userName: actorName,
      role,
      action: 'EXPORT_ASSETS',
      entityType: entityType || 'AssetReport',
      entityId: `exp-${Date.now()}`,
      entityName: `${format || 'DATA'}_Export`,
      changes: {
        format: format || 'CSV',
        rowCount: Number(rowCount) || 0,
        filters: filters || {}
      },
      ipAddress
    });
  });

  res.json({ success: true, message: 'Export audit log recorded.' });
}));

/**
 * GET /api/reports/export-data
 * Server-side sanitized export dataset with role-specific column filtering.
 * Sensitive valuation figures are masked unless caller holds assets:valuation.
 */
reportRouter.get('/export-data', requirePermission('assets:export'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, role, branchId, userId: actorId, fullName: actorName } = req.auth!;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  let sql = `
    SELECT \`id\`, \`asset_code\`, \`name\`, \`model\`, \`category_name\`, \`branch_name\`,
           \`serial_number\`, \`status\`, \`asset_condition\`, \`purchase_date\`,
           \`purchase_cost\`, \`current_value\`, \`assigned_to_user_name\`, \`created_at\`
    FROM \`assets\`
    WHERE \`org_id\` = ?
  `;
  const params: any[] = [orgId];

  if (role === 'BRANCH_MANAGER') {
    if (!branchId) {
      res.json({ data: [] });
      return;
    }
    sql += ' AND \`branch_id\` = ?';
    params.push(branchId);
  }

  sql += ' ORDER BY \`created_at\` DESC LIMIT 5000;';

  const rows = await query<any>(sql, params);
  const canSeeValuation = hasPermission(role, 'assets:valuation');

  const sanitized = rows.map(r => ({
    asset_code: r.asset_code,
    name: r.name,
    model: r.model || '',
    category: r.category_name || '',
    branch: r.branch_name || '',
    serial_number: r.serial_number || '',
    status: r.status,
    condition: normalizeCondition(r.asset_condition),
    purchase_date: r.purchase_date || '',
    purchase_cost: canSeeValuation ? Number(r.purchase_cost) || 0 : '[RESTRICTED]',
    current_value: canSeeValuation ? Number(r.current_value) || 0 : '[RESTRICTED]',
    assigned_to: r.assigned_to_user_name || 'Unassigned',
    created_at: r.created_at
  }));

  // Record audit log
  await withTransaction(async (tx) => {
    await recordAuditEvent(tx, {
      orgId,
      actorId,
      userName: actorName,
      role,
      action: 'EXPORT_ASSETS',
      entityType: 'AssetReport',
      entityId: `exp-${Date.now()}`,
      entityName: 'Server_Asset_Export',
      changes: {
        rowCount: sanitized.length,
        role,
        valuationMasked: !canSeeValuation
      },
      ipAddress
    });
  });

  res.json({ data: sanitized, count: sanitized.length });
}));

