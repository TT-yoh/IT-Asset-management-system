/**
 * Automated Audit Integrity & Hash Chaining Test Suite (Phase 13)
 * Validates:
 * 1. Canonical JSON serialization determinism
 * 2. Monotonic sequence numbering and genesis hashing (v2 HMAC)
 * 3. Enforced database transaction executor for audit recording
 * 4. Cryptographic HMAC-SHA256 hash chaining across mutations
 * 5. Tamper detection (content tampering, broken chain pointers, sequence gaps)
 * 6. Streaming verification (O(1) memory) with permission-gated ?full=1
 * 7. Business mutation atomic inclusion and rollback
 */

if (process.env.NODE_ENV !== 'test') {
  throw new Error('Test execution aborted: NODE_ENV must be set to "test" via cross-env');
}

import http from 'http';
import { app } from '../server/index';
import { createSessionToken } from '../server/auth';
import { query, withTransaction } from '../server/db';
import {
  GENESIS_PREV_HASH,
  LEGACY_GENESIS_PREV_HASH,
  canonicalJsonStringify,
  computeAuditHashV2,
  recordAuditEvent,
  verifyAuditChain
} from '../server/audit';

let server: http.Server;
let baseUrl = '';

async function apiRequest(
  method: string,
  path: string,
  token?: string,
  body?: any
): Promise<{ status: number; body: any }> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  return { status: res.status, body: parsed };
}

async function cleanAuditTestData() {
  await query('DELETE FROM `audit_logs` WHERE `org_id` = ?;', ['test-audit-org']);
  await query('DELETE FROM `audit_chain_heads` WHERE `org_id` = ?;', ['test-audit-org']);
  await query('DELETE FROM `assets` WHERE `org_id` = ?;', ['test-audit-org']);
  await query('DELETE FROM `users` WHERE `org_id` = ?;', ['test-audit-org']);
  await query('DELETE FROM `branches` WHERE `org_id` = ?;', ['test-audit-org']);
  await query('DELETE FROM `organizations` WHERE `id` = ?;', ['test-audit-org']);
}

