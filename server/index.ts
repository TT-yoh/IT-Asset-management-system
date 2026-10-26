import express, { Request, Response } from 'express';
import { cookieParserMiddleware, authenticate } from './middleware';
import { idempotencyMiddleware } from './middleware/idempotency';
import { authRouter } from './routes/authRoutes';
import { assetRouter } from './routes/assetRoutes';
import { checkoutRouter } from './routes/checkoutRoutes';
import { maintenanceRouter } from './routes/maintenanceRoutes';
import { budgetRouter } from './routes/budgetRoutes';
import { branchRouter } from './routes/branchRoutes';
import { departmentRouter } from './routes/departmentRoutes';
import { userRouter } from './routes/userRoutes';
import { auditRouter } from './routes/auditRoutes';
import { query } from './db';

export const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParserMiddleware);
app.use(idempotencyMiddleware);

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'OmniAsset TiDB API Gateway'
  });
});

// Mount modular sub-routers
app.use('/api/auth', authRouter);
app.use('/api/assets', assetRouter);
app.use('/api/checkouts', checkoutRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/maintenances', maintenanceRouter);
app.use('/api/budgets', budgetRouter);
app.use('/api/branches', branchRouter);
app.use('/api/departments', departmentRouter);
app.use('/api/users', userRouter);
app.use('/api/audit-logs', auditRouter);

/**
 * Aggregated initial dataset for zero-roundtrip client initialization
 * Scoped strictly to authenticated user's organization!
 */
app.get('/api/init', authenticate, async (req: Request, res: Response) => {
  const { orgId, role, branchId } = req.auth!;

  let effectiveOrgId = orgId;
  const requestedOrg = (req.headers['x-org-id'] as string) || (req.query.orgId as string);
  if (requestedOrg && (role === 'ADMIN' || role === 'DIRECTOR')) {
    effectiveOrgId = requestedOrg;
  }

  try {
    let assetSql = 'SELECT * FROM `assets` WHERE `org_id` = ?';
    const assetParams: any[] = [effectiveOrgId];
    if ((role === 'BRANCH_MANAGER' || role === 'USER') && branchId) {
      assetSql += ' AND `branch_id` = ?';
      assetParams.push(branchId);
    }
    assetSql += ' ORDER BY `created_at` DESC;';

    const [assets, checkouts, maintenances, budgets, branches, rawUsers, departments, rawOrgs] = await Promise.all([
      query(assetSql, assetParams),
      query('SELECT c.* FROM `checkouts` c INNER JOIN `assets` a ON c.asset_id = a.id WHERE a.org_id = ? ORDER BY c.checked_out_at DESC;', [effectiveOrgId]),
      query('SELECT m.* FROM `maintenances` m INNER JOIN `assets` a ON m.asset_id = a.id WHERE a.org_id = ? ORDER BY m.created_at DESC;', [effectiveOrgId]),
      query('SELECT * FROM `budgets` WHERE `org_id` = ?;', [effectiveOrgId]),
      query('SELECT * FROM `branches` WHERE `org_id` = ?;', [effectiveOrgId]),
      query('SELECT `id`, `org_id`, `email`, `full_name`, `role`, `department_id`, `department_name`, `branch_id`, `branch_name`, `two_factor_enabled`, `avatar`, `status` FROM `users` WHERE `org_id` = ?;', [effectiveOrgId]),
      query('SELECT * FROM `departments` WHERE `org_id` = ? ORDER BY `name` ASC;', [effectiveOrgId]),
      query('SELECT * FROM `organizations` ORDER BY `name` ASC;')
    ]);

    let auditLogs: any[] = [];
    if (role === 'ADMIN' || role === 'DIRECTOR' || role === 'FINANCE') {
      auditLogs = await query('SELECT * FROM `audit_logs` WHERE `org_id` = ? ORDER BY `timestamp` DESC LIMIT 200;', [effectiveOrgId]);
    }

    const sanitizedUsers = rawUsers.map((u: any) => ({
      id: u.id,
      orgId: u.org_id,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      departmentId: u.department_id,
      departmentName: u.department_name,
      branchId: u.branch_id,
      branchName: u.branch_name,
      twoFactorEnabled: Boolean(u.two_factor_enabled),
      avatar: u.avatar || '',
      status: u.status || 'ACTIVE'
    }));

    const sanitizedOrgs = (rawOrgs || []).map((o: any) => ({
      id: o.id,
      name: o.name,
      type: o.type || 'Enterprise',
      logo: o.logo || '🏢',
      brandingColor: o.branding_color || '#10b981',
      branchesCount: o.branches_count || 1
    }));

    res.json({
      assets,
      checkouts,
      maintenances,
      budgets,
      branches,
      departments,
      organizations: sanitizedOrgs,
      users: sanitizedUsers,
      auditLogs,
      currentUser: req.auth
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load initial organization dataset: ${err.message}` });
  }
});

// Serve frontend static assets in production if dist directory exists
import path from 'path';
import fs from 'fs';

const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req: Request, res: Response) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distDir, 'index.html'));
    }
  });
}

const PORT = Number(process.env.API_PORT || process.env.PORT || 3001);

const isTestEnv = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test'));
const isVercel = Boolean(process.env.VERCEL);

if (!isTestEnv && !isVercel) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 OmniAsset TiDB API Gateway listening on port ${PORT}`);
  });
}

export default app;
