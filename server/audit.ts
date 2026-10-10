import crypto from 'crypto';
import { QueryExecutor, query } from './db';

export const GENESIS_PREV_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export interface AuditRecordPayload {
  org_id: string;
  seq: number;
  actor_id: string;
  role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  timestamp: string;
  changes: any;
  prev_hash: string;
}

export interface StoredAuditLog extends AuditRecordPayload {
  id: string;
  user_name: string;
  user_role: string;
  entity_name: string;
  hash: string;
  ip_address: string;
}

export interface AuditVerificationResult {
  valid: boolean;
  orgId: string;
  totalRecords: number;
  chainLength: number;
  genesisHash: string;
  latestHash: string;
  brokenAtSeq?: number;
  errors: string[];
}

/**
 * Normalizes ISO timestamps to standard second-level precision (UTC)
 * ensuring exact byte matching between write and DB round-trip retrieval.
 */
export function normalizeAuditTimestamp(ts: any): string {
  if (ts instanceof Date) {
    return ts.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  let str = String(ts || '').trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str)) {
    return str.replace(' ', 'T').replace(/\.\d+$/, '') + 'Z';
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) {
    return str.replace(/\.\d+Z$/, 'Z').replace(/Z$/, '') + 'Z';
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  return str;
}

/**
 * Deterministically serialize any JavaScript value into canonical JSON.
 * Keys in objects are sorted in lexicographical order.
 */
export function canonicalJsonStringify(val: any): string {
  if (val === null || val === undefined) {
    return 'null';
  }
  if (typeof val === 'number') {
    if (!isFinite(val)) return 'null';
    return String(val);
  }
  if (typeof val === 'boolean') {
    return val ? 'true' : 'false';
  }
  if (typeof val === 'string') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalJsonStringify).join(',') + ']';
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val).sort();
    const entries = keys.map(k => `${JSON.stringify(k)}:${canonicalJsonStringify(val[k])}`);
    return '{' + entries.join(',') + '}';
  }
  return JSON.stringify(val);
}

/**
 * Computes canonical SHA-256 hash across the 10 core audit chain properties.
 */
export function computeAuditHash(payload: AuditRecordPayload): string {
  // Normalize changes to a structured value if stringified
  let changesObj = payload.changes;
  if (typeof changesObj === 'string') {
    try {
      changesObj = JSON.parse(changesObj);
    } catch {
      changesObj = { raw: payload.changes };
    }
  }

  const canonicalObj = {
    action: payload.action,
    actor_id: payload.actor_id || '',
    changes: changesObj,
    entity_id: payload.entity_id || '',
    entity_type: payload.entity_type,
    org_id: payload.org_id,
    prev_hash: payload.prev_hash,
    role: payload.role,
    seq: Number(payload.seq),
    timestamp: normalizeAuditTimestamp(payload.timestamp)
  };

  const canonicalSerialized = canonicalJsonStringify(canonicalObj);
  // Temporary debug
  if (process.env.DEBUG_AUDIT) {
    console.log('[DEBUG CANONICAL]:', canonicalSerialized);
  }
  return crypto.createHash('sha256').update(canonicalSerialized, 'utf8').digest('hex');
}

/**
 * Records an immutable audit event in the database using the provided query executor
 * (enabling transactional inclusion within business mutations).
 */
