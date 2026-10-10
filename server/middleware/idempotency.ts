import { Request, Response, NextFunction } from 'express';
import { query } from '../db';

/**
 * Idempotency Middleware for API Mutations
 * Deduplicates repeated requests that carry an Idempotency-Key header.
 * If a matching request has already succeeded or completed, returns the cached
 * response immediately without re-executing business logic or creating duplicate audit entries.
 */
export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Only apply to mutating HTTP methods
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const rawKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  if (!rawKey || typeof rawKey !== 'string' || rawKey.trim().length === 0) {
    return next();
  }

  const trimmedKey = rawKey.trim();
  const orgId = req.auth?.orgId || 'public';
  const clientId = (req.headers['x-client-id'] as string) || 'client-unknown';
  const clientSeq = Number(req.headers['x-client-seq']) || 1;

  try {
    // 1. Look up cached response by primary key
    const existing = await query<any>(
      'SELECT `org_id`, `response_status`, `response_body` FROM `idempotency_keys` WHERE `key` = ? LIMIT 1;',
      [trimmedKey]
    );

    if (existing && existing.length > 0) {
      const cached = existing[0];
      // Tenant boundary guard: if authenticated, verify matching tenant
      if (req.auth?.orgId && cached.org_id && cached.org_id !== 'public' && cached.org_id !== req.auth.orgId) {
        return next();
      }

      res.setHeader('X-Cache-Lookup', 'HIT');
      res.setHeader('Idempotency-Key', trimmedKey);

      let parsedBody: any;
      try {
        parsedBody = JSON.parse(cached.response_body);
      } catch {
        parsedBody = cached.response_body;
      }

      res.status(Number(cached.response_status)).json(parsedBody);
      return;
    }
  } catch (err: any) {
    console.warn('Idempotency lookup warning:', err.message);
  }

  // 2. Intercept response to capture and persist status and body
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = function (body: any): Response {
    try {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      const status = res.statusCode || 200;
      const effectiveOrgId = req.auth?.orgId || orgId || 'public';
      saveIdempotencyKey(trimmedKey, effectiveOrgId, clientId, clientSeq, status, bodyStr);
      res.setHeader('Idempotency-Key', trimmedKey);
    } catch (saveErr) {
      console.warn('Failed to capture idempotency json:', saveErr);
    }
    return originalJson(body);
  };

  res.send = function (body: any): Response {
    try {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      const status = res.statusCode || 200;
      saveIdempotencyKey(trimmedKey, orgId, clientId, clientSeq, status, bodyStr);
      res.setHeader('Idempotency-Key', trimmedKey);
    } catch (saveErr) {
      console.warn('Failed to capture idempotency send:', saveErr);
    }
    return originalSend(body);
  };

  next();
}

async function saveIdempotencyKey(
  key: string,
  orgId: string,
  clientId: string,
  clientSeq: number,
  status: number,
  body: string
) {
  // Only cache non-fatal responses (status < 500)
  if (status >= 500) return;

  try {
    await query(`
      INSERT INTO \`idempotency_keys\` (
        \`key\`, \`org_id\`, \`client_id\`, \`client_seq\`, \`response_status\`, \`response_body\`
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        \`response_status\` = VALUES(\`response_status\`),
        \`response_body\` = VALUES(\`response_body\`);
    `, [key, orgId, clientId, clientSeq, status, body]);
  } catch (err: any) {
    console.warn(`Could not save idempotency record for key ${key}:`, err.message);
  }
}
