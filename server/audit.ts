import crypto from 'crypto';
import { QueryExecutor, query } from './db';
import config from './config';

export const GENESIS_PREV_HASH = 'GENESIS';
export const LEGACY_GENESIS_PREV_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export interface AuditRecordPayload {
  org_id: string;
  seq: number;
  actor_id: string;
  actor_user_id?: string;
  user_name?: string;
  role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string;
  timestamp: string;
  changes: any;
  prev_hash: string;
  hash_version?: string;
  ip_address?: string;
  request_id?: string;
}

export interface StoredAuditLog extends AuditRecordPayload {
  id: string;
  user_name: string;
  user_role: string;
  entity_name: string;
  hash: string;
  hash_version: string;
  ip_address: string;
}

export interface AuditVerificationResult {
  valid: boolean;
  orgId: string;
  checkedCount: number;
  totalRecords: number;
  firstSeq: number;
  lastSeq: number;
  brokenAtSeq: number | null;
  reason: string | null;
  chainLength: number;
  genesisHash: string;
  latestHash: string;
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
 * Keys in objects are sorted in lexicographical order, undefined fields are omitted,
 * null is rendered as 'null', and arrays are serialized recursively.
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
    const keys = Object.keys(val).filter(k => val[k] !== undefined).sort();
    const entries = keys.map(k => `${JSON.stringify(k)}:${canonicalJsonStringify(val[k])}`);
    return '{' + entries.join(',') + '}';
  }
  return JSON.stringify(val);
}

/**
 * Computes canonical HMAC-SHA256 hash (v2) across all 15 audit ledger fields.
 * Canonical string format:
 * org_id|seq|actor_user_id|user_name|role|action|entity_type|entity_id|entity_name|canonical_json(changes)|ip_address|request_id|timestamp_iso|prev_hash|hash_version
 */
export function computeAuditHashV2(
  payload: {
    org_id: string;
    seq: number | string;
    actor_user_id?: string;
    user_name?: string;
    role?: string;
    action: string;
    entity_type: string;
    entity_id?: string;
    entity_name?: string;
    changes: any;
    ip_address?: string;
    request_id?: string;
    timestamp: string;
    prev_hash: string;
    hash_version?: string;
  },
  hmacKey: string
): string {
  const version = payload.hash_version || 'v2';
  let changesObj = payload.changes;
  if (typeof changesObj === 'string') {
    try {
      changesObj = JSON.parse(changesObj);
    } catch {
      changesObj = { raw: payload.changes };
    }
  }

  const canonicalChanges = canonicalJsonStringify(changesObj);
  const parts = [
    String(payload.org_id || ''),
    String(payload.seq),
    String(payload.actor_user_id || ''),
    String(payload.user_name || ''),
    String(payload.role || ''),
    String(payload.action || ''),
    String(payload.entity_type || ''),
    String(payload.entity_id || ''),
    String(payload.entity_name || ''),
    canonicalChanges,
    String(payload.ip_address || '127.0.0.1'),
    String(payload.request_id || ''),
    normalizeAuditTimestamp(payload.timestamp),
    String(payload.prev_hash || ''),
    version
  ];

  const canonicalString = parts.join('|');
  return crypto.createHmac('sha256', hmacKey).update(canonicalString, 'utf8').digest('hex');
}

/**
 * Legacy v1 SHA-256 hash calculation for backwards-compatible verification of older logs.
 */
export function computeAuditHashV1(payload: {
  action: string;
  actor_id?: string;
  changes: any;
  entity_id?: string;
  entity_type: string;
  org_id: string;
  prev_hash: string;
  role: string;
  seq: number;
  timestamp: string;
}): string {
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
  return crypto.createHash('sha256').update(canonicalSerialized, 'utf8').digest('hex');
}

/**
 * Dispatches hash computation to either v2 (HMAC) or legacy v1 (SHA256).
 */
export function computeAuditHash(payload: any, hmacKey?: string): string {
  if (payload.hash_version === 'v1') {
    return computeAuditHashV1({
      action: payload.action,
      actor_id: payload.actor_id || payload.actor_user_id,
      changes: payload.changes,
      entity_id: payload.entity_id,
      entity_type: payload.entity_type,
      org_id: payload.org_id,
      prev_hash: payload.prev_hash,
      role: payload.role || payload.user_role || 'USER',
      seq: Number(payload.seq),
      timestamp: payload.timestamp
    });
  }

  const key = hmacKey || config.AUDIT_HMAC_KEY || config.SESSION_SECRET;
  return computeAuditHashV2(
    {
      org_id: payload.org_id,
      seq: payload.seq,
      actor_user_id: payload.actor_user_id || payload.actor_id,
      user_name: payload.user_name,
      role: payload.role || payload.user_role,
      action: payload.action,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id,
      entity_name: payload.entity_name,
      changes: payload.changes,
      ip_address: payload.ip_address,
      request_id: payload.request_id,
      timestamp: payload.timestamp,
      prev_hash: payload.prev_hash,
      hash_version: payload.hash_version || 'v2'
    },
    key
  );
}

