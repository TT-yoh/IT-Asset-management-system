import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission, invalidateUserCache, asyncHandler } from '../middleware';
import { generateSecureToken, hashToken } from '../auth';
import { canAssignRole, UserRole } from '../permissions';
import { recordAuditEvent } from '../audit';
import { sendInviteEmail } from '../mailer';

export const userRouter = Router();
userRouter.use(authenticate);

/**
 * GET /api/users
 * Returns sanitized users ONLY for the authenticated org. Never leaks other tenants, passwords, or credential tokens!
 */
userRouter.get('/', requirePermission('users:read'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, role, branchId, userId } = req.auth!;

  let sql = `
    SELECT \`id\`, \`org_id\`, \`email\`, \`full_name\`, \`role\`, \`department_id\`,
           \`department_name\`, \`branch_id\`, \`branch_name\`, \`two_factor_enabled\`,
           \`avatar\`, \`status\`, \`invited_at\`, \`created_at\`, \`version\`
    FROM \`users\`
    WHERE \`org_id\` = ?
  `;
  const params: any[] = [orgId];

  // Enforce branch boundary for BRANCH_MANAGER and USER (fail closed if branchId missing)
  if (role === 'BRANCH_MANAGER' || role === 'USER') {
    if (!branchId) {
      res.json({ users: [] });
      return;
    }
    sql += ' AND (`branch_id` = ? OR `id` = ?)';
    params.push(branchId, userId);
  }

  sql += ' ORDER BY `full_name` ASC;';

  const rows = await query<any>(sql, params);

  const sanitized = rows.map(u => ({
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
    avatar: u.avatar || '',
    status: u.status || 'ACTIVE',
    invitedAt: u.invited_at || undefined,
    version: Number(u.version || 1)
  }));

  res.json({ users: sanitized });
}));

/**
 * GET /api/users/:id
 * Fetches a single user record within tenant boundary with explicit column projection
 */
userRouter.get('/:id', requirePermission('users:read'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, role, branchId, userId: callerId } = req.auth!;
  const targetId = req.params.id;

  let sql = `
    SELECT \`id\`, \`org_id\`, \`email\`, \`full_name\`, \`role\`, \`department_id\`,
           \`department_name\`, \`branch_id\`, \`branch_name\`, \`two_factor_enabled\`,
           \`avatar\`, \`status\`, \`invited_at\`, \`created_at\`, \`version\`
    FROM \`users\`
    WHERE \`id\` = ? AND \`org_id\` = ?
  `;
  const params: any[] = [targetId, orgId];

  if (role === 'BRANCH_MANAGER' || role === 'USER') {
    if (!branchId) {
      res.status(404).json({ error: 'User not found or outside authorized branch boundary.' });
      return;
    }
    sql += ' AND (`branch_id` = ? OR `id` = ?)';
    params.push(branchId, callerId);
  }

  const rows = await query<any>(sql, params);
  if (rows.length === 0) {
    res.status(404).json({ error: 'User not found or outside authorized branch boundary.' });
    return;
  }

  const u = rows[0]!;
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
      avatar: u.avatar || '',
      status: u.status || 'ACTIVE',
      invitedAt: u.invited_at || undefined,
      version: Number(u.version || 1)
    }
  });
}));

/**
 * POST /api/users/invite
 * Administrator invites a new corporate user, recorded in audit transaction!
 * Generates server-side UUID, strictly prevents cross-tenant overwrites, and delivers token via email only.
 */
