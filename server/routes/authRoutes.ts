import { Router, Request, Response } from 'express';
import config from '../config';
import { query } from '../db';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  create2FAPendingToken,
  verify2FAPendingToken,
  generateBase32Secret,
  verifyTOTPCode,
  encryptTotpSecret,
  decryptTotpSecret,
  generateRecoveryCodes,
  hashToken,
  generateSecureToken,
  validatePasswordPolicy,
  checkLockout,
  recordFailedLogin,
  recordSuccessfulLogin,
  recordFailedTotpAttempt,
  clearFailedTotpAttempts,
  DUMMY_BCRYPT_HASH,
  SESSION_TTL_SECONDS
} from '../auth';
import { authenticate, invalidateUserCache } from '../middleware';
import { sendPasswordResetEmail } from '../mailer';

export const authRouter = Router();

/**
 * 4.1 & 4.6: Corporate User Sign-In
 * Strict order of operations:
 * 1. Lockout check (email AND ip)
 * 2. Load user from database
 * 3. ALWAYS run bcrypt (dummy hash for non-existent users)
 * 4. Evaluate credentials & status (identical generic 401 for wrong pass, unknown user, INVITED, SUSPENDED)
 * 5. Handle 2FA challenge if enabled
 * 6. Issue session token (exactly two dot-separated parts) & set httpOnly secure cookie
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password, totpCode, challengeToken, recoveryCode } = req.body;
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';

  // Handle 2FA completion with challengeToken
  if (challengeToken && (totpCode || recoveryCode)) {
    const challenge = verify2FAPendingToken(String(challengeToken).trim());
    if (!challenge) {
      res.status(401).json({ error: '2FA challenge expired or invalid. Please sign in again.' });
      return;
    }

    const users = await query<any>(
      'SELECT `id`, `org_id`, `email`, `full_name`, `role`, `department_id`, `department_name`, `branch_id`, `branch_name`, `two_factor_enabled`, `two_factor_secret_enc`, `totp_last_step`, `avatar`, `status`, `token_version`, `is_super_admin` FROM `users` WHERE `id` = ? LIMIT 1;',
      [challenge.userId]
    );
    const user = users[0];
    if (!user || user.status !== 'ACTIVE') {
      res.status(401).json({ error: 'Invalid corporate credentials.' });
      return;
    }

    let totpSuccess = false;

    if (totpCode) {
      const cleanTotp = String(totpCode).trim();
      const rawSecret = user.two_factor_secret_enc || '';
      const decryptedSecret = decryptTotpSecret(rawSecret);
      const verifyResult = verifyTOTPCode(decryptedSecret, cleanTotp, user.totp_last_step);

      if (verifyResult.valid && verifyResult.step) {
        totpSuccess = true;
        await query('UPDATE `users` SET `totp_last_step` = ? WHERE `id` = ?;', [verifyResult.step, user.id]);
      }
    } else if (recoveryCode) {
      const cleanCode = String(recoveryCode).trim().toLowerCase();
      const codeHash = hashToken(cleanCode);
      const recRows = await query<any>(
        'SELECT `id` FROM `recovery_codes` WHERE `user_id` = ? AND `code_hash` = ? AND `used` = 0 LIMIT 1;',
        [user.id, codeHash]
      );
      if (recRows.length > 0) {
        totpSuccess = true;
        await query('UPDATE `recovery_codes` SET `used` = 1, `used_at` = NOW() WHERE `id` = ?;', [recRows[0]!.id]);
      }
    }

    if (!totpSuccess) {
      const totpFail = await recordFailedTotpAttempt(user.id);
      if (totpFail.locked) {
        res.status(429).json({ error: 'Too many invalid 2FA attempts. Account locked for 15 minutes. Please log in again later.' });
        return;
      }
      res.status(401).json({ error: 'Invalid two-factor authentication code or recovery code.' });
      return;
    }

    await clearFailedTotpAttempts(user.id);
    await recordSuccessfulLogin(user.email, clientIp);

    const sessionToken = createSessionToken({ userId: user.id, ver: user.token_version || 1 });
    res.cookie('session_token', sessionToken, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS * 1000
    });

    res.json({
      user: {
        id: user.id,
        orgId: user.org_id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        departmentId: user.department_id,
        departmentName: user.department_name,
        branchId: user.branch_id,
        branchName: user.branch_name,
        twoFactorEnabled: Boolean(user.two_factor_enabled),
        avatar: user.avatar,
        status: user.status
      }
    });
    return;
  }

  // Standard Login Flow
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const cleanEmail = String(email).trim().toLowerCase();

  // 1. Lockout check (email AND ip)
  const lockout = await checkLockout(cleanEmail, clientIp);
  if (lockout.isLocked) {
    res.status(429).json({
      error: `Account temporarily locked due to repeated failed logins. Please try again in ${lockout.remainingMinutes} minute(s).`
    });
    return;
  }

  // 2. Load user
  const users = await query<any>(
    'SELECT `id`, `org_id`, `email`, `full_name`, `role`, `department_id`, `department_name`, `branch_id`, `branch_name`, `password_hash`, `two_factor_enabled`, `two_factor_secret_enc`, `totp_last_step`, `avatar`, `status`, `token_version`, `is_super_admin` FROM `users` WHERE LOWER(`email`) = ? LIMIT 1;',
    [cleanEmail]
  );
  const user = users[0];

  // 3. ALWAYS run bcrypt (use dummy hash if user does not exist for timing equalization)
  const hashToVerify = user && user.password_hash ? user.password_hash : DUMMY_BCRYPT_HASH;
  const isPasswordValid = await verifyPassword(String(password), hashToVerify);

  // 4. Evaluate status & credentials: fail closed with generic error
  if (!user || !isPasswordValid || user.status === 'INVITED' || user.status === 'SUSPENDED' || user.status === 'DELETED') {
    const failResult = await recordFailedLogin(cleanEmail, clientIp);
    if (failResult.lockedNow) {
      res.status(429).json({
        error: `Too many failed login attempts. Your account is locked for ${failResult.remainingMinutes} minutes.`
      });
      return;
    }
    // Generic error: never reveal account state pre-auth
    res.status(401).json({ error: 'Invalid corporate credentials.' });
    return;
  }

  // 5. 2FA verification if enabled
  if (user.two_factor_enabled) {
    if (totpCode || recoveryCode) {
      let totpValid = false;
      if (totpCode) {
        const cleanTotp = String(totpCode).trim();
        const rawSecret = user.two_factor_secret_enc || '';
        const decryptedSecret = decryptTotpSecret(rawSecret);
        const result = verifyTOTPCode(decryptedSecret, cleanTotp, user.totp_last_step);
        if (result.valid && result.step) {
          totpValid = true;
          await query('UPDATE `users` SET `totp_last_step` = ? WHERE `id` = ?;', [result.step, user.id]);
        }
      } else if (recoveryCode) {
        const cleanCode = String(recoveryCode).trim().toLowerCase();
        const codeHash = hashToken(cleanCode);
        const recRows = await query<any>(
          'SELECT `id` FROM `recovery_codes` WHERE `user_id` = ? AND `code_hash` = ? AND `used` = 0 LIMIT 1;',
          [user.id, codeHash]
        );
        if (recRows.length > 0) {
          totpValid = true;
          await query('UPDATE `recovery_codes` SET `used` = 1, `used_at` = NOW() WHERE `id` = ?;', [recRows[0]!.id]);
        }
      }

      if (!totpValid) {
        const totpFail = await recordFailedTotpAttempt(user.id);
        if (totpFail.locked) {
          res.status(429).json({ error: 'Too many invalid 2FA attempts. Account locked for 15 minutes.' });
          return;
        }
        res.status(401).json({ error: 'Invalid two-factor authentication code or recovery code.' });
        return;
      }
    } else {
      // Issue short-lived 5-minute single-use signed challenge
      const challengeToken = create2FAPendingToken(user.id);
      res.status(200).json({
        requires2FA: true,
        challengeToken,
        message: 'Two-factor authentication code required.'
      });
      return;
    }
  }

  // Successful authentication
  await clearFailedTotpAttempts(user.id);
  await recordSuccessfulLogin(cleanEmail, clientIp);

  const sessionToken = createSessionToken({ userId: user.id, ver: user.token_version || 1 });

  res.cookie('session_token', sessionToken, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000
  });

  res.json({
    user: {
      id: user.id,
      orgId: user.org_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      departmentId: user.department_id,
      departmentName: user.department_name,
      branchId: user.branch_id,
      branchName: user.branch_name,
      twoFactorEnabled: Boolean(user.two_factor_enabled),
      avatar: user.avatar,
      status: user.status
    }
  });
});

/**
 * 4.2 & 4.3: Logout - Clears session cookie AND bumps token_version
 */