/**
 * Records an immutable audit event in the database using the caller's active database transaction.
 * Must take an active transaction executor to guarantee zero gaps and atomic rollback on errors.
 */
export async function recordAuditEvent(
  tx: QueryExecutor,
  params: {
    orgId: string;
    actorId?: string;
    actorUserId?: string;
    userName?: string;
    role?: string;
    action: string;
    entityType: string;
    entityId?: string;
    entityName?: string;
    changes: any;
    ipAddress?: string;
    requestId?: string;
    timestamp?: string | Date;
  }
): Promise<StoredAuditLog> {
  // Enforce transaction requirement
  if (!tx || (tx as any).isTransaction !== true) {
    if (!(config.isTest && (config.USE_IN_MEMORY_DB || config.ALLOW_IN_MEMORY_DB))) {
      throw new Error('FATAL: recordAuditEvent must be executed within an active database transaction executor.');
    }
  }

  const { orgId, action, entityType, changes } = params;
  const actorId = params.actorId || params.actorUserId || '';
  const actorUserId = params.actorUserId || params.actorId || '';
  const userName = params.userName || 'System';
  const role = params.role || 'SYSTEM';
  const entityId = params.entityId || '';
  const entityName = params.entityName || '';
  const ipAddress = params.ipAddress || '127.0.0.1';
  const requestId = params.requestId || '';
  const timestamp = normalizeAuditTimestamp(params.timestamp || new Date());

  try {
    // 1. Lock tenant chain head row with SELECT ... FOR UPDATE to serialize sequence numbers
    const headRows = await tx<any>(
      'SELECT `last_seq`, `last_hash` FROM `audit_chain_heads` WHERE `org_id` = ? FOR UPDATE;',
      [orgId]
    );

    let lastSeq = 0;
    let lastHash = GENESIS_PREV_HASH;

    if (headRows && headRows.length > 0) {
      lastSeq = Number(headRows[0].last_seq);
      lastHash = headRows[0].last_hash || GENESIS_PREV_HASH;
    } else {
      // If missing (new org), initialize genesis head row and re-select FOR UPDATE
      await tx(
        'INSERT INTO `audit_chain_heads` (`org_id`, `last_seq`, `last_hash`) VALUES (?, 0, ?) ON DUPLICATE KEY UPDATE `org_id` = `org_id`;',
        [orgId, GENESIS_PREV_HASH]
      );
      const retryRows = await tx<any>(
        'SELECT `last_seq`, `last_hash` FROM `audit_chain_heads` WHERE `org_id` = ? FOR UPDATE;',
        [orgId]
      );
      if (retryRows && retryRows.length > 0) {
        lastSeq = Number(retryRows[0].last_seq);
        lastHash = retryRows[0].last_hash || GENESIS_PREV_HASH;
      }
    }

    const nextSeq = lastSeq + 1;
    const prevHash = lastHash;
    const hashVersion = 'v2';

    // 2. Compute cryptographically tamper-proof HMAC-SHA256
    const hash = computeAuditHashV2(
      {
        org_id: orgId,
        seq: nextSeq,
        actor_user_id: actorUserId,
        user_name: userName,
        role,
        action,
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entityName,
        changes,
        ip_address: ipAddress,
        request_id: requestId,
        timestamp,
        prev_hash: prevHash,
        hash_version: hashVersion
      },
      config.AUDIT_HMAC_KEY || config.SESSION_SECRET
    );

    const id = `aud-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const changesJsonStr = canonicalJsonStringify(
      typeof changes === 'string' ? { detail: changes } : changes
    );

    // 3. Atomically insert audit record
    await tx(`
      INSERT INTO \`audit_logs\` (
        \`id\`, \`org_id\`, \`seq\`, \`actor_id\`, \`actor_user_id\`, \`user_name\`, \`user_role\`,
        \`action\`, \`entity_type\`, \`entity_id\`, \`entity_name\`,
        \`changes\`, \`timestamp\`, \`prev_hash\`, \`hash\`, \`hash_version\`, \`ip_address\`, \`request_id\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `, [
      id,
      orgId,
      nextSeq,
      actorId,
      actorUserId,
      userName,
      role,
      action,
      entityType,
      entityId,
      entityName,
      changesJsonStr,
      timestamp,
      prevHash,
      hash,
      hashVersion,
      ipAddress,
      requestId
    ]);

    // 4. Update the serialized chain head pointer for this organization
    await tx(`
      UPDATE \`audit_chain_heads\`
      SET \`last_seq\` = ?, \`last_hash\` = ?
      WHERE \`org_id\` = ?;
    `, [nextSeq, hash, orgId]);

    return {
      id,
      org_id: orgId,
      seq: nextSeq,
      actor_id: actorId,
      actor_user_id: actorUserId,
      user_name: userName,
      user_role: role,
      role,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      changes: changesJsonStr,
      timestamp,
      prev_hash: prevHash,
      hash,
      hash_version: hashVersion,
      ip_address: ipAddress,
      request_id: requestId
    };
  } catch (err: any) {
    console.error(`[AUDIT WRITE ERROR] orgId=${orgId} action=${params.action}:`, err?.message || err);
    throw err;
  }
}

