import { AssetService } from '../src/lib/asset-service';
import type { Asset } from '../src/types';

const BASE_URL = 'http://localhost:3001';

async function run() {
  console.log('--- Starting Redundancy Check Test Suite ---');
  let sessionCookie = '';

  const headers = (extra: Record<string, string> = {}) => ({
    'Content-Type': 'application/json',
    ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    ...extra
  });

  // 1. Login as Super Admin
  console.log('1. Logging in as Admin...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      email: 'ishmaelt42@gmail.com',
      password: 'Tatenda3@4'
    })
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}`);
  }
  const setCookie = loginRes.headers.get('set-cookie');
  if (setCookie) {
    sessionCookie = setCookie.split(';')[0];
  }
  console.log('   Admin login successful!');

  // 2. Register a baseline asset with unique Tag and Serial
  const testId = `ast-red-${Date.now()}`;
  const baselineTag = `TAG-RED-${Date.now()}`;
  const baselineSerial = `SN-RED-${Date.now()}`;
  const baselineMac = `00:1A:2B:3C:${Math.floor(Math.random() * 89 + 10)}:${Math.floor(Math.random() * 89 + 10)}`;
  const baselineImei = `356938035${Math.floor(Math.random() * 899999 + 100000)}`;

  console.log(`2. Registering baseline asset: tag=${baselineTag}, serial=${baselineSerial}...`);
  const createBaselineRes = await fetch(`${BASE_URL}/api/assets`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      id: testId,
      name: 'Baseline Redundancy Test Laptop',
      asset_code: baselineTag,
      category: 'LAPTOP',
      model: 'ThinkPad X1 Carbon Gen 11',
      brand: 'Lenovo',
      serial_number: baselineSerial,
      mac_address: baselineMac,
      imei_number: baselineImei,
      status: 'ACTIVE',
      condition: 'EXCELLENT',
      purchase_cost: 1800,
      current_value: 1800,
      purchase_date: '2025-01-01',
      warranty_months: 36,
      branch_name: 'HQ Campus'
    })
  });

  if (!createBaselineRes.ok) {
    const errText = await createBaselineRes.text();
    throw new Error(`Failed to create baseline asset: ${createBaselineRes.status} - ${errText}`);
  }
  console.log('   Baseline asset created successfully!');

  // 3. Test GET /api/assets/check-redundancy with baseline tag
  console.log(`3. Testing GET /api/assets/check-redundancy with tag=${baselineTag}...`);
  const checkTagRes = await fetch(
    `${BASE_URL}/api/assets/check-redundancy?assetCode=${encodeURIComponent(baselineTag)}`,
    { headers: headers() }
  );
  const tagData = await checkTagRes.json();
  if (!tagData.tagConflict) {
    throw new Error(`Expected tagConflict for ${baselineTag}, but got null`);
  }
  console.log(`   Conflict detected as expected: "${tagData.tagConflict.name}" has tag ${baselineTag}`);

  // 4. Test GET /api/assets/check-redundancy with baseline serial
  console.log(`4. Testing GET /api/assets/check-redundancy with serial=${baselineSerial}...`);
  const checkSerialRes = await fetch(
    `${BASE_URL}/api/assets/check-redundancy?serialNumber=${encodeURIComponent(baselineSerial)}`,
    { headers: headers() }
  );
  const serialData = await checkSerialRes.json();
  if (!serialData.serialConflict) {
    throw new Error(`Expected serialConflict for ${baselineSerial}, but got null`);
  }
  console.log(`   Conflict detected as expected: "${serialData.serialConflict.name}" has serial ${baselineSerial}`);

  // 5. Test GET /api/assets/check-redundancy with unique tag
  const uniqueTag = `AST-UNIQ-${Date.now()}`;
  console.log(`5. Testing GET /api/assets/check-redundancy with unique tag ${uniqueTag}...`);
  const checkUniqueRes = await fetch(
    `${BASE_URL}/api/assets/check-redundancy?assetCode=${encodeURIComponent(uniqueTag)}`,
    { headers: headers() }
  );
  const uniqueData = await checkUniqueRes.json();
  if (uniqueData.tagConflict) {
    throw new Error(`Expected no tagConflict for ${uniqueTag}, but got conflict`);
  }
  console.log('   No conflict detected for unique tag as expected!');

  // 6. Test POST /api/assets duplicate asset tag collision (Expect 409 Conflict)
  console.log('6. Testing POST /api/assets with duplicate asset tag (Expect HTTP 409)...');
  const duplicateTagPayload = {
    id: `ast-test-${Date.now()}`,
    name: 'Duplicate Tag Attempt Device',
    asset_code: baselineTag,
    category: 'LAPTOP',
    model: 'Test ThinkPad',
    brand: 'Lenovo',
    serial_number: `SN-UNIQ-${Date.now()}`,
    status: 'ACTIVE',
    condition: 'EXCELLENT',
    purchase_cost: 1200,
    current_value: 1200,
    purchase_date: '2025-01-01',
    warranty_months: 36,
    branch_name: 'HQ Campus'
  };

  const dupTagRes = await fetch(`${BASE_URL}/api/assets`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(duplicateTagPayload)
  });

  if (dupTagRes.status !== 409) {
    throw new Error(`Expected 409 Conflict for duplicate tag, got HTTP ${dupTagRes.status}`);
  }
  const dupTagError = await dupTagRes.json();
  console.log(`   HTTP 409 Conflict returned as expected: "${dupTagError.error}"`);

  // 7. Test POST /api/assets duplicate serial number collision (Expect 409 Conflict)
  console.log(`7. Testing POST /api/assets with duplicate serial number ${baselineSerial} (Expect HTTP 409)...`);
  const duplicateSerialPayload = {
    id: `ast-test-ser-${Date.now()}`,
    name: 'Duplicate Serial Attempt Device',
    asset_code: `AST-DIFF-${Date.now()}`,
    category: 'LAPTOP',
    model: 'Test Dell XPS',
    brand: 'Dell',
    serial_number: baselineSerial,
    status: 'ACTIVE',
    condition: 'EXCELLENT',
    purchase_cost: 1500,
    current_value: 1500,
    purchase_date: '2025-01-01',
    warranty_months: 36,
    branch_name: 'HQ Campus'
  };

  const dupSerialRes = await fetch(`${BASE_URL}/api/assets`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(duplicateSerialPayload)
  });

  if (dupSerialRes.status !== 409) {
    throw new Error(`Expected 409 Conflict for duplicate serial, got HTTP ${dupSerialRes.status}`);
  }
  const dupSerialError = await dupSerialRes.json();
  console.log(`   HTTP 409 Conflict returned as expected: "${dupSerialError.error}"`);

  // 8. Test AssetService.processBulkCSV with redundant and valid rows
  console.log('8. Testing AssetService.processBulkCSV duplicate detection within batch & against existing inventory...');
  const mockExisting: Asset[] = [
    {
      id: 'mock-1',
      orgId: 'org-1',
      assetCode: 'AST-EXISTING-001',
      serialNumber: 'SN-EXISTING-001',
      name: 'Existing Laptop',
      category: 'LAPTOP',
      model: 'MacBook Pro',
      brand: 'Apple',
      status: 'AVAILABLE',
      condition: 'EXCELLENT',
      purchaseCost: 2000,
      currentValue: 2000,
      purchaseDate: '2025-01-01',
      warrantyExpiry: '2028-01-01',
      branchId: 'br-1',
      branchName: 'Harare HQ'
    }
  ];

  const csvContent = [
    'assetCode,name,category,brand,model,serialNumber,purchaseCost,purchaseDate,branchName',
    'AST-EXISTING-001,Colliding With Existing,LAPTOP,Apple,MacBook Pro,SN-NEW-001,2000,2025-01-01,Harare HQ', // Conflict with existing tag
    'AST-NEW-002,Colliding Serial With Existing,LAPTOP,Apple,MacBook Pro,SN-EXISTING-001,2000,2025-01-01,Harare HQ', // Conflict with existing serial
    'AST-NEW-003,First Occurrence in Batch,LAPTOP,Dell,XPS 15,SN-BATCH-001,1800,2025-01-01,Harare HQ', // Valid
    'AST-NEW-003,Duplicate Tag in Same Batch,LAPTOP,Dell,XPS 15,SN-BATCH-002,1800,2025-01-01,Harare HQ', // Duplicate tag in batch
    'AST-NEW-004,Duplicate Serial in Same Batch,LAPTOP,Dell,XPS 15,SN-BATCH-001,1800,2025-01-01,Harare HQ', // Duplicate serial in batch
    'AST-NEW-005,Valid Unique Laptop,LAPTOP,Lenovo,ThinkPad T14,SN-BATCH-005,1400,2025-01-01,Harare HQ' // Valid
  ].join('\n');

  const bulkResult = AssetService.processBulkCSV(csvContent, 'org-1', 'Harare HQ', mockExisting);
  console.log(`   Bulk CSV parsed: ${bulkResult.createdAssets.length} created, ${bulkResult.errorCount} skipped/redundant.`);
  console.log(`   Validation errors recorded: ${bulkResult.errors.length}`);
  bulkResult.errors.forEach(e => console.log(`     - Row ${e.row}: ${e.message}`));

  if (bulkResult.createdAssets.length !== 2) {
    throw new Error(`Expected exactly 2 valid created assets, got ${bulkResult.createdAssets.length}`);
  }
  if (bulkResult.errorCount !== 4) {
    throw new Error(`Expected exactly 4 skipped duplicate assets, got ${bulkResult.errorCount}`);
  }

  // 9. Clean up test baseline asset
  console.log('9. Cleaning up test baseline asset...');
  await fetch(`${BASE_URL}/api/assets/${encodeURIComponent(testId)}`, {
    method: 'DELETE',
    headers: headers()
  });
  console.log('   Cleaned up test asset.');

  console.log('\n======================================================');
  console.log('--- ALL REDUNDANCY & DUPLICATE CHECKS PASSED (100%) ---');
  console.log('======================================================\n');
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
