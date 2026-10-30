import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission } from '../middleware';
import { generateSecureToken } from '../auth';
import { recordAuditEvent } from '../audit';

export const userRouter = Router();
userRouter.use(authenticate);

/**
 * GET /api/users
 * Returns sanitized users ONLY for the authenticated org. Never leaks other tenants or password fields!
 */
userRouter.get('/', requirePermission('users:read'), async (req: Request, res: Response) => {
  const { orgId, role, branchId, userId } = req.auth!;

  let sql = `
    SELECT \`id\`, \`org_id\`, \`email\`, \`full_name\`, \`role\`, \`department_id\`,
           \`department_name\`, \`branch_id\`, \`branch_name\`, \`two_factor_enabled\`,
           \`avatar\`, \`status\`, \`invite_token\`, \`invited_at\`, \`created_at\`
    FROM \`users\`
    WHERE \`org_id\` = ?
  `;
  const params: any[] = [orgId];

  // Enforce branch boundary for BRANCH_MANAGER and USER
  if ((role === 'BRANCH_MANAGER' || role === 'USER') && branchId) {
    sql += ' AND (`branch_id` = ? OR `id` = ?)';
    params.push(branchId, userId);
  }

  sql += ' ORDER BY `full_name` ASC;';

  const rows = await query<any>(sql, params);

  const isAdminOrDirector = req.auth?.role === 'ADMIN' || req.auth?.role === 'DIRECTOR';
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
    inviteToken: isAdminOrDirector ? u.invite_token || undefined : undefined,
    invitedAt: u.invited_at || undefined
  }));

  res.json({ users: sanitized });
});

/**
 * POST /api/users/invite
 * Administrator invites a new corporate user, recorded in audit transaction!
 */
userRouter.post('/invite', requirePermission('users:invite'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role: actorRole } = req.auth!;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (!data.email || !data.fullName) {
    res.status(400).json({ error: 'Email and full name are required.' });
    return;
  }

  const cleanEmail = String(data.email).trim().toLowerCase();

  // Check duplicate email
  const existing = await query<any>('SELECT `id`, `status` FROM `users` WHERE LOWER(`email`) = ? LIMIT 1;', [cleanEmail]);
  if (existing.length > 0) {
    const existingUser = existing[0];
    if (existingUser.status === 'INVITED') {
      // Re-issue a fresh invite token for this pending user!
      const freshToken = generateSecureToken('inv');
      const freshInvitedAt = new Date().toISOString();
      await query(
        'UPDATE `users` SET `invite_token` = ?, `invited_at` = ?, `full_name` = ?, `role` = ?, `department_id` = ?, `department_name` = ?, `branch_id` = ?, `branch_name` = ? WHERE `id` = ?;',
        [
          freshToken,
          freshInvitedAt,
          data.fullName.trim(),
          data.role || 'USER',
          data.departmentId || 'dept-gen',
          data.departmentName || 'General Operations',
          data.branchId || 'br-main',
          data.branchName || 'Main Campus',
          existingUser.id
        ]
      );
      res.status(200).json({
        success: true,
        userId: existingUser.id,
        inviteToken: freshToken,
        invitedAt: freshInvitedAt,
        message: 'A fresh onboarding token has been issued for this pending invitation.'
      });
      return;
    }

    res.status(409).json({ error: 'An active account with this email address already exists.' });
    return;
  }

  const userId = data.id || `usr-${Date.now()}`;
  const inviteToken = generateSecureToken('inv');
  const invitedAt = new Date().toISOString();

  try {
    await withTransaction(async (tx) => {
      await tx(`
        INSERT INTO \`users\` (
          \`id\`, \`org_id\`, \`email\`, \`full_name\`, \`role\`, \`department_id\`,
          \`department_name\`, \`branch_id\`, \`branch_name\`, \`status\`, \`invite_token\`, \`invited_at\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'INVITED', ?, ?);
      `, [
        userId,
        orgId, // Derived strictly from session!
        cleanEmail,
        data.fullName.trim(),
        data.role || 'USER',
        data.departmentId || 'dept-gen',
        data.departmentName || 'General Operations',
        data.branchId || 'br-main',
        data.branchName || 'Main Campus',
        inviteToken,
        invitedAt
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
          assignedRole: data.role || 'USER',
          branchId: data.branchId
        },
        ipAddress
      });
    });

    res.status(201).json({
      success: true,
      userId,
      inviteToken,
      invitedAt,
      message: 'User successfully invited with onboarding token.'
    });
  } catch (err: any) {
    res.status(500).json({ error: `User invitation transaction failed: ${err.message}` });
  }
});

/**
 * POST /api/users/:id/reinvite
 * Re-issue a fresh invitation token for an invited user
 */