export async function recordAuditEvent(
  executor: QueryExecutor,
  params: {
    orgId: string;
    actorId: string;
    userName: string;
    role: string;
    action: string;
    entityType: string;
    entityId: string;
    entityName: string;
    changes: any;
    ipAddress?: string;
    timestamp?: string;
  }
): Promise<StoredAuditLog> {
  const { orgId, actorId, userName, role, action, entityType, entityId, entityName, changes } = params;
  const ipAddress = params.ipAddress || '127.0.0.1';
  const timestamp = normalizeAuditTimestamp(params.timestamp || new Date());

  // Find latest sequence and hash for this tenant
  const lastLogs = await executor<any>(
    'SELECT `seq`, `hash` FROM `audit_logs` WHERE `org_id` = ? ORDER BY `seq` DESC LIMIT 1;',
    [orgId]
  );

  let seq = 1;
  let prev_hash = GENESIS_PREV_HASH;

  if (lastLogs && lastLogs.length > 0) {
    seq = Number(lastLogs[0].seq) + 1;
    prev_hash = lastLogs[0].hash || GENESIS_PREV_HASH;
  }

  const hash = computeAuditHash({
    org_id: orgId,
    seq,
    actor_id: actorId,
    role,
    action,
    entity_type: entityType,
    entity_id: entityId,
    timestamp,
    changes,
    prev_hash
  });

  const id = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const changesJsonStr = canonicalJsonStringify(
    typeof changes === 'string' ? { detail: changes } : changes
  );

  await executor(`
    INSERT INTO \`audit_logs\` (
      \`id\`, \`org_id\`, \`seq\`, \`actor_id\`, \`user_name\`, \`user_role\`,
      \`action\`, \`entity_type\`, \`entity_id\`, \`entity_name\`,
      \`changes\`, \`timestamp\`, \`prev_hash\`, \`hash\`, \`ip_address\`
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `, [
    id,
    orgId,
    seq,
    actorId,
    userName,
    role,
    action,
    entityType,
    entityId,
    entityName,
    changesJsonStr,
    timestamp,
    prev_hash,
    hash,
    ipAddress
  ]);

  return {
    id,
    org_id: orgId,
    seq,
    actor_id: actorId,
    user_name: userName,
    user_role: role,
    role,
    action,
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    changes: changesJsonStr,
    timestamp,
    prev_hash,
    hash,
    ip_address: ipAddress
  };
}

/**
 * Validates the cryptographic integrity of the entire audit hash chain for an organization.
 * Flags any sequence gaps, broken links (prev_hash mismatches), or content tampering (hash mismatches).
 */
export async function verifyAuditChain(orgId: string): Promise<AuditVerificationResult> {
  const logs = await query<any>(
    'SELECT * FROM `audit_logs` WHERE `org_id` = ? ORDER BY `seq` ASC;',
    [orgId]
  );

  const errors: string[] = [];

  if (logs.length === 0) {
    return {
      valid: true,
      orgId,
      totalRecords: 0,
      chainLength: 0,
      genesisHash: GENESIS_PREV_HASH,
      latestHash: GENESIS_PREV_HASH,
      errors: []
    };
  }

  let expectedPrevHash = GENESIS_PREV_HASH;
  let brokenAtSeq: number | undefined;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const expectedSeq = i + 1;
    const currentSeq = Number(log.seq);

    // 1. Validate sequence monotonicity
    if (currentSeq !== expectedSeq) {
      const err = `Sequence gap detected at record ${log.id}: expected seq ${expectedSeq}, got ${currentSeq}`;
      errors.push(err);
      if (!brokenAtSeq) brokenAtSeq = currentSeq;
    }

    // 2. Validate prev_hash pointer link
    if (log.prev_hash !== expectedPrevHash) {
      const err = `Broken chain pointer at seq ${currentSeq}: expected prev_hash "${expectedPrevHash}", got "${log.prev_hash}"`;
      errors.push(err);
      if (!brokenAtSeq) brokenAtSeq = currentSeq;
    }

    // 3. Parse changes and recompute expected SHA-256 hash
    let parsedChanges = log.changes;
    if (typeof parsedChanges === 'string') {
      try {
        parsedChanges = JSON.parse(parsedChanges);
      } catch {
        parsedChanges = { raw: log.changes };
      }
    }

    const recomputedHash = computeAuditHash({
      org_id: log.org_id,
      seq: currentSeq,
      actor_id: log.actor_id || '',
      role: log.user_role || log.role || 'USER',
      action: log.action,
      entity_type: log.entity_type,
      entity_id: log.entity_id || '',
      timestamp: log.timestamp,
      changes: parsedChanges,
      prev_hash: log.prev_hash
    });

    if (recomputedHash !== log.hash) {
      const err = `Tampered content at seq ${currentSeq}: stored hash "${log.hash}", recomputed hash "${recomputedHash}"`;
      errors.push(err);
      if (!brokenAtSeq) brokenAtSeq = currentSeq;
    }

    expectedPrevHash = log.hash;
  }

  return {
    valid: errors.length === 0,
    orgId,
    totalRecords: logs.length,
    chainLength: logs.length,
    genesisHash: logs[0].prev_hash || GENESIS_PREV_HASH,
    latestHash: logs[logs.length - 1].hash,
    brokenAtSeq,
    errors
  };
}
