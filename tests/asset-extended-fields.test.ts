/**
 * Extended asset fields API round trip (migration 008).
 * Creates, reads and updates an asset through the HTTP API in an isolated
 * throwaway tenant that is removed afterwards.
 */
if (process.env.NODE_ENV !== 'test') {
  throw new Error('Test execution aborted: NODE_ENV must be set to "test" via cross-env');
}

import crypto from 'crypto';
import app from '../server/index';
import { query, closePool } from '../server/db';
import { seedTestTenant, SeedTestTenantResult } from './helpers';

let passed = 0;
let failed = 0;
let BASE_URL = '';
let tenant: SeedTestTenantResult | null = null;

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ❌ FAIL: ${name}`);
    console.log(`     ${err?.message || err}`);
  }
}

/** JSON text with object keys sorted: a JSON column does not preserve key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)))
      : v
  );
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = canonical(actual);
  const e = canonical(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

function headers(extra: Record<string, string> = {}) {
  return {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    Cookie: `session_token=${tenant!.sessionToken}`,
    ...extra
  };
}

async function api(method: string, path: string, body?: any, extra: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: headers(extra),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function fetchAsset(assetId: string) {
  const { status, data } = await api('GET', '/api/assets');
  if (status !== 200) throw new Error(`GET /api/assets returned ${status}: ${JSON.stringify(data)}`);
  const row = (data.assets as any[]).find((a) => a.id === assetId);
  if (!row) throw new Error('asset not returned by GET /api/assets');
  return row;
}

const parseSpecs = (raw: any) => (typeof raw === 'string' ? JSON.parse(raw) : raw);

async function main() {
  console.log('🧾 Running Extended Asset Fields Tests...\n');
  const server = app.listen(0);
  BASE_URL = `http://127.0.0.1:${(server.address() as any).port}`;

  const assetId = `ast-ext-${crypto.randomBytes(4).toString('hex')}`;
  const otherTenantDept = { id: '' };
  let otherTenant: SeedTestTenantResult | null = null;

  try {
    tenant = await seedTestTenant({ prefix: 'ext' });
    otherTenant = await seedTestTenant({ prefix: 'ext2' });
    otherTenantDept.id = otherTenant.departmentId;
    tenant.registerId('asset', assetId);
    const suffix = assetId.slice(-8).toUpperCase();

    await step('1. Create stores sourcing, ownership and category-specific details', async () => {
      const { status, data } = await api(
        'POST',
        '/api/assets',
        {
          id: assetId,
          name: 'Extended Fields Laptop',
          assetCode: `EXT-LPT-${suffix}`,
          serialNumber: `SN-EXT-${suffix}`,
          categoryId: 'cat-lap',
          categoryName: 'Laptops & Ultrabooks',
          branchId: tenant!.branchId,
          manufacturer: '  Dell  ',
          supplier: 'Acme IT Supplies',
          invoiceNumber: 'INV-2026-00412',
          locationDetail: '2nd floor, desk 14',
          departmentId: tenant!.departmentId,
          ownershipType: 'leased',
          leaseEndDate: '2028-06-30',
          specs: { cpu: 'Intel Core i7', ramGb: '32', diskEncrypted: true, rackPosition: 'not for laptops', junk: 'x' }
        },
        { 'Idempotency-Key': `ext-create-${suffix}` }
      );
      if (status !== 201 && status !== 200) throw new Error(`create returned ${status}: ${JSON.stringify(data)}`);

      const row = await fetchAsset(assetId);
      assertEqual(row.manufacturer, 'Dell', 'manufacturer is trimmed');
      assertEqual(row.supplier, 'Acme IT Supplies', 'supplier');
      assertEqual(row.invoice_number, 'INV-2026-00412', 'invoice number');
      assertEqual(row.location_detail, '2nd floor, desk 14', 'location detail');
      assertEqual(row.department_id, tenant!.departmentId, 'department id');
      if (!row.department_name) throw new Error('department name should be filled in from the database');
      assertEqual(row.ownership_type, 'LEASED', 'ownership type is normalised');
      assertEqual(String(row.lease_end_date).slice(0, 10), '2028-06-30', 'lease end date');
      assertEqual(parseSpecs(row.specs), { cpu: 'Intel Core i7', ramGb: 32, diskEncrypted: true }, 'specs are filtered and coerced');
    });

    await step('2. Update keeps fields that are not sent and changes the ones that are', async () => {
      const before = await fetchAsset(assetId);
      const { status, data } = await api('PUT', `/api/assets/${assetId}`, {
        baseVersion: before.version,
        supplier: 'New Supplier Ltd',
        specs: { cpu: 'Intel Core i9', ramGb: 64 }
      });
      if (status !== 200) throw new Error(`update returned ${status}: ${JSON.stringify(data)}`);

      const row = await fetchAsset(assetId);
      assertEqual(row.supplier, 'New Supplier Ltd', 'supplier changed');
      assertEqual(row.manufacturer, 'Dell', 'manufacturer kept');
      assertEqual(row.department_id, tenant!.departmentId, 'department kept');
      assertEqual(row.ownership_type, 'LEASED', 'ownership kept');
      assertEqual(parseSpecs(row.specs), { cpu: 'Intel Core i9', ramGb: 64 }, 'specs replaced');
    });

    await step('3. Switching to owned clears the lease date; empty values clear fields', async () => {
      const before = await fetchAsset(assetId);
      const { status, data } = await api('PUT', `/api/assets/${assetId}`, {
        baseVersion: before.version,
        ownershipType: 'OWNED',
        departmentId: '',
        invoiceNumber: ''
      });
      if (status !== 200) throw new Error(`update returned ${status}: ${JSON.stringify(data)}`);

      const row = await fetchAsset(assetId);
      assertEqual(row.ownership_type, 'OWNED', 'ownership');
      assertEqual(row.lease_end_date, null, 'lease end cleared');
      assertEqual(row.department_id, null, 'department cleared');
      assertEqual(row.department_name, null, 'department name cleared');
      assertEqual(row.invoice_number, null, 'invoice cleared');
    });

    await step('4. Changing category drops details that no longer apply', async () => {
      const before = await fetchAsset(assetId);
      const { status, data } = await api('PUT', `/api/assets/${assetId}`, {
        baseVersion: before.version,
        categoryId: 'cat-mon',
        categoryName: 'Monitors & AV Conferencing'
      });
      if (status !== 200) throw new Error(`update returned ${status}: ${JSON.stringify(data)}`);
      const row = await fetchAsset(assetId);
      assertEqual(row.specs, null, 'laptop specs removed for a monitor');
    });

    await step('5. A department from another organization is rejected', async () => {
      const before = await fetchAsset(assetId);
      const { status, data } = await api('PUT', `/api/assets/${assetId}`, {
        baseVersion: before.version,
        departmentId: otherTenantDept.id
      });
      assertEqual(status, 400, 'status');
      assertEqual(data?.code, 'INVALID_DEPARTMENT', 'error code');
      const row = await fetchAsset(assetId);
      assertEqual(row.department_id, null, 'department unchanged');
    });

    await step('6. An asset created without the new fields gets safe defaults', async () => {
      const plainId = `${assetId}-plain`;
      tenant!.registerId('asset', plainId);
      const { status, data } = await api(
        'POST',
        '/api/assets',
        {
          id: plainId,
          name: 'Plain Asset',
          assetCode: `EXT-GEN-${suffix}`,
          serialNumber: `SN-PLAIN-${suffix}`,
          categoryId: 'cat-periph',
          categoryName: 'Docks, Keyboards & Accessories',
          branchId: tenant!.branchId
        },
        { 'Idempotency-Key': `ext-plain-${suffix}` }
      );
      if (status !== 201 && status !== 200) throw new Error(`create returned ${status}: ${JSON.stringify(data)}`);
      const row = await fetchAsset(plainId);
      assertEqual(row.ownership_type, 'OWNED', 'default ownership');
      assertEqual(row.manufacturer, null, 'manufacturer empty');
      assertEqual(row.specs, null, 'specs empty');
    });
  } finally {
    if (tenant) await tenant.teardown().catch((err: any) => console.warn('Teardown notice:', err?.message));
    if (otherTenant) await otherTenant.teardown().catch((err: any) => console.warn('Teardown notice:', err?.message));
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('\n==========================================');
  console.log(`Extended Asset Fields Summary: ${passed} Passed, ${failed} Failed`);
  console.log('==========================================\n');

  await closePool().catch(() => undefined);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Extended asset fields test crashed:', err);
  process.exit(1);
});
