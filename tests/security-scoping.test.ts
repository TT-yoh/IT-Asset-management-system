/**
 * Automated Security Scoping & Access Control Test Suite
 * Validates:
 * 1. Multi-Tenant Row & Object Scoping (Tenant Isolation)
 * 2. Branch Boundary Scoping for BRANCH_MANAGER & USER roles
 * 3. Role Escalation Prevention in Request Bodies & Invites
 * 4. Separation of Duties on Checkout Returns & Write-Offs
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
  body?: any
): Promise<{ status: number; body: any; headers: Headers }> {
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

  return { status: res.status, body: parsed, headers: res.headers };
}

async function cleanTestData() {
  await query('DELETE FROM `checkouts` WHERE `id` LIKE ?;', ['test-%']);
  await query('DELETE FROM `assets` WHERE `id` LIKE ?;', ['test-%']);
  await query('DELETE FROM `users` WHERE `id` LIKE ?;', ['test-%']);
  await query('DELETE FROM `branches` WHERE `id` LIKE ?;', ['test-%']);
  await query('DELETE FROM `organizations` WHERE `id` LIKE ?;', ['test-%']);
}

async function setupTestData() {
  await cleanTestData();

  // 1. Seed Organizations
  await query(`
    INSERT INTO \`organizations\` (\`id\`, \`name\`, \`type\`)
    VALUES 
      ('test-org-alpha', 'Alpha Corp', 'Enterprise'),
      ('test-org-beta', 'Beta Corp', 'Enterprise');
  `);

  // 2. Seed Branches
  await query(`
    INSERT INTO \`branches\` (\`id\`, \`org_id\`, \`name\`, \`code\`, \`location\`, \`city\`, \`country\`, \`manager_name\`)
    VALUES
      ('test-br-a1', 'test-org-alpha', 'Alpha Hub 1', 'BR-A1', 'Sydney HQ', 'Sydney', 'Australia', 'Alpha BM 1'),
      ('test-br-a2', 'test-org-alpha', 'Alpha Hub 2', 'BR-A2', 'Melbourne Site', 'Melbourne', 'Australia', 'Alpha BM 2'),
      ('test-br-b1', 'test-org-beta', 'Beta Hub 1', 'BR-B1', 'Brisbane Site', 'Brisbane', 'Australia', 'Beta BM 1');
  `);

  // 3. Seed Asset Categories
  await query(`
    INSERT INTO \`asset_categories\` (\`id\`, \`name\`, \`depreciation_years\`)
    VALUES ('test-cat-gen', 'Hardware', 3)
    ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`);
  `);

  // 4. Seed Users across Tenants
  await query(`
    INSERT INTO \`users\` (\`id\`, \`org_id\`, \`email\`, \`full_name\`, \`role\`, \`branch_id\`, \`status\`)
    VALUES 
      ('test-admin-a', 'test-org-alpha', 'admin@alpha.com', 'Alpha Admin', 'ADMIN', 'test-br-a1', 'ACTIVE'),
      ('test-bm-a1', 'test-org-alpha', 'bm1@alpha.com', 'Alpha BM 1', 'BRANCH_MANAGER', 'test-br-a1', 'ACTIVE'),
      ('test-user-a1', 'test-org-alpha', 'user1@alpha.com', 'Alpha User 1', 'USER', 'test-br-a1', 'ACTIVE'),
      ('test-support-a1', 'test-org-alpha', 'support1@alpha.com', 'Alpha Support 1', 'IT_SUPPORT', 'test-br-a1', 'ACTIVE'),
      ('test-user-b1', 'test-org-beta', 'user1@beta.com', 'Beta User 1', 'USER', 'test-br-b1', 'ACTIVE');
  `);

  // 5. Seed Assets across Tenants and Branches
  await query(`
    INSERT INTO \`assets\` (
      \`id\`, \`org_id\`, \`branch_id\`, \`category_id\`, \`asset_code\`, \`name\`,
      \`serial_number\`, \`status\`, \`purchase_date\`, \`purchase_cost\`
    )
    VALUES
      ('test-ast-a1', 'test-org-alpha', 'test-br-a1', 'test-cat-gen', 'ALP-001', 'Alpha Laptop Hub 1', 'SN-A1', 'ACTIVE', '2025-01-01', 1200),
      ('test-ast-a2', 'test-org-alpha', 'test-br-a2', 'test-cat-gen', 'ALP-002', 'Alpha Laptop Hub 2', 'SN-A2', 'ACTIVE', '2025-01-01', 1500),
      ('test-ast-b1', 'test-org-beta', 'test-br-b1', 'test-cat-gen', 'BET-001', 'Beta Laptop Secret', 'SN-B1', 'ACTIVE', '2025-01-01', 2000);
  `);
}

async function runTests() {
  console.log('🔒 Starting OmniAsset Phase 2 Security Scoping Tests...\n');

  // Start server on dynamic port
  server = app.listen(0);
  const address = server.address() as any;
  baseUrl = `http://127.0.0.1:${address.port}`;

  await setupTestData();

  // Tokens
  const tokenUserA = createSessionToken({
    userId: 'test-user-a1',
    orgId: 'test-org-alpha',
    email: 'user1@alpha.com',
    fullName: 'Alpha User 1',
    role: 'USER',
    branchId: 'test-br-a1',
    branchName: 'Alpha Hub 1'
  });

  const tokenBMA = createSessionToken({
    userId: 'test-bm-a1',
    orgId: 'test-org-alpha',
    email: 'bm1@alpha.com',
    fullName: 'Alpha BM 1',
    role: 'BRANCH_MANAGER',
    branchId: 'test-br-a1',
    branchName: 'Alpha Hub 1'
  });

  const tokenAdminA = createSessionToken({
    userId: 'test-admin-a',
    orgId: 'test-org-alpha',
    email: 'admin@alpha.com',
    fullName: 'Alpha Admin',
    role: 'ADMIN',
    branchId: 'test-br-a1',
    branchName: 'Alpha Hub 1'
  });

  const tokenSupportA = createSessionToken({
    userId: 'test-support-a1',
    orgId: 'test-org-alpha',
    email: 'support1@alpha.com',
    fullName: 'Alpha Support 1',
    role: 'IT_SUPPORT',
    branchId: 'test-br-a1',
    branchName: 'Alpha Hub 1'
  });

  const tokenUserB = createSessionToken({
    userId: 'test-user-b1',
    orgId: 'test-org-beta',
    email: 'user1@beta.com',
    fullName: 'Beta User 1',
    role: 'USER',
    branchId: 'test-br-b1',
    branchName: 'Beta Hub 1'
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
  // 1. TENANT ISOLATION TESTS
  // --------------------------------------------------------------------------
  console.log('--- Multi-Tenant Scoping & Data Isolation ---');

  // Test 1.1: User in Org Alpha cannot see Assets in Org Beta
  const res1 = await apiRequest('GET', '/api/assets', tokenAdminA);
  const assetsOrgA = res1.body.assets || [];
  const hasBetaAsset = assetsOrgA.some((a: any) => a.id === 'test-ast-b1' || a.org_id === 'test-org-beta');
  assert(res1.status === 200 && !hasBetaAsset, 'User in test-org-alpha cannot see assets from test-org-beta');

  // Test 1.2: User in Org Alpha cannot update an Asset in Org Beta
  const res2 = await apiRequest('PUT', '/api/assets/test-ast-b1', tokenAdminA, { name: 'Compromised Name' });
  assert(res2.status === 404, 'ADMIN in test-org-alpha cannot mutate an asset belonging to test-org-beta (returns 404)');

  // Test 1.3: User in Org Alpha cannot see Users in Org Beta
  const res3 = await apiRequest('GET', '/api/users', tokenAdminA);
  const usersOrgA = res3.body.users || [];
  const hasBetaUser = usersOrgA.some((u: any) => u.id === 'test-user-b1' || u.orgId === 'test-org-beta');
  assert(res3.status === 200 && !hasBetaUser, 'ADMIN in test-org-alpha cannot enumerate users from test-org-beta');

  // Test 1.4: Cross-tenant creation parameter tampering is neutralized
  const res4 = await apiRequest('POST', '/api/assets', tokenAdminA, {
    id: 'test-ast-tampered',
    org_id: 'test-org-beta', // Attempt to inject asset into foreign org
    branchId: 'test-br-a1',
    categoryId: 'test-cat-gen',
    assetCode: 'TAMPER-001',
    name: 'Tamper Attempt Asset',
    serialNumber: 'SN-TAMPER-01',
    purchaseDate: '2025-01-01'
  });
  assert(res4.status === 201, 'Asset created with session org_id enforcement');
  const checkTamper = await query<any>('SELECT org_id FROM `assets` WHERE `id` = ?;', ['test-ast-tampered']);
  assert(checkTamper[0]?.org_id === 'test-org-alpha', 'Created asset was scoped strictly to session test-org-alpha, ignoring tampered test-org-beta');

  // --------------------------------------------------------------------------
  // 2. BRANCH ISOLATION TESTS
  // --------------------------------------------------------------------------
  console.log('\n--- Branch Boundary Enforcement ---');

  // Test 2.1: BRANCH_MANAGER in Branch 1 cannot see assets in Branch 2
  const res5 = await apiRequest('GET', '/api/assets', tokenBMA);
  const bmAssets = res5.body.assets || [];
  const seesBranch2Asset = bmAssets.some((a: any) => a.id === 'test-ast-a2');
  const seesBranch1Asset = bmAssets.some((a: any) => a.id === 'test-ast-a1');
  assert(seesBranch1Asset && !seesBranch2Asset, 'BRANCH_MANAGER sees only branch-1 assets and cannot see branch-2 assets');

  // Test 2.2: BRANCH_MANAGER cannot update assets belonging to another branch
  const res6 = await apiRequest('PUT', '/api/assets/test-ast-a2', tokenBMA, { name: 'Attempted Cross-Branch Edit' });
  assert(res6.status === 404, 'BRANCH_MANAGER cannot update asset in a different branch (returns 404)');

  // --------------------------------------------------------------------------
  // 3. ROLE ESCALATION & SEPARATION OF DUTIES TESTS
  // --------------------------------------------------------------------------
  console.log('\n--- Role Escalation & Separation of Duties ---');

  // Test 3.1: Regular USER cannot invite other users
  const res7 = await apiRequest('POST', '/api/users/invite', tokenUserA, {
    email: 'newhacker@alpha.com',
    fullName: 'Attacker',
    role: 'ADMIN'
  });
  assert(res7.status === 403, 'Regular USER cannot invite new users (returns 403 Forbidden)');

  // Test 3.2: Non-admin cannot call users:update endpoint
  const res8a = await apiRequest('PUT', '/api/users/test-user-a1', tokenUserA, {
    fullName: 'Alpha User 1',
    role: 'ADMIN'
  });
  assert(res8a.status === 403, 'Regular USER cannot update user records (returns 403 Forbidden)');

  // Test 3.3: Separation of Duties on Damage Write-off
  // Create a checkout for test-support-a1 (who has checkouts:return permission)
  await query(`
    INSERT INTO \`checkouts\` (\`id\`, \`asset_id\`, \`asset_code\`, \`asset_name\`, \`checked_out_by\`, \`checked_out_to_user_id\`, \`checked_out_to_user_name\`, \`status\`)
    VALUES ('test-chk-1', 'test-ast-a1', 'ALP-001', 'Alpha Laptop Hub 1', 'Alpha Admin', 'test-support-a1', 'Alpha Support 1', 'ACTIVE');
  `);

  // Custody holder test-support-a1 attempts to certify their own damage write-off
  const res9 = await apiRequest('POST', '/api/checkouts/test-chk-1/return', tokenSupportA, {
    returnCondition: 'POOR',
    damageReported: true,
    damageDescription: 'Dropped on concrete'
  });
  assert(
    res9.status === 403 && String(res9.body.error).includes('Separation of Duties'),
    'Custody holder cannot certify their own damage write-off (returns 403 Separation of Duties)'
  );

  // Independent Admin certifies return and damage write-off
  const res10 = await apiRequest('POST', '/api/checkouts/test-chk-1/return', tokenAdminA, {
    returnCondition: 'POOR',
    damageReported: true,
    damageDescription: 'Certified dropped by inspector'
  });
  assert(res10.status === 200, 'Independent ADMIN can certify return and damage write-off (200 OK)');

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