userRouter.post('/invite', requirePermission('users:invite'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role: actorRole } = req.auth!;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (!data.email || !data.fullName) {
    res.status(400).json({ error: 'Email and full name are required.' });
    return;
  }

  const targetRole: UserRole = (data.role as UserRole) || 'USER';
  if (!canAssignRole(actorRole, targetRole)) {
    res.status(403).json({ error: 'Cannot assign a role higher than your own or grant administrator privileges.' });
    return;
  }

  if (!data.branchId || typeof data.branchId !== 'string' || !data.branchId.trim()) {
    res.status(400).json({ error: 'A valid branch ID is required.' });
    return;
  }

  // Validate branch belongs to caller's org
  const branchCheck = await query<any>(
    'SELECT `id`, `name` FROM `branches` WHERE `id` = ? AND `org_id` = ? LIMIT 1;',
    [data.branchId.trim(), orgId]
  );
  if (branchCheck.length === 0) {
    res.status(400).json({ error: 'Specified branch does not exist in your organization.' });
    return;
  }
  const branchId = branchCheck[0].id;
  const branchName = branchCheck[0].name;

  // Validate department if supplied
  let departmentId: string | null = null;
  let departmentName: string | null = null;
  if (data.departmentId && typeof data.departmentId === 'string' && data.departmentId.trim()) {
    const deptCheck = await query<any>(
      'SELECT `id`, `name` FROM `departments` WHERE `id` = ? AND `org_id` = ? LIMIT 1;',
      [data.departmentId.trim(), orgId]
    );
    if (deptCheck.length === 0) {
      res.status(400).json({ error: 'Specified department does not exist in your organization.' });
      return;
    }
    departmentId = deptCheck[0].id;
    departmentName = deptCheck[0].name;
  } else if (data.departmentName) {
    departmentName = String(data.departmentName).trim();
  }

  const cleanEmail = String(data.email).trim().toLowerCase();

  // Global email uniqueness check (protect against cross-tenant collisions and account takeover)
  const existing = await query<any>(
    'SELECT `id`, `org_id`, `status` FROM `users` WHERE LOWER(`email`) = ? LIMIT 1;',
    [cleanEmail]
  );

  if (existing.length > 0) {
    const existingUser = existing[0];

    // If belongs to another org, fail closed with generic 409 without disclosing other tenant details
    if (existingUser.org_id !== orgId) {
      res.status(409).json({
        error: 'An active account with this email address already exists.',
        code: 'EMAIL_ALREADY_EXISTS'
      });
      return;
    }

    // If in the same org and still pending invitation, re-issue fresh token
    if (existingUser.status === 'INVITED') {
      const freshToken = generateSecureToken('inv');
      const freshTokenHash = hashToken(freshToken);
      const freshInvitedAt = new Date().toISOString();
      const freshExpiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');

      await query(
        'UPDATE `users` SET `invite_token_hash` = ?, `invited_at` = ?, `invite_expires_at` = ?, `full_name` = ?, `role` = ?, `department_id` = ?, `department_name` = ?, `branch_id` = ?, `branch_name` = ?, `version` = `version` + 1 WHERE `id` = ? AND `org_id` = ?;',
        [
          freshTokenHash,
          freshInvitedAt,
          freshExpiresAt,
          data.fullName.trim(),
          targetRole,
          departmentId,
          departmentName,
          branchId,
          branchName,
          existingUser.id,
          orgId
        ]
      );

      const reinviteDelivery = await sendInviteEmail(cleanEmail, freshToken);

      res.status(200).json({
        success: true,
        emailDelivered: reinviteDelivery.delivered,
        userId: existingUser.id,
        invitedAt: freshInvitedAt,
        message: 'A fresh onboarding token has been issued for this pending invitation.'
      });
      return;
    }

    // Active, suspended, or already onboarded user
    res.status(409).json({
      error: 'An active account with this email address already exists.',
      code: 'EMAIL_ALREADY_EXISTS'
    });
    return;
  }

  // Server-generated UUID ignores client-provided primary key
  const userId = crypto.randomUUID();
  const inviteToken = generateSecureToken('inv');
  const inviteTokenHash = hashToken(inviteToken);
  const invitedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');

  try {
    await withTransaction(async (tx) => {
      await tx(`
        INSERT INTO \`users\` (
          \`id\`, \`org_id\`, \`email\`, \`full_name\`, \`role\`, \`department_id\`,
          \`department_name\`, \`branch_id\`, \`branch_name\`, \`status\`, \`invite_token_hash\`, \`invited_at\`, \`invite_expires_at\`, \`version\`, \`token_version\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'INVITED', ?, ?, ?, 1, 1);
      `, [
        userId,
        orgId, // Derived strictly from session!
        cleanEmail,
        data.fullName.trim(),
        targetRole,
        departmentId,
        departmentName,
        branchId,
        branchName,
        inviteTokenHash,
        invitedAt,
        expiresAt
      ]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role: actorRole,
        action: 'INVITE_USER',
        entityType: 'User',
        entityId: userId,
        entityName: data.fullName.trim(),
        changes: {
          email: cleanEmail,
          assignedRole: targetRole,
          branchId
        },
        ipAddress
      });
    });

    const inviteDelivery = await sendInviteEmail(cleanEmail, inviteToken);

    res.status(201).json({
      success: true,
      emailDelivered: inviteDelivery.delivered,
      userId,
      invitedAt,
      message: 'User successfully invited with onboarding token.'
    });
  } catch (_err) {
    res.status(500).json({ error: 'User invitation transaction failed.' });
  }
}));

