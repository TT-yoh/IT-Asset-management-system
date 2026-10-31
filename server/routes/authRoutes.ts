import { Router, Request, Response } from 'express';
import config from '../config';
import { query } from '../db';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  generateBase32Secret,
  verifyTOTPCode,
  checkLockout,
  recordFailedLogin,
  recordSuccessfulLogin,
  generateSecureToken
} from '../auth';
import { authenticate } from '../middleware';

export const authRouter = Router();

/**
 * Corporate User Sign-In with Lockout Rate-Limiting & TOTP 2FA Verification
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password, totpCode } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const cleanEmail = String(email).trim().toLowerCase();

  // Check lockout
  const lockout = checkLockout(cleanEmail);
  if (lockout.isLocked) {
    res.status(429).json({
      error: `Account temporarily locked due to repeated failed logins. Please try again in ${lockout.remainingMinutes} minute(s).`
    });
    return;
  }

  // Lookup user
  const users = await query<any>(
    'SELECT * FROM `users` WHERE LOWER(`email`) = ? LIMIT 1;',
    [cleanEmail]
  );

  const user = users[0];
  if (!user) {
    recordFailedLogin(cleanEmail);
    res.status(401).json({ error: 'Invalid corporate credentials.' });
    return;
  }

  if (user.status === 'INVITED') {
    res.status(403).json({
      error: 'Account has not been activated. Please complete invitation onboarding.'
    });
    return;
  }

  if (user.status === 'SUSPENDED') {
    res.status(403).json({ error: 'Account has been suspended by organization compliance.' });
    return;
  }

  // Password verification
  let validPassword = false;
  if (user.password_hash) {
    validPassword = await verifyPassword(password, user.password_hash);
  }

  if (!validPassword) {
    const failedStatus = recordFailedLogin(cleanEmail);
    if (failedStatus.lockedNow) {
      res.status(429).json({
        error: 'Too many failed login attempts. Your account is locked for 15 minutes.'
      });
      return;
    }
    res.status(401).json({ error: 'Invalid corporate credentials.' });
    return;
  }

  // 2FA Verification if enabled
  if (user.two_factor_enabled) {
    if (!totpCode) {
      res.status(200).json({
        requires2FA: true,
        message: 'Two-factor authentication code required.'
      });
      return;
    }

    const isTotpValid = verifyTOTPCode(user.two_factor_secret, String(totpCode));
    if (!isTotpValid) {
      res.status(401).json({ error: 'Invalid two-factor authentication code.' });
      return;
    }
  }

  recordSuccessfulLogin(cleanEmail);

  // Issue session token
  const tokenPayload = {
    userId: user.id,
    orgId: user.org_id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    branchId: user.branch_id || 'br-main',
    branchName: user.branch_name || 'Main Campus'
  };

  const sessionToken = createSessionToken(tokenPayload);

  // Set httpOnly, Secure, SameSite cookie
  res.cookie('session_token', sessionToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    maxAge: 2 * 60 * 60 * 1000 // 2 hours
  });

  // Return sanitized user profile (NO password, NO two_factor_secret)
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
 * Logout: Clears session cookie
 */
authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('session_token', {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict'
  });
  res.json({ success: true, message: 'Logged out successfully.' });
});

/**
 * Get currently authenticated profile from session
 */
authRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  const users = await query<any>(
    'SELECT `id`, `org_id`, `email`, `full_name`, `role`, `department_id`, `department_name`, `branch_id`, `branch_name`, `two_factor_enabled`, `avatar`, `status` FROM `users` WHERE `id` = ? LIMIT 1;',
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
      status: u.status
    }
  });
});

/**
 * Setup 2FA TOTP: Generates secret
 */
authRouter.post('/2fa/setup', authenticate, async (req: Request, res: Response) => {
  const secret = generateBase32Secret(20);
  const otpAuthUri = `otpauth://totp/OmniAsset:${encodeURIComponent(req.auth!.email)}?secret=${secret}&issuer=OmniAsset`;

  res.json({
    secret,
    otpAuthUri,
    instructions: 'Scan this secret in your authenticator app (Google Authenticator, Authy, 1Password) and verify with a 6-digit code.'
  });
});

/**
 * Verify & Activate 2FA TOTP
 */