authRouter.post('/logout', async (req: Request, res: Response) => {
  const cookieToken = (req as any).cookies?.session_token;
  if (cookieToken) {
    try {
      const parts = cookieToken.split('.');
      if (parts.length === 2) {
        const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (claims.userId) {
          await query('UPDATE `users` SET `token_version` = `token_version` + 1 WHERE `id` = ?;', [claims.userId]);
          invalidateUserCache(claims.userId);
        }
      }
    } catch {
      // Silent error on invalid cookie format
    }
  }

  res.clearCookie('session_token', {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/'
  });

  res.json({ success: true, message: 'Logged out successfully.' });
});

/**
 * 4.1 & 4.2: Get current user profile from authenticated session
 * Super admin special case removed. Authenticates solely via loaded DB user.
 */
authRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  const users = await query<any>(
    'SELECT `id`, `org_id`, `email`, `full_name`, `role`, `department_id`, `department_name`, `branch_id`, `branch_name`, `two_factor_enabled`, `avatar`, `status`, `is_super_admin` FROM `users` WHERE `id` = ? LIMIT 1;',
    [req.auth!.userId]
  );

  const u = users[0];
  if (!u) {
    res.status(404).json({ error: 'User profile not found.' });
    return;
  }

  res.json({
    user: {
      id: u.id,
      orgId: u.org_id,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      departmentId: u.department_id,
      departmentName: u.department_name,
      branchId: u.branch_id,
      branchName: u.branch_name,
      twoFactorEnabled: Boolean(u.two_factor_enabled),
      avatar: u.avatar,
      status: u.status,
      isSuperAdmin: Boolean(u.is_super_admin)
    }
  });
});