/**
 * POST /api/users/:id/reinvite
 * Re-issue a fresh invitation token for an invited user.
 * Tokens delivered strictly out-of-band via mailer.
 */
userRouter.post('/:id/reinvite', requirePermission('users:invite'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role: actorRole } = req.auth!;
  const targetId = req.params.id;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const users = await query<any>(
    'SELECT * FROM `users` WHERE `id` = ? AND `org_id` = ? LIMIT 1;',
    [targetId, orgId]
  );
  if (users.length === 0) {
    res.status(404).json({ error: 'User not found in your organization.' });
    return;
  }

  const user = users[0];
  if (user.status !== 'INVITED') {
    res.status(409).json({
      error: 'Cannot re-invite an account that has already been activated.',
      code: 'INVITATION_ALREADY_ACTIVATED'
    });
    return;
  }

  const newInviteToken = generateSecureToken('inv');
  const tokenHash = hashToken(newInviteToken);
  const invitedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');

  await withTransaction(async (tx) => {
    await tx(
      "UPDATE `users` SET `invite_token_hash` = ?, `invited_at` = ?, `invite_expires_at` = ?, `status` = 'INVITED', `version` = `version` + 1 WHERE `id` = ? AND `org_id` = ?;",
      [tokenHash, invitedAt, expiresAt, targetId, orgId]
    );

    await recordAuditEvent(tx, {
      orgId,
      actorId,
      userName: actorName,
      role: actorRole,
      action: 'INVITE_USER',
      entityType: 'User',
      entityId: targetId,
      entityName: user.full_name,
      changes: { email: user.email, action: 'RE_INVITE' },
      ipAddress
    });
  });

  const resendDelivery = await sendInviteEmail(user.email, newInviteToken);

  res.json({
    success: true,
    emailDelivered: resendDelivery.delivered,
    userId: targetId,
    invitedAt,
    message: `New invitation token issued for ${user.full_name}.`
  });
}));

/**
 * PUT /api/users/:id
 * Update user details with strict role escalation guard, optimistic concurrency control, and session invalidation!
 */
