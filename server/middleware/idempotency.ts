import { Request, Response, NextFunction } from 'express';
import { query } from '../db';

interface InFlightResult {
  status: number;
  body: any;
}

const inFlightMap = new Map<string, Promise<InFlightResult>>();

/**
 * Idempotency Middleware for API Mutations
 * Deduplicates repeated requests that carry an Idempotency-Key header.
 * If a matching request has already succeeded or completed, returns the cached
 * response immediately without re-executing business logic or creating duplicate audit entries.
 * In-flight lock deduplicates concurrent parallel bursts sharing the exact same key.
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

  // 1. Check in-flight concurrent requests lock
  const existingInFlight = inFlightMap.get(trimmedKey);
  if (existingInFlight) {
    try {
      const inFlightRes = await existingInFlight;
      res.setHeader('X-Cache-Lookup', 'HIT-IN-FLIGHT');
      res.setHeader('Idempotency-Key', trimmedKey);
      res.status(inFlightRes.status).json(inFlightRes.body);
      return;
    } catch (err: any) {
      console.warn('In-flight idempotency resolution error:', err.message);
    }
  }

  // Claim in-flight lock SYNCHRONOUSLY before any async await statement
  let resolveInFlight!: (result: InFlightResult) => void;
  const inFlightPromise = new Promise<InFlightResult>((resolve) => {
    resolveInFlight = resolve;
  });
  inFlightMap.set(trimmedKey, inFlightPromise);

  const cleanupInFlight = () => {
    if (inFlightMap.get(trimmedKey) === inFlightPromise) {
      inFlightMap.delete(trimmedKey);
    }
  };

  res.on('finish', cleanupInFlight);
  res.on('close', cleanupInFlight);

  try {
    // 2. Look up cached response by primary key from persistent store
    const existing = await query<any>(
      'SELECT `org_id`, `response_status`, `response_body` FROM `idempotency_keys` WHERE `key` = ? LIMIT 1;',
      [trimmedKey]
    );

    if (existing && existing.length > 0) {
      const cached = existing[0];
      // Tenant boundary guard: if authenticated, verify matching tenant
      if (req.auth?.orgId && cached.org_id && cached.org_id !== 'public' && cached.org_id !== req.auth.orgId) {
        cleanupInFlight();
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

      const status = Number(cached.response_status);
      resolveInFlight({ status, body: parsedBody });
      res.status(status).json(parsedBody);
      return;
    }
  } catch (err: any) {
    console.warn('Idempotency lookup warning:', err.message);
  }

  // 3. Intercept response to capture and persist status and body
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = function (body: any): Response {
    try {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      const status = res.statusCode || 200;
      const effectiveOrgId = req.auth?.orgId || orgId || 'public';
      saveIdempotencyKey(trimmedKey, effectiveOrgId, clientId, clientSeq, status, bodyStr);
      resolveInFlight({ status, body });
      res.setHeader('Idempotency-Key', trimmedKey);
    } catch (saveErr) {
      console.warn('Failed to capture idempotency json:', saveErr);
      resolveInFlight({ status: res.statusCode || 200, body });
    }
    return originalJson(body);
  };

  res.send = function (body: any): Response {
    try {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      const status = res.statusCode || 200;
      saveIdempotencyKey(trimmedKey, orgId, clientId, clientSeq, status, bodyStr);
      resolveInFlight({ status, body });
      res.setHeader('Idempotency-Key', trimmedKey);
    } catch (saveErr) {
      console.warn('Failed to capture idempotency send:', saveErr);
      resolveInFlight({ status: res.statusCode || 200, body });
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