userRouter.post('/:id/reinvite', requirePermission('users:invite'), async (req: Request, res: Response) => {
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
  const newInviteToken = generateSecureToken('inv');
  const invitedAt = new Date().toISOString();

  await query(
    'UPDATE `users` SET `invite_token` = ?, `invited_at` = ?, `status` = "INVITED" WHERE `id` = ?;',
    [newInviteToken, invitedAt, targetId]
  );

  await recordAuditEvent(query, {
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

  res.json({
    success: true,
    inviteToken: newInviteToken,
    invitedAt,
    message: `New invitation token issued for ${user.full_name}.`
  });
});

/**
 * PUT /api/users/:id
 * Update user details with strict role escalation guard, recorded in audit transaction!
 */
userRouter.put('/:id', requirePermission('users:update'), async (req: Request, res: Response) => {
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

  const rawExpected = data.baseVersion ?? data.version ?? (req.headers['if-match'] ? parseInt(String(req.headers['if-match']).replace(/["w/]/gi, ''), 10) : undefined);
  if (rawExpected !== undefined) {
    const expectedVersion = Number(rawExpected);
    if (!isNaN(expectedVersion) && expectedVersion !== currentVersion) {
      res.status(409).json({
        error: `Conflict: User record version mismatch. Server is at version ${currentVersion}, but update was based on version ${expectedVersion}.`,
        currentVersion,
        expectedVersion
      });
      return;
    }
  }

  // Role Escalation Defense:
  // Non-admins cannot alter roles. Users cannot escalate their own role.
  let targetRole = existing.role;
  if (actorRole === 'ADMIN' && data.role) {
    targetRole = data.role;
  }

  // Status changes (e.g. SUSPENDED/ACTIVE) can only be executed by ADMIN
  const targetStatus = actorRole === 'ADMIN' && data.status ? data.status : existing.status;

  try {
    await withTransaction(async (tx) => {
      await tx(`
        UPDATE \`users\` SET
          \`full_name\` = ?, \`role\` = ?, \`status\` = ?, \`department_id\` = ?, \`department_name\` = ?,
          \`branch_id\` = ?, \`branch_name\` = ?, \`version\` = \`version\` + 1
        WHERE \`id\` = ? AND \`org_id\` = ?;
      `, [
        data.fullName || existing.full_name,
        targetRole,
        targetStatus,
        data.departmentId || existing.department_id,
        data.departmentName || existing.department_name,
        data.branchId || existing.branch_id,
        data.branchName || existing.branch_name,
        targetUserId,
        orgId
      ]);

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
          departmentId: data.departmentId
        },
        ipAddress
      });
    });

    res.json({ success: true, message: 'User updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: `User update transaction failed: ${err.message}` });
  }
});

/**
 * DELETE /api/users/:id
 * Allows ADMIN to suspend or remove user provided they have no active asset checkouts.
 */
userRouter.delete('/:id', requirePermission('users:delete'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role: actorRole } = req.auth!;
  const targetUserId = req.params.id;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (targetUserId === actorId) {
    res.status(400).json({ error: 'You cannot delete or suspend your own active administrator account.' });
    return;
  }

  const users = await query<any>('SELECT * FROM \`users\` WHERE \`id\` = ? AND \`org_id\` = ? LIMIT 1;', [targetUserId, orgId]);
  if (users.length === 0) {
    res.status(404).json({ error: 'User not found in organization.' });
    return;
  }

  const existing = users[0]!;

  // Automatically handle active checkouts or custody during deletion
  try {
    await withTransaction(async (tx) => {
      // 1. Gracefully close any active equipment checkouts held by this user
      await tx('UPDATE \`checkouts\` SET \`status\` = "RETURNED", \`notes\` = "Auto-closed on staff account deletion" WHERE \`checked_out_to_user_id\` = ? AND \`status\` = "ACTIVE";', [targetUserId]);

      // 2. Clear assigned equipment custody so assets return to available inventory
      await tx('UPDATE \`assets\` SET \`assigned_to_user_id\` = NULL, \`assigned_to_user_name\` = NULL, \`assigned_to_user_avatar\` = NULL, \`assigned_at\` = NULL WHERE \`assigned_to_user_id\` = ? AND \`org_id\` = ?;', [targetUserId, orgId]);

      // 3. Permanently remove the staff user record from database
      await tx('DELETE FROM \`users\` WHERE \`id\` = ? AND \`org_id\` = ?;', [targetUserId, orgId]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role: actorRole,
        action: 'DELETE_USER',
        entityType: 'User',
        entityId: targetUserId,
        entityName: existing.full_name,
        changes: { deletedUserId: targetUserId, email: existing.email, role: existing.role },
        ipAddress
      });
    });

    res.json({ success: true, message: 'User account permanently removed.' });
  } catch (err: any) {
    res.status(500).json({ error: `User deletion transaction failed: ${err.message}` });
  }
});
