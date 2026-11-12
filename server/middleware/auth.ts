import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from './asyncHandler';
import config from '../config';
import { verifySessionToken, createSessionToken, SESSION_TTL_SECONDS } from '../auth';
import { AuthContextPayload, UserRole, PermissionAction, hasPermission } from '../permissions';
import { query } from '../db';

// Extend Express Request interface to include authenticated session payload
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContextPayload;
    }
  }
}

/**
 * Robust cookie parser:
 * - Splits on FIRST '=' per cookie pair.
 * - Trims whitespace and strips surrounding quotes.
 * - Wraps decodeURIComponent in try/catch (never throws on malformed encoding).
 */
export function cookieParserMiddleware(req: Request, _res: Response, next: NextFunction) {
  const cookieHeader = req.headers.cookie;
  const cookies: Record<string, string> = {};

  if (cookieHeader && typeof cookieHeader === 'string') {
    const pairs = cookieHeader.split(';');
    for (const pair of pairs) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }

  (req as any).cookies = cookies;
  next();
}

// In-memory cache for loaded users during authentication (TTL <= 30 seconds)
interface CachedUser {
  id: string;
  org_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  branch_id: string | null;
  branch_name: string | null;
  status: string;
  token_version: number;
  is_super_admin: number | boolean;
  cachedAt: number;
}

const userCache = new Map<string, CachedUser>();
const USER_CACHE_TTL_MS = 30 * 1000; // 30 seconds

export function invalidateUserCache(userId?: string) {
  if (userId) {
    userCache.delete(userId);
  } else {
    userCache.clear();
  }
}

/**
 * CSRF Protection Middleware:
 * For mutating requests (POST, PUT, PATCH, DELETE) authenticated via cookie:
 * Requires custom header (X-Requested-With) AND Origin/Referer verification against CORS_ORIGINS.
 * Bearer-token requests are exempt.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutatingMethods.includes(req.method.toUpperCase())) {
    return next();
  }

  // Bearer-header requests are exempt
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return next();
  }

  const cookieToken = (req as any).cookies?.session_token;
  if (!cookieToken) {
    // Unauthenticated request (e.g. initial login, register)
    return next();
  }

  // 1. Require custom header X-Requested-With
  const xRequestedWith = req.headers['x-requested-with'];
  if (!xRequestedWith || typeof xRequestedWith !== 'string' || !xRequestedWith.trim()) {
    res.status(403).json({ error: 'CSRF validation failed: X-Requested-With header is required.' });
    return;
  }

  // 2. Validate Origin or Referer against CORS_ORIGINS
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (origin) {
    if (!config.CORS_ORIGINS.includes(origin)) {
      res.status(403).json({ error: 'CSRF validation failed: Origin header is not in allowed origins.' });
      return;
    }
  } else if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!config.CORS_ORIGINS.includes(refOrigin)) {
        res.status(403).json({ error: 'CSRF validation failed: Referer origin is not in allowed origins.' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'CSRF validation failed: Malformed Referer header.' });
      return;
    }
  } else if (config.isProduction) {
    res.status(403).json({ error: 'CSRF validation failed: Missing Origin or Referer header in production.' });
    return;
  }

  next();
}

/**
 * Authentication middleware:
 * Extracts session token from httpOnly cookie or Authorization Bearer header.
 * Verifies token signature & exp, then LOADS user from DB (or <= 30s cache).
 * Rejects if missing, status != ACTIVE, or token_version mismatch.
 * Authorization strictly uses freshly loaded role/org/branch, NOT token claims.
 * Performs sliding session refresh when less than 30 minutes remain of TTL.
 */
export const authenticate = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const cookieToken = (req as any).cookies?.session_token;
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;

  const token = cookieToken || headerToken;

  if (!token) {
    res.status(401).json({ error: 'Authentication required. No session cookie provided.' });
    return;
  }

  const claims = verifySessionToken(token);
  if (!claims) {
    res.status(401).json({ error: 'Session expired or invalid signature. Please log in again.' });
    return;
  }

  const now = Date.now();
  let user = userCache.get(claims.userId);

  if (!user || now - user.cachedAt > USER_CACHE_TTL_MS) {
    const rows = await query<any>(
      'SELECT `id`, `org_id`, `email`, `full_name`, `role`, `branch_id`, `branch_name`, `status`, `token_version`, `is_super_admin` FROM `users` WHERE `id` = ? LIMIT 1;',
      [claims.userId]
    );

    if (rows.length === 0) {
      res.status(401).json({ error: 'User account not found or has been deleted.' });
      return;
    }

    user = {
      id: rows[0].id,
      org_id: rows[0].org_id,
      email: rows[0].email,
      full_name: rows[0].full_name,
      role: rows[0].role,
      branch_id: rows[0].branch_id || null,
      branch_name: rows[0].branch_name || null,
      status: rows[0].status || 'ACTIVE',
      token_version: Number(rows[0].token_version || 1),
      is_super_admin: Boolean(rows[0].is_super_admin),
      cachedAt: now
    };

    userCache.set(claims.userId, user);
  }

  // Reject if status is not ACTIVE
  if (user.status !== 'ACTIVE') {
    res.status(401).json({ error: 'Account is not active or has been suspended.' });
    return;
  }

  // Reject if token_version mismatch
  if (Number(user.token_version) !== Number(claims.ver)) {
    res.status(401).json({ error: 'Session has been invalidated. Please log in again.' });
    return;
  }

  // Authorization uses freshly loaded DB data, NOT token claims!
  req.auth = {
    userId: user.id,
    orgId: user.org_id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    branchId: user.branch_id || '',
    branchName: user.branch_name || '',
    isSuperAdmin: Boolean(user.is_super_admin)
  };

  // Sliding session refresh: if authenticated by cookie and < 30 mins remaining
  const currentEpoch = Math.floor(now / 1000);
  if (cookieToken && claims.exp - currentEpoch < 30 * 60) {
    const refreshedToken = createSessionToken({ userId: user.id, ver: user.token_version });
    res.cookie('session_token', refreshedToken, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS * 1000
    });
  }

  next();
});

/**
 * Role authorization guard
 */
export function requireRoles(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Unauthenticated.' });
      return;
    }

    if (!allowedRoles.includes(req.auth.role)) {
      res.status(403).json({
        error: `Forbidden. Role "${req.auth.role}" does not have permission for this resource.`
      });
      return;
    }

    next();
  };
}

/**
 * Permission action guard based on RBAC matrix
 */
export function requirePermission(action: PermissionAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Unauthenticated.' });
      return;
    }

    if (!hasPermission(req.auth.role, action)) {
      res.status(403).json({
        error: `Forbidden. Role "${req.auth.role}" lacks "${action}" permission.`
      });
      return;
    }

    next();
  };
}

/**
 * Super Admin authorization guard
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    res.status(401).json({ error: 'Unauthenticated.' });
    return;
  }

  if (!req.auth.isSuperAdmin) {
    res.status(403).json({ error: 'Forbidden. Super admin privileges required.' });
    return;
  }

  next();
}

