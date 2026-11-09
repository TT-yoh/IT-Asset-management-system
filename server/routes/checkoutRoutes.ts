import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission, idempotent } from '../middleware';
import { canApproveWriteOff, canCertifyDamagedReturn } from '../permissions';
import { recordAuditEvent } from '../audit';
import { normalizeCondition } from './assetRoutes';

export const checkoutRouter = Router();
checkoutRouter.use(authenticate);

const EXPLICIT_CHECKOUT_COLUMNS = `
  c.\`id\`, c.\`org_id\`, c.\`branch_id\`, c.\`asset_id\`, c.\`asset_code\`, c.\`asset_name\`,
  c.\`checked_out_by\`, c.\`checked_out_to_user_id\`, c.\`checked_out_to_user_name\`,
  c.\`checked_out_at\`, c.\`expected_return_date\`, c.\`checked_in_at\`, c.\`return_condition\`,
  c.\`damage_reported\`, c.\`damage_description\`, c.\`reason\`, c.\`status\`, c.\`notes\`,
  c.\`version\`, c.\`created_at\`, c.\`updated_at\`
`;

/**
 * GET /api/checkouts
 * Explicitly projected and tenant-scoped equipment checkouts
 */
checkoutRouter.get('/', requirePermission('checkouts:read'), async (req: Request, res: Response) => {
  const { orgId, role, userId, branchId } = req.auth!;

  let sql = `
    SELECT ${EXPLICIT_CHECKOUT_COLUMNS} FROM \`checkouts\` c
    INNER JOIN \`assets\` a ON c.asset_id = a.id
    WHERE a.org_id = ?
  `;
  const params: any[] = [orgId];

  if (role === 'BRANCH_MANAGER') {
    if (!branchId) {
      res.json({ checkouts: [] });
      return;
    }
    sql += ' AND c.branch_id = ?';
    params.push(branchId);
  } else if (role === 'USER') {
    sql += ' AND c.checked_out_to_user_id = ?';
    params.push(userId);
  }

  sql += ' ORDER BY c.checked_out_at DESC LIMIT 500;';

  const rows = await query(sql, params);
  res.json({ checkouts: rows });
});

/**
 * POST /api/checkouts
 * Records CHECKOUT_ASSET in the same DB transaction!
 * Validates target user in tenant, asset active status, and concurrency lock.
 */
checkoutRouter.post('/', requirePermission('checkouts:create'), idempotent(), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (!data.assetId) {
    res.status(400).json({ error: 'Asset ID is required.' });
    return;
  }

  // Verify asset belongs to this org
  const assets = await query<any>('SELECT * FROM `assets` WHERE `id` = ? AND `org_id` = ?;', [data.assetId, orgId]);
  if (assets.length === 0) {
    res.status(404).json({ error: 'Asset not found in organization.' });
    return;
  }

  const asset = assets[0]!;
  if (asset.status !== 'ACTIVE') {
    res.status(409).json({
      error: `Asset is currently "${asset.status}" and cannot be checked out.`,
      code: 'ASSET_NOT_ACTIVE'
    });
    return;
  }

  // Pre-flight check: Verify asset does not already have an active checkout
  const activeCheckouts = await query<any>(
    "SELECT id, checked_out_to_user_name FROM `checkouts` WHERE `asset_id` = ? AND `status` = 'ACTIVE' LIMIT 1;",
    [asset.id]
  );
  if (activeCheckouts.length > 0) {
    res.status(409).json({
      error: `Asset "${asset.name}" is already actively checked out to ${activeCheckouts[0].checked_out_to_user_name || 'another user'}.`,
      code: 'ALREADY_CHECKED_OUT'
    });
    return;
  }

  // Target user validation:
  let toUserId = actorId;
  let toUserName = actorName;

  if (role !== 'USER' && data.checkedOutToUserId) {
    const targetUsers = await query<any>(
      "SELECT `id`, `full_name`, `status` FROM `users` WHERE `id` = ? AND `org_id` = ? LIMIT 1;",
      [String(data.checkedOutToUserId).trim(), orgId]
    );
    if (targetUsers.length === 0) {
      res.status(404).json({ error: 'Assigned recipient user not found in organization.' });
      return;
    }
    const targetUser = targetUsers[0]!;
    if (targetUser.status !== 'ACTIVE') {
      res.status(409).json({
        error: `Cannot assign equipment to user with status "${targetUser.status}".`,
        code: 'USER_NOT_ACTIVE'
      });
      return;
    }
    toUserId = targetUser.id;
    toUserName = targetUser.full_name;
  }

  const chkId = (data.id && typeof data.id === 'string' && /^[a-zA-Z0-9_-]{3,64}$/.test(data.id)) ? data.id : crypto.randomUUID();

  const insertSql = `
    INSERT INTO \`checkouts\` (
      \`id\`, \`org_id\`, \`branch_id\`, \`asset_id\`, \`asset_code\`, \`asset_name\`, \`checked_out_by\`,
      \`checked_out_to_user_id\`, \`checked_out_to_user_name\`, \`checked_out_at\`,
      \`expected_return_date\`, \`reason\`, \`status\`, \`notes\`, \`version\`
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, 'ACTIVE', ?, 1);
  `;

  try {
    await withTransaction(async (tx) => {
      // Atomic concurrency guard: verify under transaction lock to prevent race condition double-checkout
      const concurrentCheck = await tx(
        "SELECT id FROM `checkouts` WHERE `asset_id` = ? AND `status` = 'ACTIVE' LIMIT 1;",
        [asset.id]
      );
      if (concurrentCheck.length > 0) {
        const err: any = new Error('Asset is already actively checked out.');
        err.statusCode = 409;
        err.code = 'ALREADY_CHECKED_OUT';
        throw err;
      }

      await tx(insertSql, [
        chkId,
        orgId,
        asset.branch_id || null,
        asset.id,
        asset.asset_code,
        asset.name,
        actorName,
        toUserId,
        toUserName,
        data.expectedReturnDate || null,
        data.reason || 'Equipment assignment',
        data.notes || null
      ]);

      // Update asset assignment atomically ensuring asset is currently unassigned
      const assignResult = await tx(
        'UPDATE `assets` SET `assigned_to_user_id` = ?, `assigned_to_user_name` = ?, `assigned_at` = NOW() WHERE `id` = ? AND (`assigned_to_user_id` IS NULL OR `assigned_to_user_id` = "");',
        [toUserId, toUserName, asset.id]
      );

      const affected = (assignResult as any)?.affectedRows ?? (Array.isArray(assignResult) ? (assignResult as any)[0]?.affectedRows : undefined);
      if (affected !== undefined && affected === 0) {
        const err: any = new Error('Asset is already actively checked out or assigned.');
        err.statusCode = 409;
        err.code = 'ALREADY_CHECKED_OUT';
        throw err;
      }

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'CHECKOUT_ASSET',
        entityType: 'Checkout',
        entityId: chkId,
        entityName: asset.name,
        changes: {
          assetId: asset.id,
          assetCode: asset.asset_code,
          assignedToUserId: toUserId,
          assignedToUserName: toUserName,
          expectedReturnDate: data.expectedReturnDate
        },
        ipAddress
      });

      if (req.idempotency) {
        await req.idempotency.complete(tx, 201, { success: true, id: chkId });
      }
    });

    res.status(201).json({ success: true, id: chkId });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: statusCode === 409 ? err.message : 'Checkout transaction failed.' });
  }
});