/**
 * 4.8: Setup 2FA TOTP:
 * Generates 160-bit secret, encrypts with AES-256-GCM, stores SERVER-SIDE.
 */
authRouter.post('/2fa/setup', authenticate, async (req: Request, res: Response) => {
  const secret = generateBase32Secret(20); // 20 bytes = 160 bits (32 base32 chars)
  const encryptedSecret = encryptTotpSecret(secret);

  // Store encrypted pending secret server-side
  await query(
    'UPDATE `users` SET `two_factor_secret_enc` = ? WHERE `id` = ?;',
    [encryptedSecret, req.auth!.userId]
  );
  invalidateUserCache(req.auth!.userId);

  const otpAuthUri = `otpauth://totp/OmniAsset:${encodeURIComponent(req.auth!.email)}?secret=${secret}&issuer=OmniAsset`;

  res.json({
    secret,
    otpAuthUri,
    instructions: 'Scan this secret in your authenticator app (Google Authenticator, Authy, 1Password) and verify with a 6-digit code.'
  });
});

/**
 * 4.8: Verify & Activate 2FA TOTP
 * Verifies against stored server-side secret (never accepts client-supplied secret!).
 * Bumps token_version, generates 8 one-time hashed recovery codes.
 */
authRouter.post('/2fa/verify', authenticate, async (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code) {
    res.status(400).json({ error: 'Verification code is required.' });
    return;
  }

  const users = await query<any>(
    'SELECT `two_factor_secret_enc`, `totp_last_step` FROM `users` WHERE `id` = ? LIMIT 1;',
    [req.auth!.userId]
  );

  const rawEncSecret = users[0]?.two_factor_secret_enc;
  if (!rawEncSecret) {
    res.status(400).json({ error: 'No 2FA setup found. Please initiate 2FA setup first.' });
    return;
  }

  const decryptedSecret = decryptTotpSecret(rawEncSecret);
  const verifyResult = verifyTOTPCode(decryptedSecret, String(code), users[0]?.totp_last_step);

  if (!verifyResult.valid || !verifyResult.step) {
    res.status(400).json({ error: 'Invalid TOTP verification code. Please check your authenticator clock.' });
    return;
  }

  // Generate 8 one-time backup recovery codes
  const { plainCodes, hashedCodes } = generateRecoveryCodes(8);

  // Clear existing recovery codes for user
  await query('DELETE FROM `recovery_codes` WHERE `user_id` = ?;', [req.auth!.userId]);

  // Insert newly hashed recovery codes
  for (const hCode of hashedCodes) {
    await query('INSERT INTO `recovery_codes` (`id`, `user_id`, `code_hash`, `used`) VALUES (?, ?, ?, 0);', [
      generateSecureToken('rc'),
      req.auth!.userId,
      hCode
    ]);
  }

  // Activate 2FA, record monotonic step, bump token_version
  await query(
    'UPDATE `users` SET `two_factor_enabled` = 1, `totp_last_step` = ?, `token_version` = `token_version` + 1, `version` = `version` + 1 WHERE `id` = ?;',
    [verifyResult.step, req.auth!.userId]
  );
  invalidateUserCache(req.auth!.userId);

  res.json({
    success: true,
    recoveryCodes: plainCodes,
    message: 'Two-factor authentication verified and enabled. Please store your backup recovery codes safely.'
  });
});

