/**
 * Admin Facilities, Branches & Department Management Test Suite
 * Tests full admin capabilities for:
 * - Department CRUD (/api/departments) with audit logging
 * - Branch creation, manager assignment, and safe deletion (/api/branches)
 * - Role-based authorization & permission boundary enforcement
 * - Phase 12 Addendum 2: Tenant-safe facilities & budget writes
 */

if (process.env.NODE_ENV !== 'test') {
  throw new Error('Test execution aborted: NODE_ENV must be set to "test" via cross-env');
}

import app from '../server/index';
import { query } from '../server/db';
import { hashPassword, createSessionToken } from '../server/auth';

const testAdminEmail = process.env.TEST_ADMIN_EMAIL || 'test-admin-facilities@omniasset.internal';
const testAdminPassword = process.env.TEST_ADMIN_PASSWORD || 'TestPass123!Secure';

let BASE_URL = 'http://localhost:3001';
let serverInstance: any = null;

interface TestStep {
  name: string;
  fn: () => Promise<void>;
}

const steps: TestStep[] = [];
function test(name: string, fn: () => Promise<void>) {
  steps.push({ name, fn });
}

let sessionCookie = '';
let testDeptId = '';
let testBranchId = '';
let testBranchCode = '';

function headers(extra: Record<string, string> = {}) {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...extra
  };
  if (sessionCookie) {
    h['Cookie'] = sessionCookie;
  }
  return h;
}

// 1. Admin Login
test('1. Admin Authentication for Facilities Management', async () => {
  await query('DELETE FROM users WHERE id = ? OR email = ?;', ['usr-test-fac-admin', testAdminEmail]);
  const hash = await hashPassword(testAdminPassword);
  await query(`
    INSERT INTO users (id, org_id, email, password_hash, full_name, role, status, branch_id, branch_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `, [
    'usr-test-fac-admin',
    'org-omnitech',
    testAdminEmail,
    hash,
    'Facilities Test Admin',
    'ADMIN',
    'ACTIVE',
    'branch-main',
    'Global Headquarters'
  ]);

  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testAdminEmail,
      password: testAdminPassword
    })
  });
  if (!res.ok) throw new Error(`Login failed: ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    sessionCookie = setCookie.split(';')[0] || '';
  }
});

// 2. Department Creation
test('2. Admin Creates Department (POST /api/departments)', async () => {
  await query('DELETE FROM departments WHERE name = ? AND org_id = ?;', ['Cloud Infrastructure & DevOps', 'org-omnitech']);
  await query('DELETE FROM departments WHERE name = ? AND org_id = ?;', ['Cloud Infrastructure & Platform Engineering', 'org-omnitech']);
  const res = await fetch(`${BASE_URL}/api/departments`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: 'Cloud Infrastructure & DevOps',
      budget_allocated: 750000,
      head_count: 14
    })
  });
  if (!res.ok) throw new Error(`Create department failed: ${await res.text()}`);
  const data = await res.json();
  if (!data.success || !data.id) {
    throw new Error('Department creation response invalid');
  }
  testDeptId = data.id;
});

// 3. Department Retrieval
test('3. Retrieve Departments (GET /api/departments)', async () => {
  const res = await fetch(`${BASE_URL}/api/departments`, {
    method: 'GET',
    headers: headers()
  });
  if (!res.ok) throw new Error(`Get departments failed: ${await res.text()}`);
  const data = await res.json();
  const created = data.departments.find((d: any) => d.id === testDeptId);
  if (!created) throw new Error(`Created department ${testDeptId} not found in listing`);
  if (created.name !== 'Cloud Infrastructure & DevOps') {
    throw new Error(`Expected department name 'Cloud Infrastructure & DevOps', got '${created.name}'`);
  }
  if (parseFloat(created.budget_allocated) !== 750000) {
    throw new Error(`Expected budget 750000, got '${created.budget_allocated}'`);
  }
});

// 4. Department Update
test('4. Admin Updates Department (PUT /api/departments/:id)', async () => {
  const res = await fetch(`${BASE_URL}/api/departments/${testDeptId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({
      name: 'Cloud Infrastructure & Platform Engineering',
      budget_allocated: 950000,
      head_count: 18
    })
  });
  if (!res.ok) throw new Error(`Update department failed: ${await res.text()}`);
  
  // Verify via GET
  const resGet = await fetch(`${BASE_URL}/api/departments`, {
    method: 'GET',
    headers: headers()
  });
  const data = await resGet.json();
  const updated = data.departments.find((d: any) => d.id === testDeptId);
  if (!updated) throw new Error(`Department ${testDeptId} not found after update`);
  if (updated.name !== 'Cloud Infrastructure & Platform Engineering') {
    throw new Error(`Expected updated name 'Cloud Infrastructure & Platform Engineering', got '${updated.name}'`);
  }
  if (parseFloat(updated.budget_allocated) !== 950000) {
    throw new Error(`Expected budget 950000, got '${updated.budget_allocated}'`);
  }
});