/**
 * POST /api/checkouts/:id/return
 * Records RETURN_ASSET in the same DB transaction!
 * Enforces Separation of Duties: custody holder cannot self-certify damage.
 * On damage: sets DAMAGED_DURING_CHECKOUT, asset to REPAIR, and auto-generates maintenance work order.
 */
checkoutRouter.post('/:id/return', requirePermission('checkouts:return'), idempotent(), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role, branchId: actorBranchId } = req.auth!;
  const chkId = req.params.id;
  const { returnCondition, damageReported, damageDescription, notes } = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const checkouts = await query<any>(`
    SELECT c.* FROM \`checkouts\` c
    INNER JOIN \`assets\` a ON c.asset_id = a.id
    WHERE c.id = ? AND (c.org_id = ? OR a.org_id = ?) AND c.status = 'ACTIVE';
  `, [chkId, orgId, orgId]);

  if (checkouts.length === 0) {
    res.status(404).json({ error: 'Active checkout record not found in organization.' });
    return;
  }

  const chk = checkouts[0]!;
  const normalizedCondition = normalizeCondition(returnCondition);
  const isDamaged = Boolean(damageReported) || normalizedCondition === 'POOR';

  // Separation of duties rule:
  // If damage is reported or condition degraded, or caller is the custody holder,
  // enforce canCertifyDamagedReturn (custody holder cannot self-certify damage)
  if (isDamaged) {
    if (!canCertifyDamagedReturn(actorId, chk.checked_out_to_user_id, role, actorBranchId, chk.branch_id)) {
      res.status(403).json({
        error: 'Separation of Duties violation: The custody holder cannot self-certify a damaged return or write-off.',
        code: 'SOD_VIOLATION'
      });
      return;
    }
  }

  const finalCheckoutStatus = isDamaged ? 'DAMAGED_DURING_CHECKOUT' : 'RETURNED';
  const finalAssetStatus = isDamaged ? 'REPAIR' : 'ACTIVE';

  try {
    await withTransaction(async (tx) => {
      await tx(`
        UPDATE \`checkouts\` SET
          \`checked_in_at\` = NOW(),
          \`return_condition\` = ?,
          \`damage_reported\` = ?,
          \`damage_description\` = ?,
          \`status\` = ?,
          \`notes\` = ?,
          \`version\` = \`version\` + 1
        WHERE \`id\` = ? AND \`status\` = 'ACTIVE';
      `, [
        normalizedCondition,
        isDamaged ? 1 : 0,
        damageDescription || (isDamaged ? 'Hardware reported in damaged condition on check-in' : null),
        finalCheckoutStatus,
        notes || null,
        chkId
      ]);

      // Clear custody on asset only if it is still assigned to this checkout user
      await tx(
        'UPDATE `assets` SET `assigned_to_user_id` = NULL, `assigned_to_user_name` = NULL, `assigned_at` = NULL, `status` = ?, `asset_condition` = ?, `version` = `version` + 1 WHERE `id` = ? AND `assigned_to_user_id` = ?;',
        [finalAssetStatus, normalizedCondition, chk.asset_id, chk.checked_out_to_user_id]
      );

      // If damaged, automatically create an intake maintenance ticket in the same transaction
      if (isDamaged) {
        const maintId = crypto.randomUUID();
        await tx(`
          INSERT INTO \`maintenances\` (
            \`id\`, \`org_id\`, \`branch_id\`, \`reported_by_user_id\`, \`asset_id\`, \`asset_code\`, \`asset_name\`,
            \`type\`, \`status\`, \`priority\`, \`description\`, \`reported_by\`, \`assigned_technician\`,
            \`start_date\`, \`expected_completion\`, \`cost\`, \`version\`
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'REPAIR', 'PENDING', 'HIGH', ?, ?, 'Unassigned', CURRENT_DATE(), DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY), 0.00, 1);
        `, [
          maintId,
          orgId,
          chk.asset_branch_id || null,
          actorId,
          chk.asset_id,
          chk.asset_code,
          chk.asset_name,
          damageDescription || 'Equipment returned in damaged condition; intake triage required.',
          actorName
        ]);
      }

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'RETURN_ASSET',
        entityType: 'Checkout',
        entityId: chkId,
        entityName: chk.asset_name,
        changes: {
          assetId: chk.asset_id,
          returnCondition: normalizedCondition,
          damageReported: isDamaged,
          damageDescription,
          checkoutStatus: finalCheckoutStatus,
          assetStatus: finalAssetStatus
        },
        ipAddress
      });

      if (req.idempotency) {
        await req.idempotency.complete(tx, 200, { success: true, message: 'Asset checked in successfully.' });
      }
    });

    res.json({ success: true, message: 'Asset checked in successfully.' });
  } catch (_err) {
    res.status(500).json({ error: 'Return transaction failed.' });
  }
});