/**
 * 4.8: Disable 2FA TOTP:
 * Requires password AND valid TOTP or recovery code.
 * Bumps token_version, clears secrets and recovery codes.
 */
authRouter.post('/2fa/disable', authenticate, async (req: Request, res: Response) => {
  const { password, code, recoveryCode } = req.body;
  const userId = req.auth!.userId;

  if (!password || (!code && !recoveryCode)) {
    res.status(400).json({ error: 'Current password and a valid 2FA code or recovery code are required.' });
    return;
  }

  const users = await query<any>(
    'SELECT `password_hash`, `two_factor_secret_enc`, `totp_last_step` FROM `users` WHERE `id` = ? LIMIT 1;',
    [userId]
  );
  const user = users[0];
  if (!user || !user.password_hash) {
    res.status(401).json({ error: 'Password confirmation failed.' });
    return;
  }

  const isPasswordValid = await verifyPassword(String(password), user.password_hash);
  if (!isPasswordValid) {
    res.status(401).json({ error: 'Password confirmation failed.' });
    return;
  }

  let codeValid = false;
  if (code) {
    const rawSecret = user.two_factor_secret_enc || '';
    const decryptedSecret = decryptTotpSecret(rawSecret);
    const verifyResult = verifyTOTPCode(decryptedSecret, String(code), user.totp_last_step);
    if (verifyResult.valid) {
      codeValid = true;
    }
  } else if (recoveryCode) {
    const codeHash = hashToken(String(recoveryCode).trim().toLowerCase());
    const recRows = await query<any>(
      'SELECT `id` FROM `recovery_codes` WHERE `user_id` = ? AND `code_hash` = ? AND `used` = 0 LIMIT 1;',
      [userId, codeHash]
    );
    if (recRows.length > 0) {
      codeValid = true;
      await query('UPDATE `recovery_codes` SET `used` = 1, `used_at` = NOW() WHERE `id` = ?;', [recRows[0]!.id]);
    }
  }

  if (!codeValid) {
    res.status(401).json({ error: 'Invalid 2FA code or recovery code.' });
    return;
  }

  // Disable 2FA, purge recovery codes, bump token_version
  await query(
    'UPDATE `users` SET `two_factor_enabled` = 0, `two_factor_secret_enc` = NULL, `totp_last_step` = NULL, `token_version` = `token_version` + 1, `version` = `version` + 1 WHERE `id` = ?;',
    [userId]
  );
  await query('DELETE FROM `recovery_codes` WHERE `user_id` = ?;', [userId]);
  invalidateUserCache(userId);

  res.json({ success: true, message: 'Two-factor authentication disabled.' });
});

