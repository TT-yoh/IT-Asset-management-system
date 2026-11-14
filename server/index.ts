import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import config from './config';
import { query, ping } from './db';
import { hasPermission } from './permissions';
import { asyncHandler, HttpError } from './errors';
import {
  cookieParserMiddleware,
  csrfProtection,
  authenticate,
  requestLogger
} from './middleware';

import { authRouter } from './routes/authRoutes';
import { adminRouter } from './routes/adminRoutes';
import { assetRouter, EXPLICIT_ASSET_COLUMNS } from './routes/assetRoutes';
import { checkoutRouter } from './routes/checkoutRoutes';
import { maintenanceRouter } from './routes/maintenanceRoutes';
import { budgetRouter } from './routes/budgetRoutes';
import { branchRouter } from './routes/branchRoutes';
import { departmentRouter } from './routes/departmentRoutes';
import { userRouter } from './routes/userRoutes';
import { auditRouter } from './routes/auditRoutes';
import { reportRouter } from './routes/reportRoutes';
import { catalogRouter } from './routes/catalogRoutes';

export const app = express();

// 1. Disable x-powered-by header
app.disable('x-powered-by');

// 2. Trust proxy from config (needed for accurate, non-spoofed req.ip in audit logs)
if (config.TRUST_PROXY !== undefined) {
  app.set('trust proxy', config.TRUST_PROXY);
}

// 3. Helmet with strict CSP for Vite build (allowing unsafe-eval only in development for HMR)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: config.isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com'],
        connectSrc: ["'self'", ...config.CORS_ORIGINS],
        fontSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// 4. Request-ID middleware (generates X-Request-Id and attaches req.id)
app.use((req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  (req as any).id = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
});

// 5. Request logging middleware that sanitizes sensitive headers and bodies
app.use(requestLogger);

// 6. Strict CORS Middleware: allowlist-based, never '*' with credentials, adds Vary: Origin
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;

  if (origin && config.CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Idempotency-Key, X-Client-Id, X-Client-Seq'
    );
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// 7. Rate Limiter Buckets
// Global API limiter
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isTest ? 10000 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many API requests from this IP. Please try again later.', code: 'RATE_LIMIT_EXCEEDED' }
});

// Higher limit bucket for /api/init (client polling)
const initRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isTest ? 10000 : 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Dataset polling rate limit exceeded. Please try again later.', code: 'RATE_LIMIT_EXCEEDED' }
});

// Strict rate limiter for /api/auth
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isTest ? 5000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  // The strict budget protects routes that accept credentials or tokens. Checking an existing
  // session (/me) and signing out carry no guessable secret and happen on every page load, so
  // counting them would lock out whole offices that share one IP address. They remain covered
  // by the global /api limiter.
  skip: (req) => (req.method === 'GET' && req.path === '/me') || (req.method === 'POST' && req.path === '/logout'),
  message: { error: 'Too many authentication attempts. Please try again later.', code: 'AUTH_RATE_LIMIT_EXCEEDED' }
});

// Apply global rate limiting to all /api routes
app.use('/api', globalApiLimiter);

// 8. Body parser limits: 100kb default
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// 9. Cookie parser & CSRF
app.use(cookieParserMiddleware);
app.use(csrfProtection);

// 10. Health & Readiness checks
app.get(config.ALLOW_ROOT_ROUTES ? ['/api/health', '/health'] : ['/api/health'], (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    region: process.env.VERCEL_REGION || 'local',
    timestamp: new Date().toISOString()
  });
});

app.get(
  config.ALLOW_ROOT_ROUTES ? ['/api/health/ready', '/api/ready', '/ready'] : ['/api/health/ready', '/api/ready'],
  asyncHandler(async (_req: Request, res: Response) => {
    const isDbConnected = await ping();
    if (isDbConnected) {
      return res.json({ status: 'ready', database: 'connected' });
    }
    return res.status(503).json({ status: 'unready', database: 'disconnected' });
  })
);

