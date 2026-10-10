import { Request, Response, NextFunction } from 'express';
import { verifySessionToken } from './auth';
import { AuthContextPayload, UserRole, PermissionAction, hasPermission } from './permissions';

// Extend Express Request interface to include authenticated session payload
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContextPayload;
    }
  }
}

/**
 * Lightweight cookie parser for session cookies
 */
export function cookieParserMiddleware(req: Request, res: Response, next: NextFunction) {
  const cookieHeader = req.headers.cookie;
  const cookies: Record<string, string> = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach(part => {
      const [key, val] = part.trim().split('=');
      if (key && val) {
        cookies[key] = decodeURIComponent(val);
      }
    });
  }
  (req as any).cookies = cookies;
  next();
}

/**
 * Authentication middleware:
 * Extracts session token from httpOnly cookie or Authorization Bearer header.
 * Attaches cryptographically verified `req.auth` session context.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const cookieToken = (req as any).cookies?.session_token;
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;

  const token = cookieToken || headerToken;

  if (!token) {
    res.status(401).json({ error: 'Authentication required. No session cookie provided.' });
    return;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid signature. Please log in again.' });
    return;
  }

  req.auth = {
    userId: payload.userId,
    orgId: payload.orgId,
    email: payload.email,
    fullName: payload.fullName,
    role: payload.role,
    branchId: payload.branchId,
    branchName: payload.branchName
  };

  next();
}

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