/**
 * 4.9: GET /api/auth/invite/:token
 * Validates invitation token by SHA-256 hash. Returns preview info.
 */
authRouter.get('/invite/:token', async (req: Request, res: Response) => {
  const token = String(req.params.token || '').trim();
  if (!token) {
    res.status(400).json({ valid: false, error: 'Invitation token is required.' });
    return;
  }

  const tokenHash = hashToken(token);
  const users = await query<any>(
    'SELECT `id`, `org_id`, `email`, `full_name`, `role`, `department_name`, `branch_name`, `status`, `invited_at`, `invite_expires_at` FROM `users` WHERE `invite_token_hash` = ? LIMIT 1;',
    [tokenHash]
  );

  if (users.length === 0) {
    res.status(404).json({ valid: false, error: 'Invitation token not found. Please verify the link or request a new invite from your administrator.' });
    return;
  }

  const user = users[0]!;
  if (user.status !== 'INVITED') {
    res.status(409).json({
      valid: false,
      error: 'This invitation token has already been activated. Please sign in with your password.',
      code: 'INVITATION_ALREADY_ACTIVATED'
    });
    return;
  }

  if (user.invite_expires_at && new Date(user.invite_expires_at).getTime() < Date.now()) {
    res.status(410).json({ valid: false, error: 'Invitation token has expired. Please request a new invite from your administrator.' });
    return;
  }

  // Fetch company/org branding
  const orgs = await query<any>(
    'SELECT `id`, `name`, `type`, `branding_color` FROM `organizations` WHERE `id` = ? LIMIT 1;',
    [user.org_id]
  );
  const organization = orgs.length > 0 ? orgs[0] : {
    id: user.org_id,
    name: 'Enterprise Organization',
    brandingColor: '#0ea5e9'
  };

  res.json({
    valid: true,
    user: {
      id: user.id,
      orgId: user.org_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      departmentName: user.department_name,
      branchName: user.branch_name,
      invitedAt: user.invited_at
    },
    organization: {
      id: organization.id,
      name: organization.name,
      brandingColor: organization.branding_color || organization.brandingColor || '#0ea5e9'
    }
  });
});

/**
 * 4.8 & 4.9 & 4.11: Activate Invited Account
 * Single-use token hash lookup. Does NOT accept twoFactorEnabled from client!
 * Validates password policy. Issues session cookie.
 */
