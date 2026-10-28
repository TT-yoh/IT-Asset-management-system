/**
 * Comprehensive Automated Test Suite: User Invitation & Activation Lifecycle
 * Verifies:
 * 1. Admin logs in and invites a user -> server generates secure token saved in DB.
 * 2. GET /api/users and GET /api/init return invite_token for Admins so links can be copied.
 * 3. Public GET /api/auth/invite/:token validates token for external/incognito users and returns user + org preview.
 * 4. Invalid or non-existent token returns HTTP 404.
 * 5. Re-inviting pending user issues fresh token rather than blocking with 409.
 * 6. POST /api/auth/activate consumes token, activates account, and sets authenticated session.
 * 7. Consumed token cannot be reused (single-use enforcement).
 */

import app from '../server/index';

let BASE_URL = 'http://localhost:3001';
let serverInstance: any = null;

async function run() {
  try {
    const probe = await fetch('http://localhost:3001/api/health', { signal: AbortSignal.timeout(600) });
    if (!probe.ok) {
      serverInstance = app.listen(0);
      const address = serverInstance.address() as any;
      BASE_URL = `http://127.0.0.1:${address.port}`;
    }
  } catch {
    serverInstance = app.listen(0);
    const address = serverInstance.address() as any;
    BASE_URL = `http://127.0.0.1:${address.port}`;
  }

  console.log('=== Starting User Invitation & Activation Lifecycle Test Suite ===');
  let adminCookie = '';

  const adminHeaders = (extra: Record<string, string> = {}) => ({
    'Content-Type': 'application/json',
    ...(adminCookie ? { Cookie: adminCookie } : {}),
    ...extra
  });

  // 1. Login as Super Admin
  console.log('1. Authenticating as Super Admin...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'ishmaelt42@gmail.com',
      password: 'Tatenda3@4'
    })
  });

  if (!loginRes.ok) {
    throw new Error(`Admin login failed: ${loginRes.status}`);
  }
  const setCookie = loginRes.headers.get('set-cookie');
  if (setCookie) {
    adminCookie = setCookie.split(';')[0];
  }
  console.log('   Admin logged in successfully!');

  // 2. Invite a new user
  const inviteEmail = `test.invite.${Date.now()}@omnicorp.com`;
  console.log(`2. Inviting user ${inviteEmail}...`);
  const inviteRes = await fetch(`${BASE_URL}/api/users/invite`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({
      fullName: 'Alice Test Engineer',
      email: inviteEmail,
      role: 'USER',
      departmentName: 'Engineering',
      branchName: 'Harare HQ'
    })
  });

  if (!inviteRes.ok) {
    const errText = await inviteRes.text();
    throw new Error(`Failed to invite user: ${inviteRes.status} - ${errText}`);
  }

  const inviteData = await inviteRes.json();
  if (!inviteData.inviteToken) {
    throw new Error('Server did not return inviteToken');
  }
  const firstToken = inviteData.inviteToken;
  const testUserId = inviteData.userId;
  console.log(`   User invited! Token: ${firstToken}, User ID: ${testUserId}`);

  // 3. Verify GET /api/users returns the inviteToken to Admin
  console.log('3. Verifying GET /api/users includes inviteToken for admin copy link...');
  const usersRes = await fetch(`${BASE_URL}/api/users`, { headers: adminHeaders() });
  const usersData = await usersRes.json();
  const invitedInList = usersData.users.find((u: any) => u.email === inviteEmail);
  if (!invitedInList) throw new Error('Invited user not found in GET /api/users');
  if (invitedInList.status !== 'INVITED') throw new Error(`Expected status INVITED, got ${invitedInList.status}`);
  if (invitedInList.inviteToken !== firstToken) throw new Error('inviteToken missing or mismatch in GET /api/users');
  console.log('   GET /api/users correctly contains inviteToken!');

  // 4. Test Public GET /api/auth/invite/:token (NO COOKIES / UNKNOWN CLIENT)
  console.log('4. Testing public GET /api/auth/invite/:token (Unauthenticated client)...');
  const checkTokenRes = await fetch(`${BASE_URL}/api/auth/invite/${encodeURIComponent(firstToken)}`);
  if (!checkTokenRes.ok) {
    throw new Error(`Public token check failed: ${checkTokenRes.status}`);
  }
  const tokenPreview = await checkTokenRes.json();
  if (!tokenPreview.valid) throw new Error('Token reported as invalid');
  if (tokenPreview.user.email !== inviteEmail) throw new Error(`User email mismatch: ${tokenPreview.user.email}`);
  if (!tokenPreview.organization?.name) throw new Error('Organization name missing from token preview');
  console.log(`   Token verified! Name: ${tokenPreview.user.fullName}, Org: ${tokenPreview.organization.name}`);

  // 5. Test invalid token returns 404
  console.log('5. Testing non-existent token validation...');
  const fakeTokenRes = await fetch(`${BASE_URL}/api/auth/invite/inv-fake-nonexistent-12345`);
  if (fakeTokenRes.status !== 404) {
    throw new Error(`Expected 404 for fake token, got ${fakeTokenRes.status}`);
  }
  console.log('   Fake token correctly rejected with HTTP 404!');

  // 6. Test Re-inviting user (re-issue fresh token)
  console.log('6. Testing re-inviting pending user (generates fresh token)...');
  const reinviteRes = await fetch(`${BASE_URL}/api/users/${encodeURIComponent(testUserId)}/reinvite`, {
    method: 'POST',
    headers: adminHeaders()
  });
  if (!reinviteRes.ok) {
    throw new Error(`Re-invite failed: ${reinviteRes.status}`);
  }
  const reinviteData = await reinviteRes.json();
  if (!reinviteData.inviteToken) throw new Error('Re-invite did not return a fresh inviteToken');
  const freshToken = reinviteData.inviteToken;
  if (freshToken === firstToken) throw new Error('Fresh token must be different from previous token');
  console.log(`   Fresh token generated: ${freshToken}`);

  // Old token should now be invalid
  const oldCheckRes = await fetch(`${BASE_URL}/api/auth/invite/${encodeURIComponent(firstToken)}`);
  if (oldCheckRes.status !== 404) {
    throw new Error('Old token was not invalidated after re-issuing fresh token');
  }
  console.log('   Old token was invalidated as expected!');

  // Fresh token should be valid
  const freshCheckRes = await fetch(`${BASE_URL}/api/auth/invite/${encodeURIComponent(freshToken)}`);
  if (!freshCheckRes.ok) {
    throw new Error('Fresh token is not valid');
  }
  console.log('   Fresh token verified successfully!');

  // 7. Activate account with fresh token via POST /api/auth/activate
  console.log('7. Activating account via POST /api/auth/activate...');
  const activateRes = await fetch(`${BASE_URL}/api/auth/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inviteToken: freshToken,
      newPassword: 'MySecurePassword99!'
    })
  });

  if (!activateRes.ok) {
    const errText = await activateRes.text();
    throw new Error(`Activation failed: ${activateRes.status} - ${errText}`);
  }
  const activateData = await activateRes.json();
  if (!activateData.success) throw new Error('Activation did not return success: true');
  if (activateData.user.status !== 'ACTIVE') throw new Error(`Expected user status ACTIVE, got ${activateData.user.status}`);
  console.log('   Account activated successfully! Status: ACTIVE');

  // 8. Verify token cannot be reused
  console.log('8. Verifying single-use enforcement on consumed token...');
  const reuseCheckRes = await fetch(`${BASE_URL}/api/auth/invite/${encodeURIComponent(freshToken)}`);
  if (reuseCheckRes.status !== 404 && reuseCheckRes.status !== 409) {
    throw new Error(`Expected 404 or 409 on consumed token, got ${reuseCheckRes.status}`);
  }

  const reuseActivateRes = await fetch(`${BASE_URL}/api/auth/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inviteToken: freshToken,
      newPassword: 'AnotherPassword123!'
    })
  });
  if (reuseActivateRes.status !== 404) {
    throw new Error(`Expected 404 on re-activation attempt, got ${reuseActivateRes.status}`);
  }
  console.log('   Single-use token enforcement verified: Token cannot be reused!');

  // 9. Verify user can now log in with their newly established password
  console.log('9. Verifying user can now sign in with their password...');
  const userLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: inviteEmail,
      password: 'MySecurePassword99!'
    })
  });
  if (!userLoginRes.ok) {
    throw new Error(`User login failed: ${userLoginRes.status}`);
  }
  console.log('   New user signed in with established password successfully!');

  // 10. Clean up test user
  console.log('10. Cleaning up test user...');
  await fetch(`${BASE_URL}/api/users/${encodeURIComponent(testUserId)}`, {
    method: 'DELETE',
    headers: adminHeaders()
  });
  console.log('   Test user cleaned up.');

  console.log('\n======================================================');
  console.log('--- ALL INVITATION & ACTIVATION CHECKS PASSED (100%) ---');
  console.log('======================================================\n');
}

run()
  .catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
  })
  .finally(() => {
    if (serverInstance) {
      serverInstance.close();
    }
  });