authRouter.post('/2fa/verify', authenticate, async (req: Request, res: Response) => {
  const { secret, code } = req.body;

  if (!secret || !code) {
    res.status(400).json({ error: 'Secret and verification code are required.' });
    return;
  }

  const valid = verifyTOTPCode(secret, String(code));
  if (!valid) {
    res.status(400).json({ error: 'Invalid TOTP verification code. Please check your authenticator clock.' });
    return;
  }

  // Server-side activation only - client cannot arbitrarily set twoFactorEnabled
  await query(
    'UPDATE `users` SET `two_factor_enabled` = 1, `two_factor_secret` = ? WHERE `id` = ? AND `org_id` = ?;',
    [secret, req.auth!.userId, req.auth!.orgId]
  );

  res.json({ success: true, message: 'Two-factor authentication verified and enabled.' });
});

/**
 * Self-service Profile Update: updates full_name, avatar, department for the authenticated user
 */
authRouter.put('/profile', authenticate, async (req: Request, res: Response) => {
  const { fullName, avatar, departmentId, departmentName } = req.body;
  const userId = req.auth!.userId;
  const orgId = req.auth!.orgId;

  if (!fullName || !fullName.trim()) {
    res.status(400).json({ error: 'Full name is required.' });
    return;
  }

  try {
    await query(
      'UPDATE `users` SET `full_name` = ?, `avatar` = COALESCE(?, `avatar`), `department_id` = COALESCE(?, `department_id`), `department_name` = COALESCE(?, `department_name`) WHERE `id` = ? AND `org_id` = ?;',
      [fullName.trim(), avatar || null, departmentId || null, departmentName || null, userId, orgId]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully.'
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to update profile: ${err.message}` });
  }
});

/**
 * Self-service Password Change: verifies current password and updates password_hash
 */
authRouter.post('/change-password', authenticate, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.auth!.userId;
  const email = req.auth!.email.toLowerCase();

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current password and new password are required.' });
    return;
  }

  if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    res.status(400).json({
      error: 'New password must be at least 8 characters long and contain both letters and numbers.'
    });
    return;
  }

  const users = await query<any>('SELECT * FROM `users` WHERE `id` = ? LIMIT 1;', [userId]);
  const user = users[0];

  let validCurrent = false;
  if (user && user.password_hash) {
    validCurrent = await verifyPassword(currentPassword, user.password_hash);
  }

  if (!validCurrent) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  const newHash = await hashPassword(newPassword);

  await query(
    'UPDATE `users` SET `password_hash` = ?, `password` = NULL WHERE `id` = ?;',
    [newHash, userId]
  );

  res.json({ success: true, message: 'Password has been successfully updated.' });
});

/**
 * Disable 2FA TOTP
 */
authRouter.post('/2fa/disable', authenticate, async (req: Request, res: Response) => {
  const { password } = req.body;
  const userId = req.auth!.userId;
  const email = req.auth!.email.toLowerCase();

  const users = await query<any>('SELECT * FROM `users` WHERE `id` = ? LIMIT 1;', [userId]);
  const user = users[0];

  let validCurrent = false;
  if (user && user.password_hash) {
    validCurrent = await verifyPassword(password, user.password_hash);
  }

  if (!validCurrent) {
    res.status(401).json({ error: 'Password confirmation failed.' });
    return;
  }

  await query(
    'UPDATE `users` SET `two_factor_enabled` = 0, `two_factor_secret` = NULL WHERE `id` = ?;',
    [userId]
  );

  res.json({ success: true, message: 'Two-factor authentication disabled.' });
});


/**
 * GET /api/auth/invite/:token
 * Validates an invitation token and returns preview information (user + org)
 */
authRouter.get('/invite/:token', async (req: Request, res: Response) => {
  const token = String(req.params.token || '').trim();
  if (!token) {
    res.status(400).json({ valid: false, error: 'Invitation token is required.' });
    return;
  }

  const users = await query<any>(
    'SELECT `id`, `org_id`, `email`, `full_name`, `role`, `department_name`, `branch_name`, `status`, `invited_at` FROM `users` WHERE `invite_token` = ? LIMIT 1;',
    [token]
  );

  if (users.length === 0) {
    res.status(404).json({ valid: false, error: 'Invitation token not found. Please verify the link or request a new invite from your administrator.' });
    return;
  }

  const user = users[0]!;
  if (user.status !== 'INVITED') {
    res.status(409).json({ valid: false, error: 'This invitation token has already been activated. Please sign in with your password.' });
    return;
  }

  if (user.invited_at) {
    const inviteTime = new Date(user.invited_at).getTime();
    if (!isNaN(inviteTime) && Date.now() - inviteTime > 48 * 3600 * 1000) {
      res.status(410).json({ valid: false, error: 'Invitation token has expired (48 hour validity limit). Please request a new invite from your administrator.' });
      return;
    }
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
 * Activate Invited Account with Single-Use Token
 */
authRouter.post('/activate', async (req: Request, res: Response) => {
  const inviteToken = req.body.inviteToken || req.body.invite_token;
  const newPassword = req.body.newPassword || req.body.password;
  const twoFactorEnabled = Boolean(req.body.twoFactorEnabled || req.body.two_factor_enabled);

  if (!inviteToken || !newPassword) {
    res.status(400).json({ error: 'Invite token and new password are required.' });
    return;
  }

  if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    res.status(400).json({ error: 'Password must be at least 8 characters long and contain letters and numbers.' });
    return;
  }

  // Parameterized token lookup
  const cleanToken = String(inviteToken).trim();
  const users = await query<any>(
    'SELECT * FROM `users` WHERE `invite_token` = ? AND `status` = "INVITED" LIMIT 1;',
    [cleanToken]
  );

  if (users.length === 0) {
    res.status(404).json({ error: 'Invalid or already activated invitation token.' });
    return;
  }

  const user = users[0]!;

  // Check token age (48h limit)
  if (user.invited_at) {
    const inviteTime = new Date(user.invited_at).getTime();
    if (!isNaN(inviteTime) && Date.now() - inviteTime > 48 * 3600 * 1000) {
      res.status(410).json({ error: 'Invitation token has expired. Please request a new invite.' });
      return;
    }
  }

  const hashedPassword = await hashPassword(newPassword);

  // Consume token and activate account
  await query(
    'UPDATE `users` SET `password_hash` = ?, `status` = "ACTIVE", `two_factor_enabled` = ?, `invite_token` = NULL WHERE `id` = ?;',
    [hashedPassword, twoFactorEnabled ? 1 : 0, user.id]
  );

  // Issue session token so user is automatically authenticated upon activation!
  const tokenPayload = {
    userId: user.id,
    orgId: user.org_id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    branchId: user.branch_id || 'br-main',
    branchName: user.branch_name || 'Main Campus'
  };

  const sessionToken = createSessionToken(tokenPayload);

  res.cookie('session_token', sessionToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    maxAge: 2 * 60 * 60 * 1000 // 2 hours
  });

  // Fetch organization
  const orgs = await query<any>(
    'SELECT `id`, `name`, `type`, `branding_color` FROM `organizations` WHERE `id` = ? LIMIT 1;',
    [user.org_id]
  );
  const organization = orgs.length > 0 ? orgs[0] : {
    id: user.org_id,
    name: 'Enterprise Organization',
    brandingColor: '#0ea5e9'
  };

  const clientUser = {
    id: user.id,
    orgId: user.org_id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    departmentId: user.department_id,
    departmentName: user.department_name,
    branchId: user.branch_id,
    branchName: user.branch_name,
    twoFactorEnabled,
    avatar: user.avatar || '',
    status: 'ACTIVE'
  };

  res.json({
    success: true,
    message: 'Account successfully activated.',
    user: clientUser,
    organization: {
      id: organization.id,
      name: organization.name,
      brandingColor: organization.branding_color || organization.brandingColor || '#0ea5e9'
    }
  });
});

/**
 * Forgot Password Flow: Issue secure reset token
 */
authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const users = await query<any>('SELECT `id` FROM `users` WHERE LOWER(`email`) = ? LIMIT 1;', [cleanEmail]);

  if (users.length > 0) {
    const token = generateSecureToken('rst');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await query(
      'UPDATE `users` SET `reset_token` = ?, `reset_expires_at` = ? WHERE `id` = ?;',
      [token, expiresAt, users[0]!.id]
    );

    res.json({
      success: true,
      message: 'If the email matches an active account, password reset instructions have been recorded.',
      ...(config.isTest ? { resetToken: token } : {})
    });
    return;
  }

  // Consistent response to prevent user enumeration
  res.json({
    success: true,
    message: 'If the email matches an active account, password reset instructions have been recorded.'
  });
});

/**
 * Reset Password with Token
 */
authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const { resetToken, newPassword } = req.body;

  if (!resetToken || !newPassword) {
    res.status(400).json({ error: 'Reset token and new password are required.' });
    return;
  }

  if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    res.status(400).json({ error: 'Password must be at least 8 characters long and contain letters and numbers.' });
    return;
  }

  const users = await query<any>(
    'SELECT `id`, `reset_expires_at` FROM `users` WHERE `reset_token` = ? LIMIT 1;',
    [String(resetToken).trim()]
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

  const hashedPassword = await hashPassword(newPassword);
  await query(
    'UPDATE `users` SET `password_hash` = ?, `reset_token` = NULL, `reset_expires_at` = NULL WHERE `id` = ?;',
    [hashedPassword, user.id]
  );

  res.json({ success: true, message: 'Password has been successfully updated.' });
});