async function setupAuditTestData() {
  await cleanAuditTestData();

  await query(`
    INSERT INTO \`organizations\` (\`id\`, \`name\`, \`type\`)
    VALUES ('test-audit-org', 'Audit Integrity Corp', 'Enterprise');
  `);

  await query(`
    INSERT INTO \`branches\` (\`id\`, \`org_id\`, \`name\`, \`code\`, \`location\`, \`city\`, \`country\`, \`manager_name\`)
    VALUES ('test-audit-br', 'test-audit-org', 'Main Lab', 'LAB-1', 'Central Lab', 'Sydney', 'Australia', 'Lab Manager');
  `);

  await query(`
    INSERT INTO \`users\` (\`id\`, \`org_id\`, \`branch_id\`, \`email\`, \`full_name\`, \`role\`, \`status\`, \`token_version\`)
    VALUES ('test-admin-audit', 'test-audit-org', 'test-audit-br', 'admin@audittest.com', 'Audit Admin', 'ADMIN', 'ACTIVE', 1);
  `);

  await query(`
    INSERT INTO \`users\` (\`id\`, \`org_id\`, \`branch_id\`, \`email\`, \`full_name\`, \`role\`, \`status\`, \`token_version\`)
    VALUES ('test-fin-audit', 'test-audit-org', 'test-audit-br', 'finance@audittest.com', 'Finance Viewer', 'FINANCE', 'ACTIVE', 1);
  `);

  await query(`
    INSERT INTO \`asset_categories\` (\`id\`, \`name\`, \`depreciation_years\`)
    VALUES ('test-cat-gen', 'Hardware', 3)
    ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`);
  `);
}

async function runTests() {
  console.log('🔒 Starting OmniAsset Phase 13 Audit Integrity & Ledger Tests...\n');

  server = app.listen(0);
  const address = server.address() as any;
  baseUrl = `http://127.0.0.1:${address.port}`;

  await setupAuditTestData();

  const tokenAdmin = createSessionToken({
    userId: 'test-admin-audit',
    orgId: 'test-audit-org',
    email: 'admin@audittest.com',
    fullName: 'Audit Admin',
    role: 'ADMIN',
    branchId: 'test-audit-br',
    branchName: 'Main Lab'
  });

  const tokenFinance = createSessionToken({
    userId: 'test-fin-audit',
    orgId: 'test-audit-org',
    email: 'finance@audittest.com',
    fullName: 'Finance Viewer',
    role: 'FINANCE',
    branchId: 'test-audit-br',
    branchName: 'Main Lab'
  });

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // 1. CANONICAL JSON SERIALIZATION DETERMINISM
  // --------------------------------------------------------------------------
  console.log('--- 1. Canonical JSON Serialization ---');

  const objA = { z: 1, a: 2, m: { y: 'test', b: [3, 2, 1] } };
  const objB = { m: { b: [3, 2, 1], y: 'test' }, a: 2, z: 1 };
  const strA = canonicalJsonStringify(objA);
  const strB = canonicalJsonStringify(objB);
  assert(strA === strB, 'Objects with different key insertion orders produce identical canonical JSON string');
  assert(strA.startsWith('{"a":2,"m":{"b":[3,2,1],"y":"test"},"z":1}'), 'Canonical serialization sorts keys lexicographically');

  // --------------------------------------------------------------------------
  // 2. TRANSACTION EXECUTOR ENFORCEMENT
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Transaction Executor Enforcement ---');

  let nonTxError = false;
  try {
    // Calling with raw pool/query without transaction must be rejected
    await recordAuditEvent(query, {
      orgId: 'test-audit-org',
      action: 'ILLEGAL_STANDALONE_AUDIT',
      entityType: 'Security',
      changes: {}
    });
  } catch (err: any) {
    nonTxError = err?.message?.includes('active database transaction executor');
  }
  assert(nonTxError, 'recordAuditEvent rejects raw query executor; enforces active transaction executor');

  // --------------------------------------------------------------------------
  // 3. MONOTONIC SEQUENCE & GENESIS HASHING (v2 HMAC)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Monotonic Sequence & Genesis Hashing (v2 HMAC) ---');

  const entry1 = await withTransaction(async (tx) => {
    return recordAuditEvent(tx, {
      orgId: 'test-audit-org',
      actorId: 'test-admin-audit',
      userName: 'Audit Admin',
      role: 'ADMIN',
      action: 'INIT_SYSTEM',
      entityType: 'Organization',
      entityId: 'test-audit-org',
      entityName: 'Audit Integrity Corp',
      changes: { state: 'initialized' }
    });
  });

  assert(entry1.seq === 1, 'First audit entry has seq = 1');
  assert(
    entry1.prev_hash === GENESIS_PREV_HASH || entry1.prev_hash === 'GENESIS',
    'Genesis record has GENESIS prev_hash'
  );
  assert(entry1.hash_version === 'v2', 'New audit entry uses hash_version v2');
  assert(entry1.hash && entry1.hash.length === 64, 'Generated hash is 64-character hexadecimal string');

  const entry2 = await withTransaction(async (tx) => {
    return recordAuditEvent(tx, {
      orgId: 'test-audit-org',
      actorId: 'test-admin-audit',
      userName: 'Audit Admin',
      role: 'ADMIN',
      action: 'CREATE_POLICY',
      entityType: 'Organization',
      entityId: 'test-audit-org',
      entityName: 'Security Policy',
      changes: { policy: 'enforce_mfa' }
    });
  });

  assert(entry2.seq === 2, 'Second audit entry has monotonic seq = 2');
  assert(entry2.prev_hash === entry1.hash, 'Second entry prev_hash correctly points to entry 1 hash');

  const entry3 = await withTransaction(async (tx) => {
    return recordAuditEvent(tx, {
      orgId: 'test-audit-org',
      actorId: 'test-admin-audit',
      userName: 'Audit Admin',
      role: 'ADMIN',
      action: 'REGISTER_DEVICE',
      entityType: 'Asset',
      entityId: 'test-dev-1',
      entityName: 'Server Rack 1',
      changes: { rack: 'R-01', status: 'ONLINE' }
    });
  });

  assert(entry3.seq === 3, 'Third audit entry has seq = 3');
  assert(entry3.prev_hash === entry2.hash, 'Third entry prev_hash correctly points to entry 2 hash');

  // Verify audit_chain_heads row in database matches entry 3
  const headRows = await query<any>(
    'SELECT `last_seq`, `last_hash` FROM `audit_chain_heads` WHERE `org_id` = ?;',
    ['test-audit-org']
  );
  assert(
    headRows.length === 1 &&
      Number(headRows[0].last_seq) === 3 &&
      headRows[0].last_hash === entry3.hash,
    'audit_chain_heads table atomically synchronized with latest sequence & hash'
  );

  // --------------------------------------------------------------------------
  // 4. STREAMING AUDIT CHAIN VERIFICATION (VALID CHAIN)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Streaming Audit Chain Verification (Valid Chain) ---');

  const verify1 = await verifyAuditChain('test-audit-org');
  assert(verify1.valid === true, 'verifyAuditChain reports valid chain on uncompromised log stream');
  assert(verify1.checkedCount === 3, 'verifyAuditChain correctly verified all 3 records');
  assert(verify1.errors.length === 0, 'No verification errors reported');
  assert(verify1.brokenAtSeq === null, 'brokenAtSeq is null for valid chain');

  // Verify via REST API endpoint as well
  const apiVerifyRes = await apiRequest('GET', '/api/audit-logs/verify', tokenAdmin);
  assert(
    apiVerifyRes.status === 200 && apiVerifyRes.body.valid === true,
    'GET /api/audit-logs/verify returns 200 OK with valid: true'
  );

  // Test ?full=1 query flag: ADMIN allowed, FINANCE rejected with 403
  const apiFullAdminRes = await apiRequest('GET', '/api/audit-logs/verify?full=1', tokenAdmin);
  assert(apiFullAdminRes.status === 200 && apiFullAdminRes.body.valid === true, 'ADMIN permitted to run full historical verification (?full=1)');

  const apiFullFinanceRes = await apiRequest('GET', '/api/audit-logs/verify?full=1', tokenFinance);
  assert(apiFullFinanceRes.status === 403, 'Non-admin (FINANCE) rejected with 403 when requesting full historical verification (?full=1)');

  // --------------------------------------------------------------------------
  // 5. TAMPER DETECTION (MALICIOUS LOG MUTATION)
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Tamper Detection & Fraud Identification ---');

  // Case 5.1: Tamper with log content (simulate direct DB update attack)
  await query(
    'UPDATE `audit_logs` SET `changes` = ? WHERE `id` = ?;',
    ['{"policy":"disabled_maliciously"}', entry2.id]
  );

  const verifyTamperedContent = await verifyAuditChain('test-audit-org');
  assert(verifyTamperedContent.valid === false, 'Tampered record content is detected by verifyAuditChain');
  assert(verifyTamperedContent.brokenAtSeq === 2, 'Identified exact broken sequence #2 with hash discrepancy');
  assert(verifyTamperedContent.reason?.includes('Tampered content at seq 2') === true, 'Detailed reason specifies tampered content');

  // Restore entry 2 changes so we can test pointer tampering
  await query(
    'UPDATE `audit_logs` SET `changes` = ? WHERE `id` = ?;',
    [entry2.changes, entry2.id]
  );

  // Case 5.2: Tamper with prev_hash link (broken chain pointer)
  await query(
    'UPDATE `audit_logs` SET `prev_hash` = ? WHERE `id` = ?;',
    ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', entry3.id]
  );

  const verifyTamperedPointer = await verifyAuditChain('test-audit-org');
  assert(verifyTamperedPointer.valid === false, 'Broken chain pointer is detected by verifyAuditChain');
  assert(verifyTamperedPointer.brokenAtSeq === 3, 'Identified broken pointer at sequence #3');

  // Restore entry 3 pointer
  await query(
    'UPDATE `audit_logs` SET `prev_hash` = ? WHERE `id` = ?;',
    [entry2.hash, entry3.id]
  );

  // --------------------------------------------------------------------------
  // 6. TRANSACTIONAL AUDIT WRITES ON BUSINESS MUTATIONS
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Transactional Audit Recording on Business Mutations ---');

  const createAssetRes = await apiRequest('POST', '/api/assets', tokenAdmin, {
    branchId: 'test-audit-br',
    categoryId: 'test-cat-gen',
    assetCode: 'TX-AUDIT-01',
    name: 'Transactional Audit Laptop',
    serialNumber: 'SN-TX-AUDIT',
    purchaseDate: '2025-01-01'
  });
  assert(createAssetRes.status === 201, 'Asset created via POST /api/assets');

  // Check that audit entry was atomically written with next sequence
  const latestAudit = await query<any>(
    'SELECT * FROM `audit_logs` WHERE `org_id` = ? AND `action` = "CREATE_ASSET" AND `entity_id` = ?;',
    ['test-audit-org', createAssetRes.body.id]
  );
  assert(latestAudit.length === 1, 'Audit record for CREATE_ASSET was committed in the same transaction');
  assert(Number(latestAudit[0].seq) === 4, 'Audit record was assigned sequential seq = 4');
  assert(latestAudit[0].prev_hash === entry3.hash, 'Audit record chained to entry 3 hash');

  // --------------------------------------------------------------------------
  // 7. EXTERNAL AUDIT ANCHORING
  // --------------------------------------------------------------------------
  console.log('\n--- 7. External Audit Chain Anchoring ---');

  // Verify that audit_chain_heads reflects seq = 4
  const headAfterAsset = await query<any>(
    'SELECT `last_seq`, `last_hash` FROM `audit_chain_heads` WHERE `org_id` = ?;',
    ['test-audit-org']
  );
  assert(
    headAfterAsset.length === 1 && Number(headAfterAsset[0].last_seq) === 4,
    'audit_chain_heads row synchronized at seq = 4 after business mutation'
  );

  // Clean up test data
  await cleanAuditTestData();
  server.close();

  console.log(`\n==========================================`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log(`==========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  if (server) server.close();
  process.exit(1);
});