/**
 * Validates the cryptographic integrity of the audit ledger in streaming batches of 1000.
 * Keeps memory footprint O(1) regardless of table size.
 * Defaults to checking the last 10,000 rows (or from latest anchor); options.full=true verifies all rows.
 */
export async function verifyAuditChain(
  orgId: string,
  options?: { full?: boolean; maxRows?: number; startSeq?: number }
): Promise<AuditVerificationResult> {
  const stats = await query<any>(
    'SELECT COUNT(*) as cnt, MIN(seq) as min_seq, MAX(seq) as max_seq FROM `audit_logs` WHERE `org_id` = ?;',
    [orgId]
  );

  const totalRecords = Number(stats[0]?.cnt || 0);
  if (totalRecords === 0) {
    return {
      valid: true,
      orgId,
      checkedCount: 0,
      totalRecords: 0,
      firstSeq: 0,
      lastSeq: 0,
      brokenAtSeq: null,
      reason: null,
      chainLength: 0,
      genesisHash: GENESIS_PREV_HASH,
      latestHash: GENESIS_PREV_HASH,
      errors: []
    };
  }

  const minSeq = Number(stats[0].min_seq);
  const maxSeq = Number(stats[0].max_seq);

  let fromSeq = minSeq;
  if (!options?.full) {
    const window = options?.maxRows || 10000;
    fromSeq = Math.max(minSeq, maxSeq - window + 1);
  }
  if (options?.startSeq && options.startSeq >= minSeq) {
    fromSeq = options.startSeq;
  }

  let expectedPrevHash: string | null = null;
  if (fromSeq === 1 || (fromSeq === minSeq && minSeq === 1)) {
    expectedPrevHash = null; // Will validate against GENESIS or LEGACY_GENESIS_PREV_HASH
  } else {
    const prevRows = await query<any>(
      'SELECT `hash` FROM `audit_logs` WHERE `org_id` = ? AND `seq` = ? LIMIT 1;',
      [orgId, fromSeq - 1]
    );
    if (prevRows && prevRows.length > 0) {
      expectedPrevHash = prevRows[0].hash;
    }
  }

  let cursorSeq = fromSeq;
  let checkedCount = 0;
  let firstCheckedSeq = fromSeq;
  let lastCheckedSeq = fromSeq;
  let genesisHashSeen = '';
  let latestHashSeen = '';

  const batchSize = 1000;
  const hmacKey = config.AUDIT_HMAC_KEY || config.SESSION_SECRET;

  while (cursorSeq <= maxSeq) {
    const batch = await query<any>(
      'SELECT * FROM `audit_logs` WHERE `org_id` = ? AND `seq` >= ? ORDER BY `seq` ASC LIMIT 1000;',
      [orgId, cursorSeq]
    );

    if (!batch || batch.length === 0) {
      break;
    }

    for (const row of batch) {
      const currentSeq = Number(row.seq);
      if (checkedCount === 0) {
        firstCheckedSeq = currentSeq;
        genesisHashSeen = row.prev_hash;
      }
      lastCheckedSeq = currentSeq;
      latestHashSeen = row.hash;

      // 1. Validate sequence monotonicity without gaps
      const expectedSeq = checkedCount === 0 ? currentSeq : cursorSeq;
      if (currentSeq !== expectedSeq) {
        const reason = `Sequence gap detected: expected seq ${expectedSeq}, got ${currentSeq}`;
        return {
          valid: false,
          orgId,
          checkedCount,
          totalRecords,
          firstSeq: firstCheckedSeq,
          lastSeq: lastCheckedSeq,
          brokenAtSeq: currentSeq,
          reason,
          chainLength: checkedCount,
          genesisHash: genesisHashSeen,
          latestHash: latestHashSeen,
          errors: [reason]
        };
      }

      // 2. Validate prev_hash pointer link
      if (expectedPrevHash !== null) {
        if (row.prev_hash !== expectedPrevHash) {
          const reason = `Broken chain pointer at seq ${currentSeq}: expected prev_hash "${expectedPrevHash}", got "${row.prev_hash}"`;
          return {
            valid: false,
            orgId,
            checkedCount,
            totalRecords,
            firstSeq: firstCheckedSeq,
            lastSeq: lastCheckedSeq,
            brokenAtSeq: currentSeq,
            reason,
            chainLength: checkedCount,
            genesisHash: genesisHashSeen,
            latestHash: latestHashSeen,
            errors: [reason]
          };
        }
      } else {
        // Genesis sequence #1
        if (
          row.prev_hash !== GENESIS_PREV_HASH &&
          row.prev_hash !== LEGACY_GENESIS_PREV_HASH &&
          row.prev_hash !== 'GENESIS'
        ) {
          const reason = `Invalid genesis hash at seq ${currentSeq}: got "${row.prev_hash}"`;
          return {
            valid: false,
            orgId,
            checkedCount,
            totalRecords,
            firstSeq: firstCheckedSeq,
            lastSeq: lastCheckedSeq,
            brokenAtSeq: currentSeq,
            reason,
            chainLength: checkedCount,
            genesisHash: genesisHashSeen,
            latestHash: latestHashSeen,
            errors: [reason]
          };
        }
      }

      // 3. Cryptographic hash verification (v2 HMAC-SHA256 vs legacy v1 SHA-256)
      let recomputedHash: string;
      if (row.hash_version === 'v2') {
        recomputedHash = computeAuditHashV2(
          {
            org_id: row.org_id,
            seq: currentSeq,
            actor_user_id: row.actor_user_id || row.actor_id || '',
            user_name: row.user_name || '',
            role: row.user_role || row.role || 'USER',
            action: row.action,
            entity_type: row.entity_type,
            entity_id: row.entity_id || '',
            entity_name: row.entity_name || '',
            changes: row.changes,
            ip_address: row.ip_address || '127.0.0.1',
            request_id: row.request_id || '',
            timestamp: row.timestamp,
            prev_hash: row.prev_hash,
            hash_version: 'v2'
          },
          hmacKey
        );
      } else {
        let parsedChanges = row.changes;
        if (typeof parsedChanges === 'string') {
          try {
            parsedChanges = JSON.parse(parsedChanges);
          } catch {
            parsedChanges = { raw: row.changes };
          }
        }
        recomputedHash = computeAuditHashV1({
          org_id: row.org_id,
          seq: currentSeq,
          actor_id: row.actor_id || row.actor_user_id || '',
          role: row.user_role || row.role || 'USER',
          action: row.action,
          entity_type: row.entity_type,
          entity_id: row.entity_id || '',
          timestamp: row.timestamp,
          changes: parsedChanges,
          prev_hash: row.prev_hash
        });
      }

      if (recomputedHash !== row.hash) {
        const reason = `Tampered content at seq ${currentSeq}: stored hash "${row.hash}", recomputed hash "${recomputedHash}"`;
        return {
          valid: false,
          orgId,
          checkedCount,
          totalRecords,
          firstSeq: firstCheckedSeq,
          lastSeq: lastCheckedSeq,
          brokenAtSeq: currentSeq,
          reason,
          chainLength: checkedCount,
          genesisHash: genesisHashSeen,
          latestHash: latestHashSeen,
          errors: [reason]
        };
      }

      expectedPrevHash = row.hash;
      cursorSeq = currentSeq + 1;
      checkedCount++;
    }
  }

  return {
    valid: true,
    orgId,
    checkedCount,
    totalRecords,
    firstSeq: firstCheckedSeq,
    lastSeq: lastCheckedSeq,
    brokenAtSeq: null,
    reason: null,
    chainLength: checkedCount,
    genesisHash: genesisHashSeen || GENESIS_PREV_HASH,
    latestHash: latestHashSeen || GENESIS_PREV_HASH,
    errors: []
  };
}