userRouter.put('/:id', requirePermission('users:update'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, role: actorRole, userId: actorId, fullName: actorName } = req.auth!;
  const targetUserId = req.params.id;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const users = await query<any>('SELECT * FROM `users` WHERE `id` = ? AND `org_id` = ?;', [targetUserId, orgId]);
  if (users.length === 0) {
    res.status(404).json({ error: 'User not found in organization.' });
    return;
  }

  const existing = users[0]!;
  const currentVersion = Number(existing.version || 1);

  // Optimistic Concurrency Control: require baseVersion
  const rawExpected = data.baseVersion ?? data.version ?? (req.headers['if-match'] ? parseInt(String(req.headers['if-match']).replace(/["w/]/gi, ''), 10) : undefined);
  if (rawExpected === undefined) {
    res.status(428).json({
      error: 'baseVersion is required for optimistic concurrency control',
      code: 'PRECONDITION_REQUIRED'
    });
    return;
  }

  const expectedVersion = Number(rawExpected);
  if (isNaN(expectedVersion) || expectedVersion !== currentVersion) {
    res.status(409).json({
      error: `Conflict: User record version mismatch. Server is at version ${currentVersion}, but update was based on version ${expectedVersion}.`,
      code: 'VERSION_CONFLICT',
      currentVersion,
      expectedVersion
    });
    return;
  }

  // Role validation:
  let targetRole = existing.role;
  if (data.role && data.role !== existing.role) {
    if (!canAssignRole(actorRole, data.role as UserRole)) {
      res.status(403).json({ error: 'Cannot assign a role higher than your own or grant administrator privileges.' });
      return;
    }

    // Protect last active administrator in organization
    if (existing.role === 'ADMIN' && data.role !== 'ADMIN') {
      const adminCount = await query<any>(
        "SELECT COUNT(*) as cnt FROM `users` WHERE `org_id` = ? AND `role` = 'ADMIN' AND `status` = 'ACTIVE' AND `id` != ?;",
        [orgId, targetUserId]
      );
      if ((adminCount[0]?.cnt || 0) === 0) {
        res.status(409).json({
          error: 'Cannot demote the last remaining administrator in the organization.',
          code: 'LAST_ADMIN_PROTECTED'
        });
        return;
      }
    }
    targetRole = data.role;
  }

  // Status transitions:
  let targetStatus = existing.status;
  if (data.status && data.status !== existing.status) {
    if (actorRole !== 'ADMIN') {
      res.status(403).json({ error: 'Only administrators can alter user status.' });
      return;
    }

    // Direct transition from INVITED to ACTIVE without password setup is forbidden
    if (existing.status === 'INVITED' && data.status === 'ACTIVE') {
      // Must be onboarded with a secure password via invite link
      res.status(400).json({ error: 'Pending invited users must activate their account through the onboarding invite link.' });
      return;
    }

    // Protect last active administrator from being deactivated or suspended
    if (existing.role === 'ADMIN' && (data.status === 'SUSPENDED' || data.status === 'DELETED')) {
      const adminCount = await query<any>(
        "SELECT COUNT(*) as cnt FROM `users` WHERE `org_id` = ? AND `role` = 'ADMIN' AND `status` = 'ACTIVE' AND `id` != ?;",
        [orgId, targetUserId]
      );
      if ((adminCount[0]?.cnt || 0) === 0) {
        res.status(409).json({
          error: 'Cannot suspend or deactivate the last remaining administrator in the organization.',
          code: 'LAST_ADMIN_PROTECTED'
        });
        return;
      }
    }

    if (!['ACTIVE', 'SUSPENDED', 'DELETED'].includes(data.status)) {
      res.status(400).json({ error: 'Invalid user status.' });
      return;
    }
    targetStatus = data.status;
  }

  // Foreign key validation: branchId
  let targetBranchId = existing.branch_id;
  let targetBranchName = existing.branch_name;
  if (data.branchId !== undefined) {
    if (!data.branchId || typeof data.branchId !== 'string' || !data.branchId.trim()) {
      res.status(400).json({ error: 'A valid branch ID is required.' });
      return;
    }
    const branchRows = await query<any>(
      'SELECT `id`, `name` FROM `branches` WHERE `id` = ? AND `org_id` = ? LIMIT 1;',
      [data.branchId.trim(), orgId]
    );
    if (branchRows.length === 0) {
      res.status(400).json({ error: 'Specified branch does not exist in your organization.' });
      return;
    }
    targetBranchId = branchRows[0].id;
    targetBranchName = branchRows[0].name;
  }

  // Foreign key validation: departmentId
  let targetDepartmentId = existing.department_id;
  let targetDepartmentName = existing.department_name;
  if (data.departmentId !== undefined) {
    if (data.departmentId === null || data.departmentId === '') {
      targetDepartmentId = null;
      targetDepartmentName = null;
    } else {
      const deptRows = await query<any>(
        'SELECT `id`, `name` FROM `departments` WHERE `id` = ? AND `org_id` = ? LIMIT 1;',
        [String(data.departmentId).trim(), orgId]
      );
      if (deptRows.length === 0) {
        res.status(400).json({ error: 'Specified department does not exist in your organization.' });
        return;
      }
      targetDepartmentId = deptRows[0].id;
      targetDepartmentName = deptRows[0].name;
    }
  }

  const shouldBumpToken = targetRole !== existing.role || targetBranchId !== existing.branch_id || targetStatus !== existing.status;

  try {
    await withTransaction(async (tx) => {
      const updateRes = await tx(`
        UPDATE \`users\` SET
          \`full_name\` = ?, \`role\` = ?, \`status\` = ?, \`department_id\` = ?, \`department_name\` = ?,
          \`branch_id\` = ?, \`branch_name\` = ?, \`avatar\` = ?, \`version\` = \`version\` + 1,
          \`token_version\` = \`token_version\` + ${shouldBumpToken ? 1 : 0}
        WHERE \`id\` = ? AND \`org_id\` = ? AND \`version\` = ?;
      `, [
        data.fullName || existing.full_name,
        targetRole,
        targetStatus,
        targetDepartmentId,
        targetDepartmentName,
        targetBranchId,
        targetBranchName,
        data.avatar !== undefined ? data.avatar : existing.avatar,
        targetUserId,
        orgId,
        currentVersion
      ]);

      const affected = (updateRes as any)?.affectedRows ?? (Array.isArray(updateRes) ? (updateRes as any)[0]?.affectedRows : undefined);
      if (affected !== undefined && affected === 0) {
        const err: any = new Error('Conflict: User record version mismatch.');
        err.statusCode = 409;
        err.code = 'VERSION_CONFLICT';
        throw err;
      }

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role: actorRole,
        action: 'UPDATE_USER',
        entityType: 'User',
        entityId: targetUserId,
        entityName: data.fullName || existing.full_name,
        changes: {
          previousRole: existing.role,
          updatedRole: targetRole,
          previousStatus: existing.status,
          updatedStatus: targetStatus,
          departmentId: targetDepartmentId,
          version: currentVersion + 1
        },
        ipAddress
      });
    });

    invalidateUserCache(targetUserId);

    res.json({ success: true, message: 'User updated successfully.', version: currentVersion + 1 });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: statusCode === 409 ? err.message : 'User update transaction failed.' });
  }
}));

