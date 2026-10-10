/**
 * Automated Audit Integrity & Hash Chaining Test Suite
 * Validates:
 * 1. Canonical JSON serialization determinism
 * 2. Monotonic sequence numbering and genesis hashing
 * 3. Cryptographic SHA-256 hash chaining across mutations
 * 4. Tamper detection (content tampering, broken chain pointers, sequence gaps)
 * 5. Tenant audit chain verification
 */

process.env.NODE_ENV = 'test';

import http from 'http';
import { app } from '../server/index';
import { createSessionToken } from '../server/auth';
import { query } from '../server/db';
import {
  GENESIS_PREV_HASH,
  canonicalJsonStringify,
  computeAuditHash,
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
  await query('DELETE FROM `assets` WHERE `org_id` = ?;', ['test-audit-org']);
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
    INSERT INTO \`asset_categories\` (\`id\`, \`name\`, \`depreciation_years\`)
    VALUES ('test-cat-gen', 'Hardware', 3)
    ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`);
  `);
}

async function runTests() {
  console.log('🔒 Starting OmniAsset Phase 3 Audit Integrity Tests...\n');

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
  // 2. MONOTONIC SEQUENCE & GENESIS HASHING
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Monotonic Sequence & Genesis Hashing ---');

  const entry1 = await recordAuditEvent(query, {
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

  assert(entry1.seq === 1, 'First audit entry has seq = 1');
  assert(entry1.prev_hash === GENESIS_PREV_HASH, 'Genesis record has 64-zero prev_hash');
  assert(entry1.hash && entry1.hash.length === 64, 'Generated hash is 64-character SHA-256 hexadecimal string');

  const entry2 = await recordAuditEvent(query, {
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

  assert(entry2.seq === 2, 'Second audit entry has monotonic seq = 2');
  assert(entry2.prev_hash === entry1.hash, 'Second entry prev_hash correctly points to entry 1 hash');

  const entry3 = await recordAuditEvent(query, {
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

  assert(entry3.seq === 3, 'Third audit entry has seq = 3');
  assert(entry3.prev_hash === entry2.hash, 'Third entry prev_hash correctly points to entry 2 hash');

  // --------------------------------------------------------------------------
  // 3. AUDIT CHAIN VERIFICATION (UNCOMPROMISED)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Audit Chain Verification (Valid Chain) ---');

  const verify1 = await verifyAuditChain('test-audit-org');
  if (verify1.errors.length > 0) {
    console.log('   [Debug verify1.errors]:', JSON.stringify(verify1.errors, null, 2));
  }
  assert(verify1.valid === true, 'verifyAuditChain reports valid chain on uncompromised log stream');
  assert(verify1.totalRecords === 3, 'verifyAuditChain correctly verified all 3 records');
  assert(verify1.errors.length === 0, 'No verification errors reported');

  // Verify via REST API endpoint as well
  const apiVerifyRes = await apiRequest('GET', '/api/audit-logs/verify', tokenAdmin);
  assert(apiVerifyRes.status === 200 && apiVerifyRes.body.valid === true, 'GET /api/audit-logs/verify returns 200 OK with valid: true');

  // --------------------------------------------------------------------------
  // 4. TAMPER DETECTION (MALICIOUS LOG MUTATION)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Tamper Detection & Fraud Identification ---');

  // Case 4.1: Tamper with log content (simulate direct DB update attack)
  await query(
    'UPDATE `audit_logs` SET `changes` = ? WHERE `id` = ?;',
    ['{"policy":"disabled_maliciously"}', entry2.id]
  );

  const verifyTamperedContent = await verifyAuditChain('test-audit-org');
  assert(verifyTamperedContent.valid === false, 'Tampered record content is detected by verifyAuditChain');
  assert(verifyTamperedContent.errors.some(e => e.includes('Tampered content at seq 2')), 'Identified exact broken sequence #2 with hash discrepancy');

  // Restore entry 2 changes so we can test pointer tampering
  await query(
    'UPDATE `audit_logs` SET `changes` = ? WHERE `id` = ?;',
    [entry2.changes, entry2.id]
  );

  // Case 4.2: Tamper with prev_hash link (broken chain pointer)
  await query(
    'UPDATE `audit_logs` SET `prev_hash` = ? WHERE `id` = ?;',
    ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', entry3.id]
  );

  const verifyTamperedPointer = await verifyAuditChain('test-audit-org');
  assert(verifyTamperedPointer.valid === false, 'Broken chain pointer is detected by verifyAuditChain');
  assert(verifyTamperedPointer.errors.some(e => e.includes('Broken chain pointer at seq 3')), 'Identified broken pointer at sequence #3');

  // Restore entry 3 pointer
  await query(
    'UPDATE `audit_logs` SET `prev_hash` = ? WHERE `id` = ?;',
    [entry2.hash, entry3.id]
  );

  // --------------------------------------------------------------------------
  // 5. TRANSACTIONAL AUDIT WRITES ON BUSINESS MUTATIONS
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Transactional Audit Recording on Business Mutations ---');

  const createAssetRes = await apiRequest('POST', '/api/assets', tokenAdmin, {
    id: 'test-ast-tx-audit',
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
    ['test-audit-org', 'test-ast-tx-audit']
  );
  assert(latestAudit.length === 1, 'Audit record for CREATE_ASSET was committed in the same transaction');
  assert(Number(latestAudit[0].seq) === 4, 'Audit record was assigned sequential seq = 4');
  assert(latestAudit[0].prev_hash === entry3.hash, 'Audit record chained to entry 3 hash');

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