authRouter.post('/activate', async (req: Request, res: Response) => {
  const inviteToken = req.body.inviteToken || req.body.invite_token;
  const newPassword = req.body.newPassword || req.body.password;

  if (!inviteToken || !newPassword) {
    res.status(400).json({ error: 'Invite token and new password are required.' });
    return;
  }

  const cleanToken = String(inviteToken).trim();
  const tokenHash = hashToken(cleanToken);

  const users = await query<any>(
    "SELECT `id`, `org_id`, `email`, `full_name`, `role`, `department_id`, `department_name`, `branch_id`, `branch_name`, `status`, `invite_expires_at`, `token_version` FROM `users` WHERE `invite_token_hash` = ? AND `status` = 'INVITED' LIMIT 1;",
    [tokenHash]
  );

  if (users.length === 0) {
    res.status(404).json({ error: 'Invalid or already activated invitation token.' });
    return;
  }

  const user = users[0]!;

  if (user.invite_expires_at && new Date(user.invite_expires_at).getTime() < Date.now()) {
    res.status(410).json({ error: 'Invitation token has expired. Please request a new invite.' });
    return;
  }

  // Validate password policy
  const policyCheck = validatePasswordPolicy(newPassword, { email: user.email, fullName: user.full_name });
  if (!policyCheck.valid) {
    res.status(400).json({ error: policyCheck.error });
    return;
  }

  const hashedPassword = await hashPassword(newPassword);

  // Consume token and activate account (Enrolment of 2FA happens after login)
  await query(
    "UPDATE `users` SET `password_hash` = ?, `status` = 'ACTIVE', `invite_token_hash` = NULL, `invite_expires_at` = NULL, `password_changed_at` = NOW(), `token_version` = `token_version` + 1, `version` = `version` + 1 WHERE `id` = ?;",
    [hashedPassword, user.id]
  );
  invalidateUserCache(user.id);

  // Issue session token
  const sessionToken = createSessionToken({ userId: user.id, ver: (user.token_version || 1) + 1 });

  res.cookie('session_token', sessionToken, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000
  });

  const orgs = await query<any>(
    'SELECT `id`, `name`, `type`, `branding_color` FROM `organizations` WHERE `id` = ? LIMIT 1;',
    [user.org_id]
  );
  const organization = orgs.length > 0 ? orgs[0] : {
    id: user.org_id,
    name: 'Enterprise Organization',
    brandingColor: '#0ea5e9'
  };

  res.json({
    success: true,
    message: 'Account successfully activated.',
    user: {
      id: user.id,
      orgId: user.org_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      departmentId: user.department_id,
      departmentName: user.department_name,
      branchId: user.branch_id,
      branchName: user.branch_name,
      twoFactorEnabled: false,
      avatar: '',
      status: 'ACTIVE'
    },
    organization: {
      id: organization.id,
      name: organization.name,
      brandingColor: organization.branding_color || organization.brandingColor || '#0ea5e9'
    }
  });
});

/**
 * 4.10: Forgot Password Flow
 * NEVER returns token in HTTP response in any environment.
 * Generates token hash, sets 30-min expiry, dispatches via mailer.
 * Returns identical generic response for existing and non-existing accounts.
 */
authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const users = await query<any>(
    "SELECT `id`, `status` FROM `users` WHERE LOWER(`email`) = ? AND `status` = 'ACTIVE' LIMIT 1;",
    [cleanEmail]
  );

  if (users.length > 0) {
    const rawToken = generateSecureToken('rst');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

    await query(
      'UPDATE `users` SET `reset_token_hash` = ?, `reset_expires_at` = ? WHERE `id` = ?;',
      [tokenHash, expiresAt, users[0]!.id]
    );

    // Deliver via mailer
    await sendPasswordResetEmail(cleanEmail, rawToken);
  } else {
    // Timing equalization for non-existent users
    await verifyPassword('dummy_timing_probe', DUMMY_BCRYPT_HASH);
  }

  // Consistent response: NEVER leak account existence or reset token in response
  res.json({
    success: true,
    message: 'If the email matches an active account, password reset instructions have been recorded.'
  });
});

/**
 * 4.10 & 4.11: Reset Password with Token
 * Token hash lookup, single-use consumption, enforces password policy, bumps token_version.
 */
authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const { resetToken, newPassword } = req.body;

  if (!resetToken || !newPassword) {
    res.status(400).json({ error: 'Reset token and new password are required.' });
    return;
  }

  const cleanToken = String(resetToken).trim();
  const tokenHash = hashToken(cleanToken);

  const users = await query<any>(
    'SELECT `id`, `email`, `full_name`, `reset_expires_at` FROM `users` WHERE `reset_token_hash` = ? LIMIT 1;',
    [tokenHash]
  );

  if (users.length === 0) {
    res.status(400).json({ error: 'Invalid or expired password reset token.' });
    return;
  }

  const user = users[0]!;
  if (user.reset_expires_at && new Date(user.reset_expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'Password reset token has expired.' });
    return;
  }

  // Password policy check
  const policyCheck = validatePasswordPolicy(newPassword, { email: user.email, fullName: user.full_name });
  if (!policyCheck.valid) {
    res.status(400).json({ error: policyCheck.error });
    return;
  }

  const hashedPassword = await hashPassword(newPassword);

  // Consume token, update password, bump token_version (invalidating all previous sessions)
  await query(
    'UPDATE `users` SET `password_hash` = ?, `reset_token_hash` = NULL, `reset_expires_at` = NULL, `password_changed_at` = NOW(), `token_version` = `token_version` + 1, `version` = `version` + 1 WHERE `id` = ?;',
    [hashedPassword, user.id]
  );

  // Clear failed login attempts / throttles for this user
  await recordSuccessfulLogin(user.email);
  invalidateUserCache(user.id);

  res.json({ success: true, message: 'Password has been successfully updated. You may now sign in.' });
});