/**
 * DELETE /api/users/:id
 * Allows ADMIN to soft-delete user (status = 'DELETED').
 * Refuses deletion if user holds active asset custody.
 * Bumps token_version to immediately revoke existing sessions.
 */
userRouter.delete('/:id', requirePermission('users:delete'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role: actorRole } = req.auth!;
  const targetUserId = req.params.id;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (targetUserId === actorId) {
    res.status(400).json({ error: 'You cannot delete or deactivate your own active administrator account.' });
    return;
  }

  const users = await query<any>('SELECT * FROM `users` WHERE `id` = ? AND `org_id` = ? LIMIT 1;', [targetUserId, orgId]);
  if (users.length === 0) {
    res.status(404).json({ error: 'User not found in organization.' });
    return;
  }

  const existing = users[0]!;

  // Protect last active administrator in organization
  if (existing.role === 'ADMIN') {
    const adminCount = await query<any>(
      "SELECT COUNT(*) as cnt FROM `users` WHERE `org_id` = ? AND `role` = 'ADMIN' AND `status` = 'ACTIVE' AND `id` != ?;",
      [orgId, targetUserId]
    );
    if ((adminCount[0]?.cnt || 0) === 0) {
      res.status(409).json({
        error: 'Cannot delete the last remaining administrator in the organization.',
        code: 'LAST_ADMIN_PROTECTED'
      });
      return;
    }
  }

  // Separation of duties / custody safety: refuse deletion if user holds active equipment custody
  const activeCheckouts = await query<any>(
    "SELECT COUNT(*) as cnt FROM `checkouts` WHERE `checked_out_to_user_id` = ? AND `status` = 'ACTIVE' AND `org_id` = ?;",
    [targetUserId, orgId]
  );
  if ((activeCheckouts[0]?.cnt || 0) > 0) {
    res.status(409).json({
      error: `Cannot delete user holding ${activeCheckouts[0].cnt} active equipment checkout(s). Check in or reassign all assets before deleting account.`,
      code: 'USER_HAS_ACTIVE_CUSTODY'
    });
    return;
  }

  try {
    await withTransaction(async (tx) => {
      // Soft delete user and revoke all active credentials & sessions
      await tx(`
        UPDATE \`users\` SET
          \`status\` = 'DELETED',
          \`token_version\` = \`token_version\` + 1,
          \`version\` = \`version\` + 1
        WHERE \`id\` = ? AND \`org_id\` = ?;
      `, [targetUserId, orgId]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role: actorRole,
        action: 'DELETE_USER',
        entityType: 'User',
        entityId: targetUserId,
        entityName: existing.full_name,
        changes: { deletedUserId: targetUserId, email: existing.email, role: existing.role, status: 'DELETED' },
        ipAddress
      });
    });

    invalidateUserCache(targetUserId);

    res.json({ success: true, message: 'User account deactivated.' });
  } catch (_err) {
    res.status(500).json({ error: 'User deletion transaction failed.' });
  }
}));
