/**
 * Resilience checks:
 * 1. Assigning an asset (checkout) bumps the asset's version and returns it, so an edit
 *    based on the old version is refused instead of silently overwriting the new holder.
 * 2. Database connection failures are recognised (retry-safe) and reported as a clear
 *    503 DB_UNAVAILABLE, while ordinary SQL errors are not mistaken for outages.
 */

if (process.env.NODE_ENV !== 'test') {
  throw new Error('Test execution aborted: NODE_ENV must be set to "test" via cross-env');
}

import http from 'http';
import { app } from '../server/index';
import { createSessionToken } from '../server/auth';
import { query, isDbConnectError, databaseUnavailableError } from '../server/db';

const ORG = 'test-org-resilience';
const BRANCH = 'test-br-resilience';
const ADMIN = 'test-resilience-admin';
const HOLDER = 'test-resilience-holder';
const ASSET = 'test-ast-resilience';

let server: http.Server;
let baseUrl = '';
let passed = 0;
let failed = 0;

function check(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${label}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`);
  }
}

async function api(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: parsed };
}

async function clean() {
  await query('DELETE FROM `audit_logs` WHERE `org_id` = ?;', [ORG]);
  await query('DELETE FROM `audit_chain_heads` WHERE `org_id` = ?;', [ORG]);
  await query('DELETE FROM `checkouts` WHERE `org_id` = ?;', [ORG]);
  await query('DELETE FROM `assets` WHERE `org_id` = ?;', [ORG]);
  await query('DELETE FROM `users` WHERE `org_id` = ?;', [ORG]);
  await query('DELETE FROM `branches` WHERE `org_id` = ?;', [ORG]);
  await query('DELETE FROM `organizations` WHERE `id` = ?;', [ORG]);
}

async function run() {
  console.log('🛟 Starting Resilience Tests...\n');
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  await clean();
  await query("INSERT INTO `organizations` (`id`, `name`, `type`) VALUES (?, 'Resilience Corp', 'Enterprise');", [ORG]);
  await query(
    "INSERT INTO `branches` (`id`, `org_id`, `name`, `code`, `location`, `city`, `country`, `manager_name`) VALUES (?, ?, 'Res Hub', 'BR-RES', 'HQ', 'Harare', 'Zimbabwe', 'Boss');",
    [BRANCH, ORG]
  );
  await query(
    "INSERT INTO `users` (`id`, `org_id`, `email`, `full_name`, `role`, `branch_id`, `branch_name`, `status`, `version`, `token_version`) VALUES (?, ?, 'admin@resilience.test', 'Res Admin', 'ADMIN', ?, 'Res Hub', 'ACTIVE', 1, 1), (?, ?, NULL, 'Shop Cashier', 'USER', ?, 'Res Hub', 'ACTIVE', 1, 1);",
    [ADMIN, ORG, BRANCH, HOLDER, ORG, BRANCH]
  );
  await query("INSERT IGNORE INTO `asset_categories` (`id`, `name`, `depreciation_years`) VALUES ('test-cat-res', 'Hardware', 3);");
  await query(
    "INSERT INTO `assets` (`id`, `org_id`, `branch_id`, `category_id`, `asset_code`, `name`, `serial_number`, `status`, `purchase_date`, `purchase_cost`, `version`) VALUES (?, ?, ?, 'test-cat-res', 'RES-001', 'Receipt Printer', 'SN-RES-1', 'ACTIVE', '2026-01-01', 100, 1);",
    [ASSET, ORG, BRANCH]
  );
  const token = createSessionToken({ userId: ADMIN, ver: 1 });

  console.log('--- Assigning bumps the asset version ---');
  const checkout = await api('POST', '/api/checkouts', token, { assetId: ASSET, checkedOutToUserId: HOLDER, reason: 'Till 3' });
  const [row] = await query<any>('SELECT `version`, `assigned_to_user_id` FROM `assets` WHERE `id` = ?;', [ASSET]);
  check(checkout.status === 201 && Number(row.version) === 2 && row.assigned_to_user_id === HOLDER,
    'Assigning moves the asset to version 2', { status: checkout.status, row });
  check(checkout.body?.assetVersion === 2, 'The reply tells the app the new version (2)', checkout.body);

  const stale = await api('PUT', `/api/assets/${ASSET}`, token, { name: 'Renamed from a stale screen', baseVersion: 1 });
  check(stale.status === 409, 'An edit based on the pre-assignment version is refused', stale);

  const fresh = await api('PUT', `/api/assets/${ASSET}`, token, { name: 'Receipt Printer (till 3)', baseVersion: 2 });
  check(fresh.status === 200 && fresh.body?.version === 3, 'An edit based on the new version saves', fresh);

  console.log('\n--- Database outages are recognised ---');
  const unreachable = Object.assign(new Error(''), {
    code: 'EHOSTUNREACH',
    errors: [{ code: 'EHOSTUNREACH' }, { code: 'EHOSTUNREACH' }]
  });
  check(isDbConnectError(unreachable), '"Host unreachable" counts as an outage (safe to retry)');
  check(isDbConnectError({ code: 'ECONNREFUSED' }), '"Connection refused" counts as an outage');
  check(!isDbConnectError({ code: 'ER_DUP_ENTRY' }), 'A duplicate-entry SQL error is not an outage');
  check(!isDbConnectError({ code: 'ECONNRESET' }), 'A connection dropped mid-statement is not retried (the write may have happened)');
  const err = databaseUnavailableError(unreachable);
  check(err.statusCode === 503 && err.code === 'DB_UNAVAILABLE' && err.expose === true && /try again/i.test(err.message),
    'Outages become a 503 DB_UNAVAILABLE with a message users can act on', { status: err.statusCode, code: err.code });
}

run()
  .catch((err) => {
    failed++;
    console.error('Unexpected error:', err);
  })
  .finally(async () => {
    try { await clean(); } catch { /* best effort */ }
    server?.close();
    console.log(`\nResilience Summary: ${passed} Passed, ${failed} Failed`);
    process.exit(failed > 0 ? 1 : 0);
  });