/**
 * POST /api/checkouts/:id/writeoff
 * Certifies damage write-off or loss waiver with Separation of Duties guard.
 */
checkoutRouter.post('/:id/writeoff', requirePermission('checkouts:writeoff'), idempotent(), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const chkId = req.params.id;
  const { reason, notes, isLost } = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const checkouts = await query<any>(
    'SELECT * FROM `checkouts` WHERE `id` = ? AND `org_id` = ?;',
    [chkId, orgId]
  );

  if (checkouts.length === 0) {
    res.status(404).json({ error: 'Checkout record not found in organization.' });
    return;
  }

  const chk = checkouts[0]!;

  if (!canApproveWriteOff(actorId, chk.checked_out_to_user_id, role)) {
    res.status(403).json({
      error: 'Separation of Duties violation: The custody holder or creator cannot certify a damage write-off or loss waiver.',
      code: 'SOD_VIOLATION'
    });
    return;
  }

  const isLossWaiver = Boolean(isLost) || String(reason || '').toLowerCase().includes('lost');
  const finalCheckoutStatus = isLossWaiver ? 'LOST' : 'RETURNED';

  try {
    await withTransaction(async (tx) => {
      await tx(`
        UPDATE \`checkouts\` SET
          \`checked_in_at\` = NOW(),
          \`return_condition\` = 'POOR',
          \`damage_reported\` = 1,
          \`damage_description\` = ?,
          \`status\` = ?,
          \`notes\` = ?,
          \`version\` = \`version\` + 1
        WHERE \`id\` = ?;
      `, [reason || 'Written off due to loss or damage', finalCheckoutStatus, notes || null, chkId]);

      await tx(
        'UPDATE `assets` SET `status` = \'DISPOSED\', `assigned_to_user_id` = NULL, `assigned_to_user_name` = NULL, `assigned_at` = NULL, `asset_condition` = \'POOR\', `version` = `version` + 1 WHERE `id` = ?;',
        [chk.asset_id]
      );

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'WRITE_OFF_ASSET',
        entityType: 'Checkout',
        entityId: chkId,
        entityName: chk.asset_name,
        changes: {
          assetId: chk.asset_id,
          reason: reason || 'Loss/Damage write-off',
          status: 'DISPOSED',
          checkoutStatus: finalCheckoutStatus
        },
        ipAddress
      });

      if (req.idempotency) {
        await req.idempotency.complete(tx, 200, { success: true, message: 'Asset write-off approved and certified successfully.' });
      }
    });

    res.json({ success: true, message: 'Asset write-off approved and certified successfully.' });
  } catch (_err) {
    res.status(500).json({ error: 'Write-off transaction failed.' });
  }
});
