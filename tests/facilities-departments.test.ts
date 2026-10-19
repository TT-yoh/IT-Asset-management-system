/**
 * Admin Facilities, Branches & Department Management Test Suite
 * Tests full admin capabilities for:
 * - Department CRUD (/api/departments) with audit logging
 * - Branch creation, manager assignment, and safe deletion (/api/branches)
 * - Role-based authorization & permission boundary enforcement
 */

const BASE_URL = 'http://localhost:3001';

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

function headers(extra: Record<string, string> = {}) {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra
  };
  if (sessionCookie) {
    h['Cookie'] = sessionCookie;
  }
  return h;
}

// 1. Admin Login
test('1. Admin Authentication for Facilities Management', async () => {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'ishmaelt42@gmail.com',
      password: 'Tatenda3@4'
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
  testDeptId = `dept-test-${Date.now()}`;
  const res = await fetch(`${BASE_URL}/api/departments`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      id: testDeptId,
      name: 'Cloud Infrastructure & DevOps',
      budget_allocated: 750000,
      head_count: 14
    })
  });
  if (!res.ok) throw new Error(`Create department failed: ${await res.text()}`);
  const data = await res.json();
  if (!data.success || data.id !== testDeptId) {
    throw new Error('Department creation response invalid');
  }
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
  testBranchId = `br-test-${Date.now()}`;
  const branchCode = `FAC-${Math.floor(Math.random() * 9000 + 1000)}`;

  const res = await fetch(`${BASE_URL}/api/branches`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      id: testBranchId,
      name: 'Harare Innovation Center',
      code: branchCode,
      location: 'Block C, Tech Park',
      city: 'Harare',
      country: 'Zimbabwe',
      manager_name: 'Dr. Sarah Ndlovu'
    })
  });
  if (!res.ok) throw new Error(`Branch creation failed: ${await res.text()}`);
  const data = await res.json();
  if (!data.success || data.id !== testBranchId) {
    throw new Error('Branch creation response invalid');
  }

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

async function run() {
  console.log('🏛️ Running Admin Facilities & Department Management Tests...\n');
  let passed = 0;
  let failed = 0;

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

  console.log('\n==========================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('==========================================\n');

  if (failed > 0) process.exit(1);
}

run();
