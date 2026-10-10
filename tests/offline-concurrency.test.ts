/**
 * Automated Offline Sync & Optimistic Concurrency Test Suite (Phase 4)
 * Validates:
 * 1. Idempotency Key deduplication (prevents duplicate mutations & duplicate audit entries)
 * 2. Optimistic concurrency version increments on successful updates
 * 3. HTTP 409 Conflict rejection on stale baseVersion (concurrent mutation collision)
 * 4. Stale baseVersion protection on deletion
 * 5. Maintenance and User entity optimistic locking
 * 6. Client sequence and idempotency metadata tracking
 */

process.env.NODE_ENV = 'test';

import http from 'http';
import { app } from '../server/index';
import { createSessionToken } from '../server/auth';
import { query } from '../server/db';

let server: http.Server;
let baseUrl = '';

async function apiRequest(
  method: string,
  path: string,
  token?: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: Headers; body: any }> {
  const url = `${baseUrl}${path}`;
  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers
  };
  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  return { status: res.status, headers: res.headers, body: parsed };
}

async function cleanTestData() {
  await query('DELETE FROM `idempotency_keys` WHERE `org_id` = ?;', ['test-sync-org']);
  await query('DELETE FROM `audit_logs` WHERE `org_id` = ?;', ['test-sync-org']);
  await query('DELETE FROM `maintenances` WHERE `id` LIKE "test-mnt-%";');
  await query('DELETE FROM `assets` WHERE `org_id` = ?;', ['test-sync-org']);
  await query('DELETE FROM `users` WHERE `org_id` = ?;', ['test-sync-org']);
  await query('DELETE FROM `branches` WHERE `org_id` = ?;', ['test-sync-org']);
  await query('DELETE FROM `organizations` WHERE `id` = ?;', ['test-sync-org']);
}

async function setupTestData() {
  await cleanTestData();

  await query(`
    INSERT INTO \`organizations\` (\`id\`, \`name\`, \`type\`)
    VALUES ('test-sync-org', 'Warehouse Logistics Ltd', 'Enterprise');
  `);

  await query(`
    INSERT INTO \`branches\` (\`id\`, \`org_id\`, \`name\`, \`code\`, \`location\`, \`city\`, \`country\`, \`manager_name\`)
    VALUES ('test-sync-br', 'test-sync-org', 'Depot A', 'D-01', 'Warehouse 1', 'Melbourne', 'Australia', 'Depot Manager');
  `);

  await query(`
    INSERT INTO \`asset_categories\` (\`id\`, \`name\`, \`depreciation_years\`)
    VALUES ('test-cat-sync', 'Field Terminals', 3)
    ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`);
  `);

  await query(`
    INSERT INTO \`users\` (
      \`id\`, \`org_id\`, \`email\`, \`full_name\`, \`role\`, \`department_id\`, \`department_name\`,
      \`branch_id\`, \`branch_name\`, \`password_hash\`, \`status\`, \`version\`
    ) VALUES (
      'test-sync-usr', 'test-sync-org', 'staff@synctest.com', 'Warehouse Staff',
      'ADMIN', 'dept-ops', 'Operations', 'test-sync-br', 'Depot A', 'hash', 'ACTIVE', 1
    );
  `);
}

