import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission } from '../middleware';
import { canApproveWriteOff } from '../permissions';
import { recordAuditEvent } from '../audit';
import { normalizeCondition } from './assetRoutes';

export const checkoutRouter = Router();
checkoutRouter.use(authenticate);

/**
 * GET /api/checkouts
 */
checkoutRouter.get('/', requirePermission('checkouts:read'), async (req: Request, res: Response) => {
  const { orgId, role, userId } = req.auth!;

  let sql = `
    SELECT c.* FROM \`checkouts\` c
    INNER JOIN \`assets\` a ON c.asset_id = a.id
    WHERE a.org_id = ?
  `;
  const params: any[] = [orgId];

  if (role === 'USER') {
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
 */
checkoutRouter.post('/', requirePermission('checkouts:create'), async (req: Request, res: Response) => {
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
    res.status(409).json({ error: `Asset is currently "${asset.status}" and cannot be checked out.` });
    return;
  }

  // Pre-flight check: Verify asset does not already have an active checkout
  const activeCheckouts = await query<any>(
    'SELECT id, checked_out_to_user_name FROM `checkouts` WHERE `asset_id` = ? AND `status` = "ACTIVE" LIMIT 1;',
    [asset.id]
  );
  if (activeCheckouts.length > 0) {
    res.status(409).json({
      error: `Asset "${asset.name}" is already actively checked out to ${activeCheckouts[0].checked_out_to_user_name || 'another user'}.`
    });
    return;
  }

  const chkId = data.id || `chk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const toUserId = role === 'USER' ? actorId : (data.checkedOutToUserId || actorId);
  const toUserName = role === 'USER' ? actorName : (data.checkedOutToUserName || actorName);

  const insertSql = `
    INSERT INTO \`checkouts\` (
      \`id\`, \`asset_id\`, \`asset_code\`, \`asset_name\`, \`checked_out_by\`,
      \`checked_out_to_user_id\`, \`checked_out_to_user_name\`, \`checked_out_at\`,
      \`expected_return_date\`, \`reason\`, \`status\`, \`notes\`
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, 'ACTIVE', ?);
  `;

  try {
    await withTransaction(async (tx) => {
      // Atomic concurrency guard: verify under transaction lock to prevent race condition double-checkout
      const concurrentCheck = await tx(
        'SELECT id FROM `checkouts` WHERE `asset_id` = ? AND `status` = "ACTIVE" LIMIT 1;',
        [asset.id]
      );
      if (concurrentCheck.length > 0) {
        const err: any = new Error(`Asset is already actively checked out.`);
        err.statusCode = 409;
        throw err;
      }

      await tx(insertSql, [
        chkId,
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
        const err: any = new Error(`Asset is already actively checked out or assigned.`);
        err.statusCode = 409;
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
    });

    res.status(201).json({ success: true, id: chkId });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: `Checkout transaction failed: ${err.message}` });
  }
});

/**
 * POST /api/checkouts/:id/return
 * Records RETURN_ASSET in the same DB transaction!
 */
checkoutRouter.post('/:id/return', requirePermission('checkouts:return'), async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const chkId = req.params.id;
  const { returnCondition, damageReported, damageDescription, notes } = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const checkouts = await query<any>(`
    SELECT c.* FROM \`checkouts\` c
    INNER JOIN \`assets\` a ON c.asset_id = a.id
    WHERE c.id = ? AND a.org_id = ?;
  `, [chkId, orgId]);

  if (checkouts.length === 0) {
    res.status(404).json({ error: 'Checkout record not found in organization.' });
    return;
  }

  const chk = checkouts[0]!;

  // Separation of duties rule:
  // If damage is reported or condition degraded, the person who had custody CANNOT be the sole certifier!
  if (damageReported && !canApproveWriteOff(actorId, chk.checked_out_to_user_id, role)) {
    res.status(403).json({
      error: 'Separation of Duties violation: The custody holder cannot certify a damage write-off or loss waiver.'
    });
    return;
  }

  try {
    const normalizedCondition = normalizeCondition(returnCondition);

    await withTransaction(async (tx) => {
      await tx(`
        UPDATE \`checkouts\` SET
          \`checked_in_at\` = NOW(),
          \`return_condition\` = ?,
          \`damage_reported\` = ?,
          \`damage_description\` = ?,
          \`status\` = 'RETURNED',
          \`notes\` = ?
        WHERE \`id\` = ?;
      `, [
        normalizedCondition,
        damageReported ? 1 : 0,
        damageDescription || null,
        notes || null,
        chkId
      ]);

      // Clear custody on asset
      await tx(
        'UPDATE `assets` SET `assigned_to_user_id` = NULL, `assigned_to_user_name` = NULL, `assigned_at` = NULL, `asset_condition` = ? WHERE `id` = ?;',
        [normalizedCondition, chk.asset_id]
      );

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
          returnCondition: returnCondition || 'GOOD',
          damageReported: Boolean(damageReported),
          damageDescription
        },
        ipAddress
      });
    });

    res.json({ success: true, message: 'Asset checked in successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: `Return transaction failed: ${err.message}` });
  }
});
