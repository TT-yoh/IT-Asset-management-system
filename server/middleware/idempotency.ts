import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import config from '../config';
import { query, QueryExecutor } from '../db';

export interface IdempotencyOptions {
  ttlHours?: number; // default: 24
  cacheStatuses?: number[]; // default: [200, 201, 202, 204]
  storeBody?: boolean; // default: true
  required?: boolean; // default: false (or config.IDEMPOTENCY_REQUIRED)
}

export interface IdempotencyContext {
  orgId: string;
  userId: string;
  key: string;
  requestHash: string;
  isCompleted: boolean;
  complete: (tx: QueryExecutor | null, status: number, body: any, contentType?: string) => Promise<void>;
}

declare global {
  namespace Express {
    interface Request {
      idempotency?: IdempotencyContext;
    }
  }
}

const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9._:-]{8,128}$/;
const MAX_CACHED_BODY_BYTES = 256 * 1024; // 256 KB
const LOCK_LEASE_SECONDS = 30;
const WAIT_TIMEOUT_MS = 10000;
const POLL_INTERVAL_MS = 200;

interface InFlightEntry {
  promise: Promise<{ status: number; contentType: string; body: any }>;
  resolve: (res: { status: number; contentType: string; body: any }) => void;
  reject: (err: any) => void;
  requestHash?: string;
}

const inFlightMap = new Map<string, InFlightEntry>();

/**
 * Deterministic JSON stringifier to guarantee identical hashes for structurally equivalent payloads.
 * Recursively sorts keys of objects.
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`).join(',') + '}';
}

/**
 * Computes SHA-256 fingerprint from HTTP method, normalized route, and canonical body.
 */
export function computeRequestFingerprint(method: string, route: string, body: any): string {
  const normMethod = method.toUpperCase();
  const normRoute = route.split('?')[0].replace(/\/+$/, '') || '/';
  const canonicalBody = canonicalJsonStringify(body);
  return crypto
    .createHash('sha256')
    .update(`${normMethod}:${normRoute}:${canonicalBody}`)
    .digest('hex');
}

/**
 * Sanitizes response payload before storing in the database.
 * Strips tokens, passwords, session credentials, and cookies.
 */
export function sanitizeResponseBody(body: any, storeBody: boolean): string {
  if (!storeBody) {
    if (body && typeof body === 'object' && body.id) {
      return JSON.stringify({ id: body.id });
    }
    return '';
  }

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return body.length > MAX_CACHED_BODY_BYTES ? '' : body;
    }
  }

  if (typeof body === 'object' && body !== null) {
    const sanitized = JSON.parse(JSON.stringify(body));
    const sensitiveKeys = [
      'password',
      'password_hash',
      'token',
      'sessionToken',
      'refreshToken',
      'secret',
      'two_factor_secret_enc',
      'recovery_codes',
      'invite_token_hash',
      'reset_token_hash',
      'cookie',
      'authorization'
    ];

    const stripKeys = (target: any) => {
      if (typeof target !== 'object' || target === null) return;
      for (const k of Object.keys(target)) {
        if (sensitiveKeys.some(sk => k.toLowerCase().includes(sk.toLowerCase()))) {
          delete target[k];
        } else if (typeof target[k] === 'object') {
          stripKeys(target[k]);
        }
      }
    };
    stripKeys(sanitized);
    const resultStr = JSON.stringify(sanitized);
    return resultStr.length > MAX_CACHED_BODY_BYTES ? '' : resultStr;
  }

  const str = String(body);
  return str.length > MAX_CACHED_BODY_BYTES ? '' : str;
}

/**
 * Opportunistically purges expired idempotency records (1% probability).
 */
async function opportunisticPurge(): Promise<void> {
  if (Math.random() < 0.01) {
    try {
      await query('DELETE FROM `idempotency_keys_v2` WHERE `expires_at` < NOW() LIMIT 500;');
    } catch {
      // Non-fatal background purge
    }
  }
}

/**
 * Idempotency Middleware Factory (Per-Route Opt-In).
 *
 * Requirements:
 * - Runs strictly AFTER authentication, permissions, and CSRF protection.
 * - Header: only Idempotency-Key (8-128 chars, ^[A-Za-z0-9._:-]+$).
 * - Scoped strictly to (org_id, user_id, idem_key) from session.
 * - Atomic claim protocol: state = 'PROCESSING' with 30s locked_until lease.
 * - Conflict resolution: 422 on payload fingerprint mismatch, replay on COMPLETED,
 *   poll/503 on valid lock, compare-and-swap takeover on expired lock.
 * - Exposes req.idempotency.complete(tx, status, body) for atomic transaction commits.
 */