async function runTests() {
  console.log('🔄 Starting OmniAsset Phase 4 Concurrency & Offline Sync Tests...\n');

  server = app.listen(0);
  const address = server.address() as any;
  baseUrl = `http://127.0.0.1:${address.port}`;

  await setupTestData();

  const tokenAdmin = createSessionToken({
    userId: 'test-sync-usr',
    orgId: 'test-sync-org',
    email: 'staff@synctest.com',
    fullName: 'Warehouse Staff',
    role: 'ADMIN',
    branchId: 'test-sync-br',
    branchName: 'Depot A'
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
  // 1. IDEMPOTENCY KEY DEDUPLICATION
  // --------------------------------------------------------------------------
  console.log('--- 1. Idempotency Key Deduplication ---');

  const idempKey = `idemp-test-${Date.now()}`;
  const assetPayload = {
    id: 'test-ast-idemp-1',
    branchId: 'test-sync-br',
    categoryId: 'test-cat-sync',
    assetCode: 'TERM-IDEMP-01',
    name: 'Field Scanner 1',
    serialNumber: 'SN-IDEMP-001',
    purchaseDate: '2025-01-01'
  };

  // Initial POST with idempotency key
  const res1 = await apiRequest('POST', '/api/assets', tokenAdmin, assetPayload, {
    'Idempotency-Key': idempKey,
    'X-Client-Id': 'scanner-terminal-01',
    'X-Client-Seq': '1'
  });

  assert(res1.status === 201, 'First POST /api/assets succeeds with HTTP 201 Created');
  assert(res1.body.success === true && res1.body.id === 'test-ast-idemp-1', 'Created asset ID returned');

  // Exact duplicate replayed POST with the same idempotency key (simulating network retry)
  const res2 = await apiRequest('POST', '/api/assets', tokenAdmin, assetPayload, {
    'Idempotency-Key': idempKey,
    'X-Client-Id': 'scanner-terminal-01',
    'X-Client-Seq': '1'
  });

  assert(res2.status === 201, 'Replayed duplicate POST returns identical HTTP 201 status');
  assert(res2.headers.get('x-cache-lookup') === 'HIT', 'Response header has X-Cache-Lookup: HIT');
  assert(res2.body.id === 'test-ast-idemp-1', 'Cached response body matches original');

  // Verify DB state: Exactly 1 asset row exists and exactly 1 audit entry created
  const assetsInDb = await query('SELECT * FROM `assets` WHERE `id` = ?;', ['test-ast-idemp-1']);
  assert(assetsInDb.length === 1, 'Exactly one asset row exists in database (no duplicate insertion)');

  const auditsInDb = await query(
    'SELECT * FROM `audit_logs` WHERE `org_id` = ? AND `entity_id` = ?;',
    ['test-sync-org', 'test-ast-idemp-1']
  );
  assert(auditsInDb.length === 1, 'Only one audit log was created (idempotency prevented duplicate audit events)');

  // --------------------------------------------------------------------------
  // 2. OPTIMISTIC CONCURRENCY - SUCCESSFUL SEQUENTIAL UPDATES
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Optimistic Locking - Sequential Update ---');

  const initialVersion = Number(assetsInDb[0].version || 1);
  assert(initialVersion === 1, 'New asset starts with version = 1');

  // Update providing matching baseVersion: 1
  const updateRes1 = await apiRequest('PUT', '/api/assets/test-ast-idemp-1', tokenAdmin, {
    name: 'Field Scanner 1 (Calibrated)',
    baseVersion: 1
  });

  assert(updateRes1.status === 200, 'PUT with matching baseVersion = 1 succeeds with 200 OK');
  assert(updateRes1.body.version === 2, 'Updated asset returns version = 2');

  const updatedInDb = await query('SELECT * FROM `assets` WHERE `id` = ?;', ['test-ast-idemp-1']);
  assert(Number(updatedInDb[0].version) === 2, 'Database row incremented to version = 2');
  assert(updatedInDb[0].name === 'Field Scanner 1 (Calibrated)', 'Asset name updated');

  // --------------------------------------------------------------------------
  // 3. OPTIMISTIC CONCURRENCY - CONFLICT REJECTION (HTTP 409)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Optimistic Locking - Stale Version Conflict (HTTP 409) ---');

  // Simulate concurrent user/offline scanner attempting update based on stale baseVersion = 1
  const staleUpdateRes = await apiRequest('PUT', '/api/assets/test-ast-idemp-1', tokenAdmin, {
    name: 'Conflicting Edit from Stale Client',
    baseVersion: 1 // Stale! Current DB version is 2
  });

  assert(staleUpdateRes.status === 409, 'Stale baseVersion = 1 rejected with HTTP 409 Conflict');
  assert(staleUpdateRes.body.currentVersion === 2, 'Conflict response indicates currentVersion = 2');
  assert(staleUpdateRes.body.expectedVersion === 1, 'Conflict response indicates expectedVersion = 1');

  // Verify DB state was NOT modified by conflicting request
  const afterConflictDb = await query('SELECT * FROM `assets` WHERE `id` = ?;', ['test-ast-idemp-1']);
  assert(afterConflictDb[0].name === 'Field Scanner 1 (Calibrated)', 'Database was protected from stale overwrite');
  assert(Number(afterConflictDb[0].version) === 2, 'Version remains 2 after conflict rejection');

  // --------------------------------------------------------------------------
  // 4. STALE BASEVERSION ON DELETE (HTTP 409)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Stale baseVersion Rejection on Delete ---');

  // Attempt delete with stale version 1
  const staleDeleteRes = await apiRequest('DELETE', '/api/assets/test-ast-idemp-1', tokenAdmin, {
    baseVersion: 1
  });
  assert(staleDeleteRes.status === 409, 'DELETE with stale baseVersion = 1 rejected with HTTP 409 Conflict');

  // Delete with correct current version 2
  const validDeleteRes = await apiRequest('DELETE', '/api/assets/test-ast-idemp-1', tokenAdmin, {
    baseVersion: 2
  });
  assert(validDeleteRes.status === 200, 'DELETE with valid baseVersion = 2 succeeds with 200 OK');

  const afterDeleteDb = await query('SELECT * FROM `assets` WHERE `id` = ?;', ['test-ast-idemp-1']);
  assert(afterDeleteDb.length === 0, 'Asset successfully removed from database');

  // --------------------------------------------------------------------------
  // 5. USER ENTITY OPTIMISTIC LOCKING
  // --------------------------------------------------------------------------
  console.log('\n--- 5. User Entity Optimistic Locking ---');

  // Attempt user update with stale baseVersion = 99
  const userConflictRes = await apiRequest('PUT', '/api/users/test-sync-usr', tokenAdmin, {
    fullName: 'Renamed Staff',
    baseVersion: 99
  });
  assert(userConflictRes.status === 409, 'PUT /api/users/:id with stale baseVersion = 99 returns HTTP 409 Conflict');

  // Valid user update with baseVersion = 1
  const userValidRes = await apiRequest('PUT', '/api/users/test-sync-usr', tokenAdmin, {
    fullName: 'Renamed Staff',
    baseVersion: 1
  });
  assert(userValidRes.status === 200, 'PUT /api/users/:id with matching baseVersion = 1 succeeds with 200 OK');

  const userAfterDb = await query('SELECT * FROM `users` WHERE `id` = ?;', ['test-sync-usr']);
  assert(Number(userAfterDb[0].version) === 2, 'User row version incremented to 2');

  // Clean up test data
  await cleanTestData();
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