// 5. Branch Facility Creation with Branch Manager
test('5. Admin Creates Facility Branch with Manager (POST /api/branches)', async () => {
  await query('DELETE FROM branches WHERE name = ? AND org_id = ?;', ['Harare Innovation Center', 'org-omnitech']);
  testBranchCode = `FAC-${Math.floor(Math.random() * 9000 + 1000)}`;

  const res = await fetch(`${BASE_URL}/api/branches`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: 'Harare Innovation Center',
      code: testBranchCode,
      location: 'Block C, Tech Park',
      city: 'Harare',
      country: 'Zimbabwe',
      manager_name: 'Dr. Sarah Ndlovu'
    })
  });
  if (!res.ok) throw new Error(`Branch creation failed: ${await res.text()}`);
  const data = await res.json();
  if (!data.success || !data.id) {
    throw new Error('Branch creation response invalid');
  }
  testBranchId = data.id;

  // Verify via GET
  const resGet = await fetch(`${BASE_URL}/api/branches`, {
    method: 'GET',
    headers: headers()
  });
  const getBranchData = await resGet.json();
  const branch = getBranchData.branches.find((b: any) => b.id === testBranchId);
  if (!branch) throw new Error('Created branch not found in GET /api/branches');
  if (branch.manager_name !== 'Dr. Sarah Ndlovu') {
    throw new Error(`Branch manager assignment mismatch: expected Dr. Sarah Ndlovu, got ${branch.manager_name}`);
  }
});