export function idempotent(options: IdempotencyOptions = {}) {
  const ttlHours = options.ttlHours ?? 24;
  const cacheStatuses = options.cacheStatuses ?? [200, 201, 202, 204];
  const storeBody = options.storeBody ?? true;
  const isRequired = options.required ?? config.IDEMPOTENCY_REQUIRED;

  return async function idempotencyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
    const rawKey = req.headers['idempotency-key'];

    // 1. Missing header handling
    if (!rawKey || typeof rawKey !== 'string' || rawKey.trim().length === 0) {
      if (isRequired) {
        res.status(400).json({
          error: 'Idempotency-Key header is required for this mutation',
          code: 'IDEMPOTENCY_REQUIRED'
        });
        return;
      }
      return next();
    }

    const trimmedKey = rawKey.trim();

    // 2. Format validation (8 to 128 characters, strictly ^[A-Za-z0-9._:-]+$)
    if (!IDEMPOTENCY_KEY_REGEX.test(trimmedKey)) {
      res.status(400).json({
        error: 'Invalid Idempotency-Key header format. Must be 8-128 characters matching ^[A-Za-z0-9._:-]+$',
        code: 'INVALID_IDEMPOTENCY_KEY'
      });
      return;
    }

    // 3. Authentication guard (fail-closed if unauthenticated)
    if (!req.auth || !req.auth.orgId || !req.auth.userId) {
      res.status(401).json({
        error: 'Authentication required for idempotent mutations',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    const orgId = req.auth.orgId;
    const userId = req.auth.userId;
    const compositeKey = `${orgId}:${userId}:${trimmedKey}`;
    const method = req.method.toUpperCase();
    const normalizedRoute = (req.baseUrl + req.path).split('?')[0].replace(/\/+$/, '') || '/';
    const requestHash = computeRequestFingerprint(method, normalizedRoute, req.body);

    // Opportunistic 1% cleanup in background
    opportunisticPurge().catch(() => {});

    // 4. In-process in-flight concurrent burst optimization
    let isInitiator = false;
    let inFlightEntry = inFlightMap.get(compositeKey);

    if (inFlightEntry) {
      if (inFlightEntry.requestHash && inFlightEntry.requestHash !== requestHash) {
        res.status(422).json({
          error: 'Idempotency key reused with different request payload',
          code: 'IDEMPOTENCY_FINGERPRINT_MISMATCH'
        });
        return;
      }

      try {
        const inFlightRes = await Promise.race([
          inFlightEntry.promise,
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), WAIT_TIMEOUT_MS))
        ]);

        if (inFlightRes) {
          res.setHeader('Idempotent-Replayed', 'true');
          res.setHeader('Idempotency-Key', trimmedKey);
          if (inFlightRes.contentType) {
            res.setHeader('Content-Type', inFlightRes.contentType);
          }
          let responseData = inFlightRes.body;
          if (
            typeof responseData === 'string' &&
            (inFlightRes.contentType?.includes('json') || responseData.startsWith('{') || responseData.startsWith('['))
          ) {
            try {
              responseData = JSON.parse(responseData);
            } catch {}
          }
          res.status(inFlightRes.status).send(responseData);
          return;
        }
      } catch (err: any) {
        // Fall through to database authoritative lookup
      }
    } else {
      isInitiator = true;
      let resolveInFlight!: (res: { status: number; contentType: string; body: any }) => void;
      let rejectInFlight!: (err: any) => void;
      const inFlightPromise = new Promise<{ status: number; contentType: string; body: any }>((resolve, reject) => {
        resolveInFlight = resolve;
        rejectInFlight = reject;
      });
      inFlightPromise.catch(() => {});
      inFlightEntry = { promise: inFlightPromise, resolve: resolveInFlight, reject: rejectInFlight, requestHash };
      inFlightMap.set(compositeKey, inFlightEntry);
    }

    // 5. Atomic Claim Protocol against Database (Fail-Closed)
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + LOCK_LEASE_SECONDS * 1000);
    const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000);

    const formatDbDate = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
    const lockedUntilStr = formatDbDate(lockedUntil);
    const nowStr = formatDbDate(now);
    const expiresAtStr = formatDbDate(expiresAt);

    let isClaimOwner = false;

    try {
      await query(
        `INSERT INTO \`idempotency_keys_v2\` (
          \`org_id\`, \`user_id\`, \`idem_key\`, \`method\`, \`route\`, \`request_hash\`,
          \`state\`, \`locked_until\`, \`created_at\`, \`expires_at\`
        ) VALUES (?, ?, ?, ?, ?, ?, 'PROCESSING', ?, ?, ?);`,
        [orgId, userId, trimmedKey, method, normalizedRoute, requestHash, lockedUntilStr, nowStr, expiresAtStr]
      );
      isClaimOwner = true;
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
        // Key exists: evaluate duplicate / conflict / lock state
        isClaimOwner = false;
        if (isInitiator) {
          inFlightMap.delete(compositeKey);
        }
      } else {
        if (isInitiator) {
          inFlightMap.delete(compositeKey);
        }
        console.error('[IDEMPOTENCY] Claim insertion database error:', err.message);
        res.setHeader('Retry-After', '1');
        res.status(503).json({
          error: 'Idempotency service temporarily unavailable',
          code: 'IDEMPOTENCY_UNAVAILABLE'
        });
        return;
      }
    }

    // 6. Handle Existing Key on ER_DUP_ENTRY
    if (!isClaimOwner) {
      try {
        const rows = await query<any>(
          'SELECT `request_hash`, `state`, `response_status`, `response_content_type`, `response_body`, `locked_until` FROM `idempotency_keys_v2` WHERE `org_id` = ? AND `user_id` = ? AND `idem_key` = ? LIMIT 1;',
          [orgId, userId, trimmedKey]
        );

        if (rows.length === 0) {
          // Row was deleted or rolled back by aborted previous request; fail closed with retry
          res.setHeader('Retry-After', '1');
          res.status(503).json({
            error: 'Request is currently being processed',
            code: 'IDEMPOTENCY_IN_PROGRESS'
          });
          return;
        }

        const existing = rows[0];

        // 6.1 Fingerprint Mismatch Check (HTTP 422)
        if (existing.request_hash !== requestHash) {
          res.status(422).json({
            error: 'Idempotency key reused with different request payload',
            code: 'IDEMPOTENCY_FINGERPRINT_MISMATCH'
          });
          return;
        }

        // 6.2 COMPLETED State: Replay Original Response
        if (existing.state === 'COMPLETED') {
          res.setHeader('Idempotent-Replayed', 'true');
          res.setHeader('Idempotency-Key', trimmedKey);
          if (existing.response_content_type) {
            res.setHeader('Content-Type', existing.response_content_type);
          }

          let responseData = existing.response_body;
          if (typeof responseData === 'string' && (existing.response_content_type?.includes('json') || responseData.startsWith('{') || responseData.startsWith('['))) {
            try {
              responseData = JSON.parse(responseData);
            } catch {
              // Keep raw string if parsing fails
            }
          }

          res.status(Number(existing.response_status) || 200).send(responseData);
          return;
        }

        // 6.3 PROCESSING State: Evaluate Lease Lock & Poll
        const lockExpiration = new Date(existing.locked_until).getTime();
        const currentTime = Date.now();

        if (lockExpiration > currentTime) {
          // Lock is actively held: Poll database up to WAIT_TIMEOUT_MS
          const pollStartTime = Date.now();
          while (Date.now() - pollStartTime < WAIT_TIMEOUT_MS) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            const pollRows = await query<any>(
              'SELECT `state`, `response_status`, `response_content_type`, `response_body`, `locked_until` FROM `idempotency_keys_v2` WHERE `org_id` = ? AND `user_id` = ? AND `idem_key` = ? LIMIT 1;',
              [orgId, userId, trimmedKey]
            );

            if (pollRows.length > 0) {
              const currentPoll = pollRows[0];
              if (currentPoll.state === 'COMPLETED') {
                res.setHeader('Idempotent-Replayed', 'true');
                res.setHeader('Idempotency-Key', trimmedKey);
                if (currentPoll.response_content_type) {
                  res.setHeader('Content-Type', currentPoll.response_content_type);
                }

                let pollData = currentPoll.response_body;
                if (typeof pollData === 'string' && (currentPoll.response_content_type?.includes('json') || pollData.startsWith('{') || pollData.startsWith('['))) {
                  try {
                    pollData = JSON.parse(pollData);
                  } catch {}
                }
                res.status(Number(currentPoll.response_status) || 200).send(pollData);
                return;
              }
            }
          }

          // Polling timed out while still PROCESSING
          res.setHeader('Retry-After', '1');
          res.status(503).json({
            error: 'Request is currently being processed',
            code: 'IDEMPOTENCY_IN_PROGRESS'
          });
          return;
        } else {
          // Lock has expired: Attempt compare-and-swap takeover
          const takeoverResult = await query(
            `UPDATE \`idempotency_keys_v2\`
             SET \`state\` = 'PROCESSING',
                 \`method\` = ?,
                 \`route\` = ?,
                 \`request_hash\` = ?,
                 \`locked_until\` = ?,
                 \`expires_at\` = ?
             WHERE \`org_id\` = ? AND \`user_id\` = ? AND \`idem_key\` = ? AND \`locked_until\` = ?;`,
            [method, normalizedRoute, requestHash, lockedUntilStr, expiresAtStr, orgId, userId, trimmedKey, existing.locked_until]
          );

          const affected = (takeoverResult as any)?.affectedRows ?? 0;
          if (affected === 1) {
            isClaimOwner = true;
            inFlightMap.set(compositeKey, inFlightEntry);
          } else {
            // Concurrent process acquired takeover
            res.setHeader('Retry-After', '1');
            res.status(503).json({
              error: 'Request is currently being processed',
              code: 'IDEMPOTENCY_IN_PROGRESS'
            });
            return;
          }
        }
      } catch (lookupErr: any) {
        console.error('[IDEMPOTENCY] Conflict resolution error:', lookupErr.message);
        res.setHeader('Retry-After', '1');
        res.status(503).json({
          error: 'Idempotency service temporarily unavailable',
          code: 'IDEMPOTENCY_UNAVAILABLE'
        });
        return;
      }
    }

    // 7. Attach Idempotency Context to Request
    let isCompleted = false;

    const completeContext = async (tx: QueryExecutor | null, status: number, body: any, contentType: string = 'application/json'): Promise<void> => {
      if (isCompleted) return;
      isCompleted = true;

      const sanitizedBodyStr = sanitizeResponseBody(body, storeBody);
      const executeQuery = tx || query;

      try {
        await executeQuery(
          `UPDATE \`idempotency_keys_v2\`
           SET \`state\` = 'COMPLETED',
               \`response_status\` = ?,
               \`response_content_type\` = ?,
               \`response_body\` = ?
           WHERE \`org_id\` = ? AND \`user_id\` = ? AND \`idem_key\` = ?;`,
          [status, contentType, sanitizedBodyStr, orgId, userId, trimmedKey]
        );
      } catch (compErr: any) {
        console.error('[IDEMPOTENCY] Transactional completion update warning:', compErr.message);
      }

      // Notify in-process in-flight waiters
      if (inFlightEntry) {
        inFlightEntry.resolve({ status, contentType, body });
      }
      inFlightMap.delete(compositeKey);
    };

    req.idempotency = {
      orgId,
      userId,
      key: trimmedKey,
      requestHash,
      get isCompleted() {
        return isCompleted;
      },
      complete: completeContext
    };

    // 8. Single Capture Point Hooking res.send
    const originalSend = res.send.bind(res);
    let capturedBody: any = null;

    res.send = function (body?: any): Response {
      capturedBody = body;
      res.setHeader('Idempotency-Key', trimmedKey);
      return originalSend(body);
    };

    // 9. Finish / Close Event Handlers
    const cleanupClaimOnFailure = async () => {
      inFlightMap.delete(compositeKey);
      if (inFlightEntry) {
        inFlightEntry.reject(new Error('REQUEST_FAILED_OR_ABORTED'));
      }
      try {
        await query(
          'DELETE FROM `idempotency_keys_v2` WHERE `org_id` = ? AND `user_id` = ? AND `idem_key` = ? AND `state` = \'PROCESSING\';',
          [orgId, userId, trimmedKey]
        );
      } catch {
        // Non-fatal cleanup
      }
    };

    res.on('finish', async () => {
      if (isCompleted) {
        inFlightMap.delete(compositeKey);
        return;
      }

      const statusCode = res.statusCode || 200;

      if (cacheStatuses.includes(statusCode)) {
        // Success status: persist COMPLETED record
        const contentType = String(res.getHeader('content-type') || 'application/json');
        await completeContext(null, statusCode, capturedBody, contentType);
      } else {
        // Non-cacheable response (401, 403, 409, 429, 5xx): delete claim so retries are permitted
        await cleanupClaimOnFailure();
      }
    });

    res.on('close', async () => {
      if (!res.writableEnded && !isCompleted) {
        // Aborted connection before response finished
        await cleanupClaimOnFailure();
      }
    });

    next();
  };
}

/**
 * Legacy export for backwards compatibility during migration.
 */
export const idempotencyMiddleware = idempotent();