// 11. Mount sub-routers under /api
app.use('/api/auth', authRateLimiter, authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/assets', assetRouter);
app.use('/api/checkouts', checkoutRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/budgets', budgetRouter);
app.use('/api/branches', branchRouter);
app.use('/api/departments', departmentRouter);
app.use('/api/users', userRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/reports', reportRouter);
app.use('/api/catalog', catalogRouter);

// Optional root-level route aliases (only when ALLOW_ROOT_ROUTES is explicitly enabled)
if (config.ALLOW_ROOT_ROUTES) {
  app.use('/auth', authRateLimiter, authRouter);
  app.use('/admin', adminRouter);
  app.use('/assets', assetRouter);
  app.use('/checkouts', checkoutRouter);
  app.use('/maintenance', maintenanceRouter);
  app.use('/budgets', budgetRouter);
  app.use('/branches', branchRouter);
  app.use('/departments', departmentRouter);
  app.use('/users', userRouter);
  app.use('/audit-logs', auditRouter);
  app.use('/reports', reportRouter);
  app.use('/catalog', catalogRouter);
}

/**
 * GET /api/init
 * Rewritten: permission-aware, strictly tenant-scoped and branch-scoped.
 * Derives everything from freshly loaded req.auth.
 * Uses explicit column lists (zero SELECT *).
 * Supports ETag / 304 conditional validation.
 */
app.get(
  config.ALLOW_ROOT_ROUTES ? ['/api/init', '/init'] : ['/api/init'],
  initRateLimiter,
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId, role, branchId, userId } = req.auth!;

    // Super admin can inspect specific org if requested
    let effectiveOrgId = orgId;
    if (req.auth!.isSuperAdmin && req.query.orgId && typeof req.query.orgId === 'string') {
      const orgRows = await query<any>('SELECT `id` FROM `organizations` WHERE `id` = ? LIMIT 1;', [req.query.orgId]);
      if (orgRows.length > 0) {
        effectiveOrgId = orgRows[0].id;
      }
    }

    // 1. Assets: ADMIN/DIRECTOR/FINANCE/IT_SUPPORT org-wide; BRANCH_MANAGER/USER only their branch;
    // FAIL CLOSED when a scoped role has no branchId (empty result).
    let assets: any[] = [];
    if (role === 'BRANCH_MANAGER' || role === 'USER') {
      if (branchId) {
        assets = await query(
          `SELECT ${EXPLICIT_ASSET_COLUMNS} FROM \`assets\` WHERE \`org_id\` = ? AND \`branch_id\` = ? ORDER BY \`created_at\` DESC LIMIT 1000;`,
          [effectiveOrgId, branchId]
        );
      } else {
        assets = []; // Fail closed: branch-scoped user without branchId receives zero assets
      }
    } else {
      assets = await query(
        `SELECT ${EXPLICIT_ASSET_COLUMNS} FROM \`assets\` WHERE \`org_id\` = ? ORDER BY \`created_at\` DESC LIMIT 1000;`,
        [effectiveOrgId]
      );
    }

    // 2. Checkouts: require checkouts:read; BRANCH_MANAGER branch-scoped; USER only own records; scope in SQL
    let checkouts: any[] = [];
    if (hasPermission(role, 'checkouts:read')) {
      if (role === 'BRANCH_MANAGER') {
        if (branchId) {
          checkouts = await query(
            'SELECT `id`, `org_id`, `branch_id`, `asset_id`, `asset_name`, `asset_code`, `checked_out_by`, `checked_out_to_user_id`, `checked_out_to_user_name`, `checked_out_at`, `expected_return_date`, `checked_in_at`, `return_condition`, `damage_reported`, `damage_description`, `reason`, `notes`, `version`, `status` FROM `checkouts` WHERE `org_id` = ? AND `branch_id` = ? ORDER BY `checked_out_at` DESC LIMIT 500;',
            [effectiveOrgId, branchId]
          );
        } else {
          checkouts = [];
        }
      } else if (role === 'USER') {
        checkouts = await query(
          'SELECT `id`, `org_id`, `branch_id`, `asset_id`, `asset_name`, `asset_code`, `checked_out_by`, `checked_out_to_user_id`, `checked_out_to_user_name`, `checked_out_at`, `expected_return_date`, `checked_in_at`, `return_condition`, `damage_reported`, `damage_description`, `reason`, `notes`, `version`, `status` FROM `checkouts` WHERE `org_id` = ? AND `checked_out_to_user_id` = ? ORDER BY `checked_out_at` DESC LIMIT 500;',
          [effectiveOrgId, userId]
        );
      } else {
        checkouts = await query(
          'SELECT `id`, `org_id`, `branch_id`, `asset_id`, `asset_name`, `asset_code`, `checked_out_by`, `checked_out_to_user_id`, `checked_out_to_user_name`, `checked_out_at`, `expected_return_date`, `checked_in_at`, `return_condition`, `damage_reported`, `damage_description`, `reason`, `notes`, `version`, `status` FROM `checkouts` WHERE `org_id` = ? ORDER BY `checked_out_at` DESC LIMIT 500;',
          [effectiveOrgId]
        );
      }
    }

    // 3. Maintenances: require maintenance:read; BRANCH_MANAGER branch-scoped; USER only own records; scope in SQL
    let maintenances: any[] = [];
    if (hasPermission(role, 'maintenance:read')) {
      if (role === 'BRANCH_MANAGER') {
        if (branchId) {
          maintenances = await query(
            'SELECT `id`, `org_id`, `branch_id`, `asset_id`, `asset_name`, `asset_code`, `reported_by_user_id`, `reported_by`, `type`, `description`, `priority`, `status`, `cost`, `assigned_technician`, `start_date`, `expected_completion`, `actual_completion`, `parts_replaced`, `notes`, `version`, `created_at` FROM `maintenances` WHERE `org_id` = ? AND `branch_id` = ? ORDER BY `created_at` DESC LIMIT 500;',
            [effectiveOrgId, branchId]
          );
        } else {
          maintenances = [];
        }
      } else if (role === 'USER') {
        maintenances = await query(
          'SELECT `id`, `org_id`, `branch_id`, `asset_id`, `asset_name`, `asset_code`, `reported_by_user_id`, `reported_by`, `type`, `description`, `priority`, `status`, `cost`, `assigned_technician`, `start_date`, `expected_completion`, `actual_completion`, `parts_replaced`, `notes`, `version`, `created_at` FROM `maintenances` WHERE `org_id` = ? AND `reported_by_user_id` = ? ORDER BY `created_at` DESC LIMIT 500;',
          [effectiveOrgId, userId]
        );
      } else {
        maintenances = await query(
          'SELECT `id`, `org_id`, `branch_id`, `asset_id`, `asset_name`, `asset_code`, `reported_by_user_id`, `reported_by`, `type`, `description`, `priority`, `status`, `cost`, `assigned_technician`, `start_date`, `expected_completion`, `actual_completion`, `parts_replaced`, `notes`, `version`, `created_at` FROM `maintenances` WHERE `org_id` = ? ORDER BY `created_at` DESC LIMIT 500;',
          [effectiveOrgId]
        );
      }
    }

    // 4. Budgets: only with budgets:read
    let budgets: any[] = [];
    if (hasPermission(role, 'budgets:read')) {
      budgets = await query(
        'SELECT `id`, `org_id`, `department_name`, `branch_name`, `fiscal_year`, `allocated`, `spent`, `version`, `created_at` FROM `budgets` WHERE `org_id` = ? ORDER BY `fiscal_year` DESC;',
        [effectiveOrgId]
      );
    }

    // 5. Branches
    const branches = await query(
      'SELECT `id`, `org_id`, `name`, `code`, `location`, `city`, `country`, `manager_name`, `created_at` FROM `branches` WHERE `org_id` = ? ORDER BY `name` ASC;',
      [effectiveOrgId]
    );

    // 6. Departments
    const departments = await query(
      'SELECT `id`, `org_id`, `name`, `head_count`, `budget_allocated`, `created_at` FROM `departments` WHERE `org_id` = ? ORDER BY `name` ASC;',
      [effectiveOrgId]
    );

    // 7. Users: only with users:read (else only self); NEVER password_hash, token_version, two_factor_secret_enc, invite_token_hash, reset_token_hash
    let rawUsers: any[] = [];
    if (hasPermission(role, 'users:read')) {
      rawUsers = await query(
        'SELECT `id`, `org_id`, `email`, `full_name`, `role`, `department_id`, `department_name`, `branch_id`, `branch_name`, `two_factor_enabled`, `avatar`, `status`, `invited_at`, `version`, `created_at` FROM `users` WHERE `org_id` = ? AND `status` != \'DELETED\';',
        [effectiveOrgId]
      );
    } else {
      rawUsers = await query(
        'SELECT `id`, `org_id`, `email`, `full_name`, `role`, `department_id`, `department_name`, `branch_id`, `branch_name`, `two_factor_enabled`, `avatar`, `status`, `invited_at`, `version`, `created_at` FROM `users` WHERE `id` = ?;',
        [userId]
      );
    }

    // 8. Organizations: ONLY caller's own org (all orgs only for super admin)
    let rawOrgs: any[] = [];
    if (req.auth!.isSuperAdmin) {
      rawOrgs = await query(
        'SELECT `id`, `name`, `type`, `logo`, `branding_color`, `branches_count` FROM `organizations` ORDER BY `name` ASC;'
      );
    } else {
      rawOrgs = await query(
        'SELECT `id`, `name`, `type`, `logo`, `branding_color`, `branches_count` FROM `organizations` WHERE `id` = ?;',
        [effectiveOrgId]
      );
    }

    // 9. Audit Logs: use hasPermission(role, 'audit:read'), org scoped
    let auditLogs: any[] = [];
    if (hasPermission(role, 'audit:read')) {
      auditLogs = await query(
        'SELECT `id`, `seq`, `org_id`, `actor_id`, `user_name`, `user_role`, `action`, `entity_type`, `entity_id`, `entity_name`, `changes`, `ip_address`, `timestamp`, `prev_hash`, `hash` FROM `audit_logs` WHERE `org_id` = ? ORDER BY `timestamp` DESC LIMIT 200;',
        [effectiveOrgId]
      );
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
      status: u.status || 'ACTIVE',
      invitedAt: u.invited_at || undefined,
      // Needed by the client to send baseVersion with user edits (optimistic concurrency).
      version: Number(u.version || 1),
      createdAt: u.created_at
    }));

    const sanitizedOrgs = rawOrgs.map((o: any) => ({
      id: o.id,
      name: o.name,
      type: o.type || 'Enterprise',
      logo: o.logo || '🏢',
      brandingColor: o.branding_color || '#10b981',
      branchesCount: o.branches_count || 1
    }));

    const responsePayload = {
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
    };

    // ETag caching support
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(responsePayload))
      .digest('hex');
    const etag = `"${payloadHash}"`;

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, no-cache');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.json(responsePayload);
  })
);

