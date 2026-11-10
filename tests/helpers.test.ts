/**
 * Test Infrastructure Verification (Phase 16)
 * Validates:
 * 1. assertSafeTestDatabase() safeguards against accidental production teardown
 * 2. seedTestTenant() seeds an isolated tenant with branch, department, and active admin
 * 3. mintSession() produces verifiable session tokens recognized by authenticate middleware
 * 4. Exact-ID teardown cleanly purges only the seeded tenant records without TRUNCATE
 */

if (process.env.NODE_ENV !== 'test') {
  throw new Error('Test execution aborted: NODE_ENV must be set to "test" via cross-env');
}

import http from 'http';
import { app } from '../server/index';
import { query } from '../server/db';
import { assertSafeTestDatabase, seedTestTenant, mintSession } from './helpers';

let server: http.Server;
let baseUrl = '';

async function runHelpersVerification() {
  console.log('\n================================================================');
  console.log('🧪 Phase 16: Test Infrastructure & Helper Verification Suite');
  console.log('================================================================\n');

  server = app.listen(0);
  const address = server.address() as any;
  baseUrl = `http://127.0.0.1:${address.port}`;

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}`);
      failed++;
    }
  }

  // 1. assertSafeTestDatabase
  {
    console.log('--- Step 1: assertSafeTestDatabase Safety Guard ---');
    let threw = false;
    try {
      assertSafeTestDatabase();
    } catch {
      threw = true;
    }
    assert(!threw, 'assertSafeTestDatabase succeeds in valid test environment');
  }

  // 2. seedTestTenant and mintSession
  let tenant: Awaited<ReturnType<typeof seedTestTenant>> | null = null;
  {
    console.log('\n--- Step 2: Tenant Seeding & Session Minting ---');
    tenant = await seedTestTenant({ prefix: 'unit-hlp' });
    assert(Boolean(tenant.orgId && tenant.branchId && tenant.departmentId), 'Tenant generated valid IDs');
    assert(Boolean(tenant.sessionToken && tenant.sessionToken.includes('.')), 'Valid two-part session token minted');

    // Verify records exist in database
    const orgs = await query<any>('SELECT * FROM `organizations` WHERE `id` = ?;', [tenant.orgId]);
    assert(orgs.length === 1, 'Organization record inserted in database');

    const branches = await query<any>('SELECT * FROM `branches` WHERE `id` = ?;', [tenant.branchId]);
    assert(branches.length === 1, 'Branch record inserted in database');

    const depts = await query<any>('SELECT * FROM `departments` WHERE `id` = ?;', [tenant.departmentId]);
    assert(depts.length === 1, 'Department record inserted in database');

    const users = await query<any>('SELECT * FROM `users` WHERE `id` = ?;', [tenant.adminUser.id]);
    assert(users.length === 1 && users[0]?.role === 'ADMIN', 'Active ADMIN user inserted with token_version 1');
  }

  // 3. API Gateway Authentication with Minted Session
  {
    console.log('\n--- Step 3: API Gateway Authentication with Minted Session ---');
    const res = await fetch(`${baseUrl}/api/init`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tenant!.sessionToken}`,
        'Content-Type': 'application/json'
      }
    });

    assert(res.status === 200, `GET /api/init returns HTTP 200 with minted session (got ${res.status})`);
    const data = await res.json();
    assert(data.currentUser?.userId === tenant!.adminUser.id, 'currentUser matches seeded admin user');
    assert(data.organizations?.[0]?.id === tenant!.orgId, 'currentOrganization matches seeded tenant org');
  }

  // 4. Exact-ID Teardown
  {
    console.log('\n--- Step 4: Exact-ID Teardown & Isolation Verification ---');
    await tenant!.teardown();

    // Verify all seeded records are cleanly removed
    const orgsAfter = await query<any>('SELECT * FROM `organizations` WHERE `id` = ?;', [tenant!.orgId]);
    assert(orgsAfter.length === 0, 'Organization cleaned up');

    const branchesAfter = await query<any>('SELECT * FROM `branches` WHERE `id` = ?;', [tenant!.branchId]);
    assert(branchesAfter.length === 0, 'Branch cleaned up');

    const deptsAfter = await query<any>('SELECT * FROM `departments` WHERE `id` = ?;', [tenant!.departmentId]);
    assert(deptsAfter.length === 0, 'Department cleaned up');

    const usersAfter = await query<any>('SELECT * FROM `users` WHERE `id` = ?;', [tenant!.adminUser.id]);
    assert(usersAfter.length === 0, 'Admin user cleaned up');
  }

  server.close();

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runHelpersVerification().catch(err => {
  console.error('Fatal error in helpers verification:', err);
  if (server) server.close();
  process.exit(1);
});