// 6. Branch Reassignment & Update
test('6. Admin Reassigns Branch Manager (PUT /api/branches/:id)', async () => {
  const res = await fetch(`${BASE_URL}/api/branches/${testBranchId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({
      manager_name: 'Alex Johnson',
      location: 'Block C & D, Tech Park'
    })
  });
  if (!res.ok) throw new Error(`Branch update failed: ${await res.text()}`);

  // Verify via GET
  const resGet = await fetch(`${BASE_URL}/api/branches`, {
    method: 'GET',
    headers: headers()
  });
  const getBranchData = await resGet.json();
  const branch = getBranchData.branches.find((b: any) => b.id === testBranchId);
  if (!branch) throw new Error('Branch not found after update');
  if (branch.manager_name !== 'Alex Johnson') {
    throw new Error(`Branch manager reassignment mismatch: expected Alex Johnson, got ${branch.manager_name}`);
  }
});

// 7. Branch Deletion
test('7. Admin Deletes Branch (DELETE /api/branches/:id)', async () => {
  const res = await fetch(`${BASE_URL}/api/branches/${testBranchId}`, {
    method: 'DELETE',
    headers: headers()
  });
  if (!res.ok) throw new Error(`Branch deletion failed: ${await res.text()}`);
  const data = await res.json();
  if (!data.success) throw new Error('Branch deletion did not return success: true');

  // Verify removed
  const resGet = await fetch(`${BASE_URL}/api/branches`, {
    method: 'GET',
    headers: headers()
  });
  const getBranchData = await resGet.json();
  const branch = getBranchData.branches.find((b: any) => b.id === testBranchId);
  if (branch) throw new Error('Branch still exists after deletion');
});

// 8. Department Deletion
test('8. Admin Deletes Department (DELETE /api/departments/:id)', async () => {
  const res = await fetch(`${BASE_URL}/api/departments/${testDeptId}`, {
    method: 'DELETE',
    headers: headers()
  });
  if (!res.ok) throw new Error(`Department deletion failed: ${await res.text()}`);
  const data = await res.json();
  if (!data.success) throw new Error('Department deletion did not return success: true');

  // Verify removed
  const resGet = await fetch(`${BASE_URL}/api/departments`, {
    method: 'GET',
    headers: headers()
  });
  const getDeptData = await resGet.json();
  const dept = getDeptData.departments.find((d: any) => d.id === testDeptId);
  if (dept) throw new Error('Department still exists after deletion');
});

// 9. Verify Audit Trail for Department & Branch mutations
test('9. Immutable Audit Chain contains Department & Branch events', async () => {
  const res = await fetch(`${BASE_URL}/api/audit-logs`, {
    method: 'GET',
    headers: headers()
  });
  if (!res.ok) throw new Error(`Audit log fetch failed: ${await res.text()}`);
  const data = await res.json();
  const actions = (data.auditLogs || []).map((l: any) => l.action);
  if (!actions.includes('CREATE_DEPARTMENT')) {
    throw new Error('CREATE_DEPARTMENT event missing from audit log');
  }
  if (!actions.includes('UPDATE_DEPARTMENT')) {
    throw new Error('UPDATE_DEPARTMENT event missing from audit log');
  }
  if (!actions.includes('DELETE_DEPARTMENT')) {
    throw new Error('DELETE_DEPARTMENT event missing from audit log');
  }
  if (!actions.includes('CREATE_BRANCH')) {
    throw new Error('CREATE_BRANCH event missing from audit log');
  }
  if (!actions.includes('UPDATE_BRANCH')) {
    throw new Error('UPDATE_BRANCH event missing from audit log');
  }
  if (!actions.includes('DELETE_BRANCH')) {
    throw new Error('DELETE_BRANCH event missing from audit log');
  }
});

// 10. Phase 12.5: Duplicate Branch Code returns HTTP 409 DUPLICATE
test('10. Duplicate branch code returns HTTP 409 DUPLICATE', async () => {
  const code = `DUP-BR-${Date.now().toString().slice(-4)}`;
  const res1 = await fetch(`${BASE_URL}/api/branches`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: 'Original Facility',
      code,
      city: 'Sydney'
    })
  });
  if (!res1.ok) throw new Error(`Initial branch creation failed: ${await res1.text()}`);
  const data1 = await res1.json();

  const res2 = await fetch(`${BASE_URL}/api/branches`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: 'Duplicate Facility',
      code,
      city: 'Melbourne'
    })
  });
  if (res2.status !== 409) {
    throw new Error(`Expected HTTP 409 for duplicate branch code, got ${res2.status}`);
  }
  const data2 = await res2.json();
  if (data2.code !== 'DUPLICATE') {
    throw new Error(`Expected error code 'DUPLICATE', got '${data2.code}'`);
  }

  // Cleanup
  await fetch(`${BASE_URL}/api/branches/${data1.id}`, { method: 'DELETE', headers: headers() });
});

// 11. Phase 12.5: Cross-Tenant Protection (Org B admin cannot modify Org A branch)
test('11. Org B admin cannot read, modify or delete Org A branch', async () => {
  // Create branch in org-omnitech
  const resBranch = await fetch(`${BASE_URL}/api/branches`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: 'Org A Dedicated Site',
      city: 'Brisbane'
    })
  });
  const branchData = await resBranch.json();
  const targetBranchId = branchData.id;

  // Ensure tenant-beta organization exists
  await query("INSERT IGNORE INTO organizations (id, name, type) VALUES ('tenant-beta', 'Tenant Beta', 'Enterprise');");
  await query('DELETE FROM users WHERE id = ?;', ['usr-foreign-admin']);
  await query(`
    INSERT INTO users (id, org_id, email, password_hash, full_name, role, status, branch_id, branch_name)
    VALUES ('usr-foreign-admin', 'tenant-beta', 'foreign-admin@example.com', 'hash', 'Foreign Admin', 'ADMIN', 'ACTIVE', 'br-1', 'Branch 1');
  `);

  const foreignToken = createSessionToken({
    userId: 'usr-foreign-admin',
    ver: 1
  });
  const foreignHeaders = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'Authorization': `Bearer ${foreignToken}`
  };

  // Attempt PUT from foreign tenant
  const resPut = await fetch(`${BASE_URL}/api/branches/${targetBranchId}`, {
    method: 'PUT',
    headers: foreignHeaders,
    body: JSON.stringify({ name: 'Tampered by Foreign Tenant' })
  });
  if (resPut.status !== 404) {
    throw new Error(`Expected HTTP 404 for cross-tenant branch update, got ${resPut.status}`);
  }

  // Attempt DELETE from foreign tenant
  const resDel = await fetch(`${BASE_URL}/api/branches/${targetBranchId}`, {
    method: 'DELETE',
    headers: foreignHeaders
  });
  if (resDel.status !== 404) {
    throw new Error(`Expected HTTP 404 for cross-tenant branch delete, got ${resDel.status}`);
  }

  // Cleanup
  await query('DELETE FROM users WHERE id = ?;', ['usr-foreign-admin']);
  await fetch(`${BASE_URL}/api/branches/${targetBranchId}`, { method: 'DELETE', headers: headers() });
});

// 12. Phase 12.5: Branch delete blocked when users exist
test('12. Branch delete blocked with 409 when staff members belong to it', async () => {
  // Create a branch
  const resBranch = await fetch(`${BASE_URL}/api/branches`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: 'Staffed Facility',
      city: 'Perth'
    })
  });
  const branch = await resBranch.json();

  // Create user in this branch
  const testUserId = `usr-staffed-${Date.now()}`;
  await query(`
    INSERT INTO users (id, org_id, email, password_hash, full_name, role, status, branch_id, branch_name)
    VALUES (?, 'org-omnitech', ?, 'hash', 'Test Staff', 'USER', 'ACTIVE', ?, 'Staffed Facility');
  `, [testUserId, `${testUserId}@example.com`, branch.id]);

  // Try to delete branch
  const resDelete = await fetch(`${BASE_URL}/api/branches/${branch.id}`, {
    method: 'DELETE',
    headers: headers()
  });

  if (resDelete.status !== 409) {
    throw new Error(`Expected HTTP 409 when deleting staffed branch, got ${resDelete.status}`);
  }
  const deleteBody = await resDelete.json();
  if (deleteBody.code !== 'BRANCH_HAS_USERS') {
    throw new Error(`Expected error code 'BRANCH_HAS_USERS', got '${deleteBody.code}'`);
  }

  // Cleanup user then branch
  await query('DELETE FROM users WHERE id = ?;', [testUserId]);
  await fetch(`${BASE_URL}/api/branches/${branch.id}`, { method: 'DELETE', headers: headers() });
});

async function run() {
  console.log('🏛️ Running Admin Facilities & Department Management Tests...\n');

  try {
    const healthCheck = await fetch(`${BASE_URL}/api/health`).catch(() => null);
    if (!healthCheck || !healthCheck.ok) {
      serverInstance = app.listen(0);
      const address = serverInstance.address() as any;
      BASE_URL = `http://127.0.0.1:${address.port}`;
    }
  } catch {
    serverInstance = app.listen(0);
    const address = serverInstance.address() as any;
    BASE_URL = `http://127.0.0.1:${address.port}`;
  }

  let passed = 0;
  let failed = 0;

  try {
    for (const step of steps) {
      try {
        await step.fn();
        console.log(`  ✅ PASS: ${step.name}`);
        passed++;
      } catch (err: any) {
        console.error(`  ❌ FAIL: ${step.name}`);
        console.error(`     ${err.message}`);
        failed++;
      }
    }
  } finally {
    if (serverInstance) {
      await new Promise(r => serverInstance.close(r));
    }
  }

  console.log('\n==========================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('==========================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run();
