/**
 * Phase 4 Comprehensive Automated Test Suite:
 * Authentication, Sessions, CSRF, Password Policy, Rate Limiting & TOTP 2FA Hardening
 */

import crypto from 'crypto';
import app from '../server/index';
import config from '../server/config';
import { query, getDbPool, setForceInMemoryForTest, resetInMemoryStore } from '../server/db';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  create2FAPendingToken,
  verify2FAPendingToken,
  generateBase32Secret,
  verifyTOTPCode,
  generateTOTPCode,
  encryptTotpSecret,
  decryptTotpSecret,
  generateRecoveryCodes,
  hashToken,
  validatePasswordPolicy,
  checkLockout,
  recordFailedLogin,
  recordSuccessfulLogin,
  recordFailedTotpAttempt,
  clearFailedTotpAttempts,
  DUMMY_BCRYPT_HASH,
  SESSION_TTL_SECONDS
} from '../server/auth';
import { cookieParserMiddleware, csrfProtection, authenticate, invalidateUserCache } from '../server/middleware';
import { getLatestTestPasswordResetToken, clearTestMailbox } from '../server/mailer';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('\n🔒 Starting OmniAsset Phase 4: Auth, Sessions & 2FA Test Suite...\n');

  // Ensure test mode
  if (config.NODE_ENV !== 'test') {
    throw new Error('Tests must run in NODE_ENV=test');
  }

  // Teardown / setup test org & branch
  const testOrgId = 'org-auth-test';
  const testBranchId = 'branch-auth-test';
  const testDeptId = 'dept-auth-test';

  try {
    await query('DELETE FROM recovery_codes WHERE user_id LIKE "usr-auth-%";');
    await query('DELETE FROM login_attempts WHERE email LIKE "%@auth-test.internal" OR ip = ?;', [testIp]);
    await query('DELETE FROM users WHERE org_id = ?;', [testOrgId]);
    await query('DELETE FROM departments WHERE org_id = ?;', [testOrgId]);
    await query('DELETE FROM branches WHERE org_id = ?;', [testOrgId]);
    await query('DELETE FROM organizations WHERE id = ?;', [testOrgId]);
  } catch {}

  await query('INSERT INTO organizations (id, name, type) VALUES (?, ?, ?);', [testOrgId, 'Auth Test Org', 'Enterprise']);
  await query('INSERT INTO branches (id, org_id, name, code, location, city, country, manager_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?);', [testBranchId, testOrgId, 'Auth Test Branch', 'BR-AUTH-01', 'Test Location', 'Harare', 'Zimbabwe', 'Manager One']);
  await query('INSERT INTO departments (id, org_id, name) VALUES (?, ?, ?);', [testDeptId, testOrgId, 'Engineering']);

  // --------------------------------------------------------------------------
  // 1. Password Verification & Backdoor Removal (4.1)
  // --------------------------------------------------------------------------
  console.log('--- 1. Password Verification & Backdoor Removal (4.1) ---');
  const plainPass = 'CorrectHorseBattery123!';
  const hashedPass = await hashPassword(plainPass);
  assert(hashedPass.startsWith('$2a$12$') || hashedPass.startsWith('$2b$12$'), 'bcrypt hash uses cost 12');
  assert(await verifyPassword(plainPass, hashedPass), 'verifyPassword succeeds with correct password');
  assert(!(await verifyPassword('WrongPassword123!', hashedPass)), 'verifyPassword rejects incorrect password');

  // Timing equalization: DUMMY_BCRYPT_HASH executes bcrypt against invalid input
  const dummyStart = Date.now();
  await verifyPassword('any_password', DUMMY_BCRYPT_HASH);
  const dummyElapsed = Date.now() - dummyStart;
  assert(dummyElapsed >= 10, 'DUMMY_BCRYPT_HASH executes cost-12 comparison for timing resistance');

  // --------------------------------------------------------------------------
  // 2. Session Tokens: Two Dot-Separated Parts & Tamper Resistance (4.2 & 4.3)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Session Tokens & Signature Verification (4.2 & 4.3) ---');
  const token = createSessionToken({ userId: 'usr-auth-01', ver: 1 });
  const parts = token.split('.');
  assert(parts.length === 2, 'Session token consists of exactly two dot-separated parts');

  const claims = verifySessionToken(token);
  assert(claims !== null && claims.userId === 'usr-auth-01' && claims.ver === 1, 'Valid session token verifies successfully');
  assert(typeof claims?.jti === 'string' && claims?.jti.length > 0, 'Session token includes jti claim');
  assert(typeof claims?.iat === 'number' && typeof claims?.exp === 'number', 'Session token includes iat and exp claims');

  // Tampered payload
  const tamperedToken = `${parts[0]}tampered.${parts[1]}`;
  assert(verifySessionToken(tamperedToken) === null, 'Tampered token payload is rejected');

  // Tampered signature
  const badSigToken = `${parts[0]}.${parts[1]}bad`;
  assert(verifySessionToken(badSigToken) === null, 'Tampered token signature is rejected');

  // Non two-part tokens
  assert(verifySessionToken('part1.part2.part3') === null, 'Three-part token is rejected');
  assert(verifySessionToken('singlepart') === null, 'Single-part token is rejected');

  // --------------------------------------------------------------------------
  // 3. Authenticate Middleware & Sliding Session Refresh (4.2)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Authenticate Middleware & Token Version Revocation (4.2) ---');
  const activeUserId = 'usr-auth-active';
  const activeUserEmail = 'active@auth-test.internal';
  await query(`
    INSERT INTO users (id, org_id, email, full_name, role, status, branch_id, branch_name, password_hash, token_version, version)
    VALUES (?, ?, ?, ?, 'USER', 'ACTIVE', ?, 'Auth Test Branch', ?, 1, 1);
  `, [activeUserId, testOrgId, activeUserEmail, 'Active User', testBranchId, hashedPass]);

  // Request with valid session cookie
  const mockReq: any = {
    cookies: { session_token: token },
    headers: {}
  };
  // Token minted with ver: 1 for activeUserId
  const validTokenForActive = createSessionToken({ userId: activeUserId, ver: 1 });
  mockReq.cookies.session_token = validTokenForActive;

  let nextCalled = false;
  const mockRes: any = {
    cookie: () => {},
    status: (code: number) => ({ json: (data: any) => ({ code, data }) })
  };

  await authenticate(mockReq, mockRes, () => { nextCalled = true; });
  assert(nextCalled, 'authenticate middleware succeeds for active user with matching token_version');
  assert(mockReq.auth?.userId === activeUserId && mockReq.auth?.role === 'USER', 'req.auth populated with fresh DB user record');

  // Token revocation: bump token_version in DB
  await query('UPDATE users SET token_version = token_version + 1 WHERE id = ?;', [activeUserId]);
  invalidateUserCache(activeUserId);

  let rejectCalled = false;
  const rejectRes: any = {
    status: (code: number) => {
      rejectCalled = true;
      assert(code === 401, 'Status code 401 returned on revoked token_version');
      return { json: () => {} };
    }
  };
  await authenticate(mockReq, rejectRes, () => {});
  assert(rejectCalled, 'authenticate middleware rejects token with outdated token_version');

  // Inactive user rejection
  const suspendedUserId = 'usr-auth-suspended';
  await query(`
    INSERT INTO users (id, org_id, email, full_name, role, status, branch_id, password_hash, token_version)
    VALUES (?, ?, 'suspended@auth-test.internal', 'Suspended User', 'USER', 'SUSPENDED', ?, ?, 1);
  `, [suspendedUserId, testOrgId, testBranchId, hashedPass]);

  const suspendedToken = createSessionToken({ userId: suspendedUserId, ver: 1 });
  mockReq.cookies.session_token = suspendedToken;
  let suspendedRejected = false;
  const suspRes: any = {
    status: (code: number) => {
      suspendedRejected = true;
      assert(code === 401, 'Suspended user session rejected with 401');
      return { json: () => {} };
    }
  };
  await authenticate(mockReq, suspRes, () => {});
  assert(suspendedRejected, 'authenticate middleware rejects non-ACTIVE user accounts');

  // --------------------------------------------------------------------------
  // 4. CSRF Defense Middleware (4.4)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. CSRF Defense (4.4) ---');
  // Mutating request with cookie but WITHOUT X-Requested-With
  let csrfBlocked = false;
  const csrfReq: any = {
    method: 'POST',
    headers: { origin: 'http://localhost:3000' },
    cookies: { session_token: validTokenForActive }
  };
  const csrfRes: any = {
    status: (code: number) => {
      csrfBlocked = true;
      assert(code === 403, 'CSRF blocked with 403 when X-Requested-With is missing');
      return { json: () => {} };
    }
  };
  csrfProtection(csrfReq, csrfRes, () => {});
  assert(csrfBlocked, 'Cookie-authenticated mutating request blocked without custom header');

  // Mutating request with X-Requested-With and allowed origin
  csrfReq.headers['x-requested-with'] = 'XMLHttpRequest';
  let csrfPassed = false;
  csrfProtection(csrfReq, csrfRes, () => { csrfPassed = true; });
  assert(csrfPassed, 'Cookie-authenticated mutating request succeeds with X-Requested-With');

  // Bearer token requests exempt from CSRF
  const bearerReq: any = {
    method: 'POST',
    headers: { authorization: 'Bearer some_token' },
    cookies: {}
  };
  let bearerPassed = false;
  csrfProtection(bearerReq, csrfRes, () => { bearerPassed = true; });
  assert(bearerPassed, 'Bearer-token request is exempt from CSRF check');

  // --------------------------------------------------------------------------
  // 5. Robust Cookie Parser (4.5)
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Cookie Parser Robustness (4.5) ---');
  const parserReq: any = {
    headers: {
      cookie: 'session_token=token_val==; weird_val="quoted=val"; malformed=%E0%A4%A%ZZ'
    }
  };
  cookieParserMiddleware(parserReq, {} as any, () => {});
  assert(parserReq.cookies.session_token === 'token_val==', 'Cookie parser splits on first = correctly');
  assert(parserReq.cookies.weird_val === 'quoted=val', 'Cookie parser unquotes values correctly');
  assert(typeof parserReq.cookies.malformed === 'string', 'Cookie parser never throws on malformed URI percent-encoding');

  // --------------------------------------------------------------------------
  // 6. Database Throttling & Account Lockout (4.6 & 4.7)
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Login Throttling & Exponential Lockout (4.6 & 4.7) ---');
  const throttleEmail = 'victim@auth-test.internal';
  const testIp = '198.51.100.42';

  // Clear previous attempts
  await query('DELETE FROM login_attempts WHERE email = ? OR ip = ?;', [throttleEmail, testIp]);
  await recordSuccessfulLogin(throttleEmail, testIp);
  let lockStatus = await checkLockout(throttleEmail, testIp);
  assert(!lockStatus.isLocked, 'Fresh account is not locked');

  // Fail 4 times
  for (let i = 0; i < 4; i++) {
    const res = await recordFailedLogin(throttleEmail, testIp);
    assert(!res.lockedNow, `Failed attempt ${i + 1} does not lock account prematurely`);
  }

  // 5th failed attempt triggers lockout
  const fifthAttempt = await recordFailedLogin(throttleEmail, testIp);
  assert(fifthAttempt.lockedNow, '5th failed attempt locks the account');
  assert(fifthAttempt.remainingMinutes >= 5, 'Exponential backoff assigns at least 5 minute lock');

  lockStatus = await checkLockout(throttleEmail, testIp);
  assert(lockStatus.isLocked, 'checkLockout confirms account is locked');

  // Reset on successful login
  await recordSuccessfulLogin(throttleEmail, testIp);
  lockStatus = await checkLockout(throttleEmail, testIp);
  assert(!lockStatus.isLocked, 'recordSuccessfulLogin clears lockout');

  // --------------------------------------------------------------------------
  // 7. TOTP / 2FA & Secret Encryption (4.8)
  // --------------------------------------------------------------------------
  console.log('\n--- 7. TOTP 2FA, Replay Protection & AES-256-GCM (4.8) ---');
  const secret = generateBase32Secret(20);
  assert(secret.length === 32, 'generateBase32Secret generates 32 Base32 characters (160 bits)');

  // AES-256-GCM encryption at rest
  const encSecret = encryptTotpSecret(secret);
  assert(encSecret.includes(':') && encSecret.split(':').length === 3, 'encryptTotpSecret formats IV:Tag:Ciphertext');
  const decrypted = decryptTotpSecret(encSecret);
  assert(decrypted === secret, 'decryptTotpSecret successfully decrypts ciphertext to original secret');

  // TOTP validation format check (multibyte & non-digits)
  assert(!verifyTOTPCode(secret, 'abcdef').valid, 'Rejects non-numeric code');
  assert(!verifyTOTPCode(secret, '12345').valid, 'Rejects 5-digit code');
  assert(!verifyTOTPCode(secret, '1234567').valid, 'Rejects 7-digit code');
  assert(!verifyTOTPCode(secret, '漢字1234').valid, 'Rejects multibyte string cleanly without throwing RangeError');

  // Valid TOTP generation and verification
  const currentCode = generateTOTPCode(secret, 0);
  const verifyResult = verifyTOTPCode(secret, currentCode, null);
  assert(verifyResult.valid, 'Valid 6-digit TOTP code verifies successfully');
  assert(typeof verifyResult.step === 'number', 'TOTP verification returns the accepted step number');

  // Replay Protection: Re-using the same code/step must be rejected!
  const replayResult = verifyTOTPCode(secret, currentCode, verifyResult.step);
  assert(!replayResult.valid, 'Replay protection rejects code re-submitted with step <= lastStep');

  // 2FA Pending Challenge Token
  const challenge = create2FAPendingToken('usr-challenge-test');
  const challengeClaims = verify2FAPendingToken(challenge);
  assert(challengeClaims?.userId === 'usr-challenge-test', 'Single-use 2FA pending challenge verifies correctly');

  // Recovery codes generation
  const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
  assert(plainCodes.length === 8 && hashedCodes.length === 8, 'Generates 8 one-time backup recovery codes');
  assert(hashedCodes[0] === hashToken(plainCodes[0]!), 'Recovery codes are correctly hashed with SHA-256');

  // --------------------------------------------------------------------------
  // 8. Password Policy Validation (4.11)
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Password Policy (4.11) ---');
  assert(!validatePasswordPolicy('short123!').valid, 'Rejects password shorter than 12 characters');
  assert(!validatePasswordPolicy('password1234').valid, 'Rejects common dictionary password');
  assert(!validatePasswordPolicy('admin123456!').valid, 'Rejects common admin password');
  assert(!validatePasswordPolicy('john.doe1234567', { email: 'john.doe@company.com' }).valid, 'Rejects password containing email');
  assert(!validatePasswordPolicy('AliceSmith1234!', { fullName: 'Alice Smith' }).valid, 'Rejects password containing user name');
  assert(validatePasswordPolicy('Xy9#mK2$pL8@vW1!').valid, 'Accepts strong 16-character complex passphrase');

  // --------------------------------------------------------------------------
  // 9. Forgot Password Token Mailer & Zero Plaintext Leaks (4.9 & 4.10)
  // --------------------------------------------------------------------------
  console.log('\n--- 9. Token Hashing, Mailer & Zero Leakage (4.9 & 4.10) ---');
  clearTestMailbox();

  // Forgot password request via API
  const probeEmail = 'active@auth-test.internal';
  const server = app.listen(0);
  const serverPort = (server.address() as any).port;
  let forgotStatus = 0;
  let forgotBody: any = null;
  try {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: probeEmail })
    });
    forgotStatus = res.status;
    forgotBody = await res.json().catch(() => null);
  } finally {
    server.close();
  }
  assert(forgotStatus === 200, 'POST /api/auth/forgot-password returns 200');
  assert(!forgotBody?.resetToken, 'POST /api/auth/forgot-password NEVER returns reset token in response');

  // In test mode, verify token is available through in-process mailer hook
  const capturedToken = getLatestTestPasswordResetToken(probeEmail);
  assert(typeof capturedToken === 'string' && capturedToken.length > 20, 'Mailer delivers reset token through test hook');

  // Verify DB stores ONLY the SHA-256 hash, NEVER the plaintext token!
  const resetUserRows = await query<any>('SELECT reset_token_hash FROM users WHERE email = ? LIMIT 1;', [probeEmail]);
  const storedHash = resetUserRows[0]?.reset_token_hash;
  assert(storedHash && storedHash === hashToken(capturedToken!), 'Database stores SHA-256 hash of reset token, never plaintext');

  // --------------------------------------------------------------------------
  // Teardown
  // --------------------------------------------------------------------------
  try {
    await query('DELETE FROM recovery_codes WHERE user_id LIKE "usr-auth-%";');
    await query('DELETE FROM login_attempts WHERE email LIKE "%@auth-test.internal" OR ip = ?;', [testIp]);
    await query('DELETE FROM users WHERE org_id = ?;', [testOrgId]);
    await query('DELETE FROM departments WHERE org_id = ?;', [testOrgId]);
    await query('DELETE FROM branches WHERE org_id = ?;', [testOrgId]);
    await query('DELETE FROM organizations WHERE id = ?;', [testOrgId]);
  } catch {}

  console.log(`\n==========================================`);
  console.log(`Auth Hardening Results: ${testsPassed} Passed, ${testsFailed} Failed`);
  console.log(`==========================================\n`);

  if (testsFailed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test Suite Fatal Error:', err);
  process.exit(1);
});
