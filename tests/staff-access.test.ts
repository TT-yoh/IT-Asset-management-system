/**
 * Staff without system access.
 * Only IT and management roles sign in; the USER role is a staff record that can hold
 * assets but never gets an invite, a password or a session. Covers:
 * 1. Adding staff (with and without an email) sends no invite.
 * 2. Staff are refused at sign-in, on every request, on invite links and password resets.
 * 3. Granting access (role change) issues an invite; removing it cancels a pending one.
 */

if (process.env.NODE_ENV !== 'test') {
  throw new Error('Test execution aborted: NODE_ENV must be set to "test" via cross-env');
}

import http from 'http';
import { app } from '../server/index';
import { createSessionToken, hashPassword, hashToken } from '../server/auth';
import { query } from '../server/db';

const ORG = 'test-org-staffaccess';
const BRANCH = 'test-br-staffaccess';
const ADMIN = 'test-staffaccess-admin';

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

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: parsed };
}

async function userRow(id: string) {
  const rows = await query<any>(
    'SELECT `email`, `role`, `status`, `version`, `invite_token_hash`, `reset_token_hash` FROM `users` WHERE `id` = ? LIMIT 1;',
    [id]
  );
  return rows[0];
}

async function clean() {
  await query('DELETE FROM `audit_logs` WHERE `org_id` = ?;', [ORG]);
  await query('DELETE FROM `audit_chain_heads` WHERE `org_id` = ?;', [ORG]);
  await query('DELETE FROM `users` WHERE `org_id` = ?;', [ORG]);
  await query('DELETE FROM `branches` WHERE `org_id` = ?;', [ORG]);
  await query('DELETE FROM `organizations` WHERE `id` = ?;', [ORG]);
}

async function run() {
  console.log('👥 Starting Staff Access (no-login staff) Tests...\n');
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  await clean();
  await query("INSERT INTO `organizations` (`id`, `name`, `type`) VALUES (?, 'Staff Access Corp', 'Enterprise');", [ORG]);
  await query(
    "INSERT INTO `branches` (`id`, `org_id`, `name`, `code`, `location`, `city`, `country`, `manager_name`) VALUES (?, ?, 'Staff Hub', 'BR-SA', 'HQ', 'Harare', 'Zimbabwe', 'Boss');",
    [BRANCH, ORG]
  );
  await query(
    "INSERT INTO `users` (`id`, `org_id`, `email`, `full_name`, `role`, `branch_id`, `branch_name`, `status`, `version`, `token_version`) VALUES (?, ?, 'admin@staffaccess.test', 'Staff Admin', 'ADMIN', ?, 'Staff Hub', 'ACTIVE', 1, 1);",
    [ADMIN, ORG, BRANCH]
  );
  const adminToken = createSessionToken({ userId: ADMIN, ver: 1 });

  console.log('--- Adding staff ---');
  const noEmail = await api('POST', '/api/users/invite', adminToken, { fullName: 'Shop Cashier', role: 'USER', branchId: BRANCH });
  check(noEmail.status === 201 && noEmail.body.systemAccess === false, 'Staff can be added with no email address', noEmail);
  const noEmailId = noEmail.body.userId;
  const noEmailRow = noEmailId ? await userRow(noEmailId) : null;
  check(noEmailRow?.status === 'ACTIVE' && !noEmailRow?.invite_token_hash && noEmailRow?.email === null,
    'Staff record is ACTIVE with no invite token and no email', noEmailRow);

  const withEmail = await api('POST', '/api/users/invite', adminToken, { fullName: 'Floor Clerk', email: 'clerk@staffaccess.test', role: 'USER', branchId: BRANCH });
  const clerkId = withEmail.body.userId;
  const clerkRow = clerkId ? await userRow(clerkId) : null;
  check(withEmail.status === 201 && clerkRow?.status === 'ACTIVE' && !clerkRow?.invite_token_hash,
    'Staff with an email still get no invitation', clerkRow);

  const managerNoEmail = await api('POST', '/api/users/invite', adminToken, { fullName: 'No Mail Manager', role: 'BRANCH_MANAGER', branchId: BRANCH });
  check(managerNoEmail.status === 400, 'Someone given system access must have an email', managerNoEmail);

  console.log('\n--- Staff cannot get in ---');
  const staffToken = createSessionToken({ userId: clerkId, ver: 1 });
  const me = await api('GET', '/api/auth/me', staffToken);
  check(me.status === 401, 'A session minted for staff is refused', me.status);

  await query('UPDATE `users` SET `password_hash` = ? WHERE `id` = ?;', [await hashPassword('Correct-Horse-91!'), clerkId]);
  const login = await api('POST', '/api/auth/login', undefined, { email: 'clerk@staffaccess.test', password: 'Correct-Horse-91!' });
  check(login.status === 403 && login.body.code === 'NO_SYSTEM_ACCESS', 'Staff with a correct password still cannot sign in', login);

  await api('POST', '/api/auth/forgot-password', undefined, { email: 'clerk@staffaccess.test' });
  check(!(await userRow(clerkId))?.reset_token_hash, 'A password reset is never issued to staff');

  const reinvite = await api('POST', `/api/users/${clerkId}/reinvite`, adminToken);
  check(reinvite.status === 409, 'Staff cannot be re-invited', reinvite.status);

  console.log('\n--- Granting and removing access ---');
  const v1 = (await userRow(noEmailId)).version;
  const grantNoEmail = await api('PUT', `/api/users/${noEmailId}`, adminToken, { role: 'IT_SUPPORT', baseVersion: v1 });
  check(grantNoEmail.status === 400, 'Access cannot be granted to someone without an email', grantNoEmail);

  const v2 = (await userRow(noEmailId)).version;
  const grant = await api('PUT', `/api/users/${noEmailId}`, adminToken, { role: 'IT_SUPPORT', email: 'cashier@staffaccess.test', baseVersion: v2 });
  const granted = await userRow(noEmailId);
  check(grant.status === 200 && granted.status === 'INVITED' && Boolean(granted.invite_token_hash),
    'Granting access issues an invitation', { status: grant.status, row: granted });

  // A known invite token, to prove the link dies when access is removed.
  await query('UPDATE `users` SET `invite_token_hash` = ? WHERE `id` = ?;', [hashToken('inv_staffaccess_known'), noEmailId]);
  const linkBefore = await api('GET', '/api/auth/invite/inv_staffaccess_known');
  check(linkBefore.status === 200, 'The invitation link works while they have access', linkBefore.status);

  const v3 = (await userRow(noEmailId)).version;
  const revoke = await api('PUT', `/api/users/${noEmailId}`, adminToken, { role: 'USER', status: 'ACTIVE', baseVersion: v3 });
  const revoked = await userRow(noEmailId);
  check(revoke.status === 200 && revoked.status === 'ACTIVE' && !revoked.invite_token_hash,
    'Removing access cancels the pending invitation and keeps them active', { status: revoke.status, row: revoked });

  const linkAfter = await api('GET', '/api/auth/invite/inv_staffaccess_known');
  check(linkAfter.status === 404, 'The old invitation link stops working', linkAfter.status);
}

run()
  .catch((err) => {
    failed++;
    console.error('Unexpected error:', err);
  })
  .finally(async () => {
    try { await clean(); } catch { /* best effort */ }
    server?.close();
    console.log(`\nStaff Access Summary: ${passed} Passed, ${failed} Failed`);
    process.exit(failed > 0 ? 1 : 0);
  });