// 12. Serve frontend static assets in production if dist directory exists
const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req: Request, res: Response) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distDir, 'index.html'));
    }
  });
}

// 13. API 404 handler for unhandled /api/* endpoints
app.all('/api/*', (req: Request, res: Response) => {
  const requestId = (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID();
  res.status(404).json({
    error: `API endpoint not found: ${req.method} ${req.path}`,
    code: 'NOT_FOUND',
    requestId
  });
});

// 14. Central Express Error Handling Middleware (Catches all async & sync rejections)
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID();
  const statusCode =
    typeof err.statusCode === 'number'
      ? err.statusCode
      : typeof err.status === 'number'
      ? err.status
      : 500;

  // Log full error details server-side only
  console.error(`[ERROR] RequestId: ${requestId} - ${req.method} ${req.originalUrl}:`, err);

  const isServerFault = statusCode >= 500;
  const errorCode = err.code || (isServerFault ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');
  const isExposed = err instanceof HttpError ? err.expose : (!isServerFault && Boolean(err.message));
  const clientMessage = isExposed
    ? err.message
    : 'An internal server error occurred. Please contact system support.';

  res.status(statusCode).json({
    error: clientMessage,
    code: errorCode,
    requestId
  });
});

// Process-level unhandled rejection & uncaught exception logging with clean exit
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('[FATAL] Unhandled Promise Rejection at:', promise, 'reason:', reason);
  // Do not call process.exit(1) in serverless / Vercel container or during test execution
  if (!config.isTest && !config.isVercel && process.env.VERCEL !== '1') {
    process.exit(1);
  }
});

process.on('uncaughtException', (err: Error) => {
  console.error('[FATAL] Uncaught Exception thrown:', err);
  // Do not call process.exit(1) in serverless / Vercel container or during test execution
  if (!config.isTest && !config.isVercel && process.env.VERCEL !== '1') {
    process.exit(1);
  }
});

const PORT = config.PORT;

// Rely strictly on config.isTest (NODE_ENV === 'test')
if (!config.isTest && !config.isVercel) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 OmniAsset TiDB API Gateway listening on port ${PORT}`);
  });
}

export default app;