/**
 * 4.11: Self-service Password Change
 * Requires current password verification, enforces password policy, bumps token_version.
 */
authRouter.post('/change-password', authenticate, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.auth!.userId;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current password and new password are required.' });
    return;
  }

  const users = await query<any>('SELECT `password_hash`, `email`, `full_name` FROM `users` WHERE `id` = ? LIMIT 1;', [userId]);
  const user = users[0];

  if (!user || !user.password_hash) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  const isCurrentValid = await verifyPassword(currentPassword, user.password_hash);
  if (!isCurrentValid) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  const policyCheck = validatePasswordPolicy(newPassword, { email: user.email, fullName: user.full_name });
  if (!policyCheck.valid) {
    res.status(400).json({ error: policyCheck.error });
    return;
  }

  const newHash = await hashPassword(newPassword);

  await query(
    'UPDATE `users` SET `password_hash` = ?, `password_changed_at` = NOW(), `token_version` = `token_version` + 1, `version` = `version` + 1 WHERE `id` = ?;',
    [newHash, userId]
  );
  invalidateUserCache(userId);

  res.json({ success: true, message: 'Password has been successfully updated.' });
});

/**
 * 4.12: Self-service Profile Update
 * Whitelists fields (fullName, avatar, departmentId).
 * Caps avatar size, allows only https: or data:image/* URLs.
 * Validates department belongs to the user's organization.
 */
authRouter.put('/profile', authenticate, async (req: Request, res: Response) => {
  const { fullName, avatar, departmentId } = req.body;
  const userId = req.auth!.userId;
  const orgId = req.auth!.orgId;

  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    res.status(400).json({ error: 'Full name is required.' });
    return;
  }

  // Validate avatar URL if supplied
  if (avatar !== undefined && avatar !== null && avatar !== '') {
    if (typeof avatar !== 'string') {
      res.status(400).json({ error: 'Avatar must be a valid URL string.' });
      return;
    }

    const cleanAvatar = avatar.trim();
    const isHttps = cleanAvatar.startsWith('https://');
    const isDataImage = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(cleanAvatar);

    if (!isHttps && !isDataImage) {
      res.status(400).json({ error: 'Avatar must use https:// or data:image/* protocol.' });
      return;
    }

    // Cap avatar size (max ~500 KB / 700,000 characters)
    if (cleanAvatar.length > 700000) {
      res.status(400).json({ error: 'Avatar image payload exceeds 500KB size limit.' });
      return;
    }
  }

  // Validate department ownership if supplied
  let validatedDeptId: string | null = null;
  let validatedDeptName: string | null = null;

  if (departmentId !== undefined && departmentId !== null && String(departmentId).trim() !== '') {
    const deptRows = await query<any>(
      'SELECT `id`, `name` FROM `departments` WHERE `id` = ? AND `org_id` = ? LIMIT 1;',
      [String(departmentId).trim(), orgId]
    );

    if (deptRows.length === 0) {
      res.status(400).json({ error: 'Selected department does not exist in your organization.' });
      return;
    }

    validatedDeptId = deptRows[0]!.id;
    validatedDeptName = deptRows[0]!.name;
  }

  await query(
    'UPDATE `users` SET `full_name` = ?, `avatar` = COALESCE(?, `avatar`), `department_id` = COALESCE(?, `department_id`), `department_name` = COALESCE(?, `department_name`), `version` = `version` + 1 WHERE `id` = ? AND `org_id` = ?;',
    [fullName.trim(), avatar || null, validatedDeptId, validatedDeptName, userId, orgId]
  );
  invalidateUserCache(userId);

  res.json({
    success: true,
    message: 'Profile updated successfully.'
  });
});
