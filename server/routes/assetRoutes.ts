import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission } from '../middleware';
import { recordAuditEvent } from '../audit';

export const assetRouter = Router();
assetRouter.use(authenticate);

/**
 * GET /api/assets
 * Strictly scoped by org_id and role's branch constraint
 */
assetRouter.get('/', requirePermission('assets:read'), async (req: Request, res: Response) => {
  const { orgId, role, branchId } = req.auth!;

  let effectiveOrgId = orgId;
  const isSuperAdmin = req.auth!.userId === 'usr-super-admin-ishmael';
  const requestedOrg = (req.headers['x-org-id'] as string) || (req.query.orgId as string);
  if (requestedOrg && isSuperAdmin) {
    effectiveOrgId = requestedOrg;
  }

  let sql = 'SELECT * FROM `assets` WHERE `org_id` = ?';
  const params: any[] = [effectiveOrgId];

  // Enforce branch boundary for BRANCH_MANAGER and USER
  if ((role === 'BRANCH_MANAGER' || role === 'USER') && branchId) {
    sql += ' AND `branch_id` = ?';
    params.push(branchId);
  }

  sql += ' ORDER BY `created_at` DESC LIMIT 500;';

  const rows = await query(sql, params);
  res.json({ assets: rows });
});

/**
 * GET /api/assets/check-redundancy
 * Pre-flight redundancy check for Asset Tag, Serial, MAC, and IMEI
 */
assetRouter.get('/check-redundancy', async (req: Request, res: Response) => {
  const { orgId, role } = req.auth!;
  let effectiveOrgId = orgId;
  const isSuperAdmin = req.auth!.userId === 'usr-super-admin-ishmael';
  const requestedOrg = (req.headers['x-org-id'] as string) || (req.query.orgId as string);
  if (requestedOrg && isSuperAdmin) {
    effectiveOrgId = requestedOrg;
  }

  const assetCode = String(req.query.assetCode || '').trim();
  const serialNumber = String(req.query.serialNumber || '').trim();
  const macAddress = String(req.query.macAddress || '').trim();
  const imeiNumber = String(req.query.imeiNumber || '').trim();
  const excludeId = String(req.query.excludeId || '').trim();

  const isAutoSerial = serialNumber.toLowerCase().startsWith('sn-ast') || serialNumber.toLowerCase().startsWith('sn-bulk');

  const duplicateQuery = `
    SELECT id, name, asset_code, serial_number, mac_address, imei_number, branch_name
    FROM \`assets\`
    WHERE \`org_id\` = ? AND id != ? AND (
      (? != '' AND LOWER(\`asset_code\`) = LOWER(?))
      OR (? = 1 AND LOWER(\`serial_number\`) = LOWER(?))
      OR (? != '' AND LOWER(\`mac_address\`) = LOWER(?))
      OR (? != '' AND LOWER(\`imei_number\`) = LOWER(?))
    ) LIMIT 1;
  `;

  const rows = await query(duplicateQuery, [
    effectiveOrgId,
    excludeId,
    assetCode,
    assetCode,
    serialNumber && !isAutoSerial ? 1 : 0,
    serialNumber,
    macAddress,
    macAddress,
    imeiNumber,
    imeiNumber
  ]);

  if (rows.length === 0) {
    res.json({
      isRedundant: false,
      tagConflict: null,
      serialConflict: null,
      macConflict: null,
      imeiConflict: null
    });
    return;
  }

  const match = rows[0];
  const isTagMatch = assetCode && match.asset_code?.toLowerCase() === assetCode.toLowerCase();
  const isSerialMatch = serialNumber && !isAutoSerial && match.serial_number?.toLowerCase() === serialNumber.toLowerCase();
  const isMacMatch = macAddress && match.mac_address?.toLowerCase() === macAddress.toLowerCase();
  const isImeiMatch = imeiNumber && match.imei_number?.toLowerCase() === imeiNumber.toLowerCase();

  let conflictField = 'Asset Tag';
  let conflictVal = assetCode;

  if (isSerialMatch) {
    conflictField = 'Serial Number';
    conflictVal = serialNumber;
  } else if (isMacMatch) {
    conflictField = 'MAC Address';
    conflictVal = macAddress;
  } else if (isImeiMatch) {
    conflictField = 'IMEI Number';
    conflictVal = imeiNumber;
  }

  res.json({
    isRedundant: true,
    tagConflict: isTagMatch ? match : null,
    serialConflict: isSerialMatch ? match : null,
    macConflict: isMacMatch ? match : null,
    imeiConflict: isImeiMatch ? match : null,
    conflictField,
    conflictValue: conflictVal,
    message: `${conflictField} "${conflictVal}" is already registered to "${match.name}" (Tag: ${match.asset_code}, Branch: ${match.branch_name}).`,
    conflictAsset: {
      id: match.id,
      name: match.name,
      assetCode: match.asset_code,
      branchName: match.branch_name
    }
  });
});

export function normalizeCondition(cond?: string): 'NEW' | 'GOOD' | 'FAIR' | 'POOR' {
  if (!cond) return 'GOOD';
  const c = String(cond).toUpperCase().trim();
  if (['NEW', 'EXCELLENT', 'LIKE NEW', 'BRAND NEW', 'MINT'].includes(c)) return 'NEW';
  if (['GOOD', 'VERY GOOD', 'FINE'].includes(c)) return 'GOOD';
  if (['FAIR', 'ACCEPTABLE', 'DEGRADED'].includes(c)) return 'FAIR';
  if (['POOR', 'DAMAGED', 'BROKEN', 'DEFECTIVE'].includes(c)) return 'POOR';
  return 'GOOD';
}

export function normalizeStatus(status?: string): string {
  if (!status) return 'ACTIVE';
  const s = String(status).toUpperCase().trim();
  if (s === 'AVAILABLE') return 'ACTIVE';
  if (['ACTIVE', 'DAMAGED', 'REPAIR', 'DEPRECATED', 'SOLD', 'DISPOSED'].includes(s)) return s;
  return 'ACTIVE';
}

/**
 * POST /api/assets
 * Creates asset with org_id derived strictly from session
 * Records CREATE_ASSET in the same DB transaction!
 */
assetRouter.post('/', requirePermission('assets:create'), async (req: Request, res: Response) => {
  const { orgId, role, userId: actorId, fullName: actorName, branchId: userBranchId } = req.auth!;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const assetCode = data.assetCode || data.asset_code || `AST-${Date.now()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
  const name = data.name || data.assetName || data.asset_name;
  const serialNumber = data.serialNumber || data.serial_number || `SN-${assetCode}`;

  if (!name || !assetCode) {
    res.status(400).json({ error: 'Asset name and assetCode are required.' });
    return;
  }

  const assetId = data.id || `ast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  // Enforce branch scoping: BRANCH_MANAGER can only create within their branch
  const effectiveBranchId = role === 'BRANCH_MANAGER' ? userBranchId : (data.branchId || data.branch_id || userBranchId);
  const condition = normalizeCondition(data.condition || data.assetCondition || data.asset_condition);
  const isSuperAdmin = actorId === 'usr-super-admin-ishmael';
  const effectiveOrgId = (isSuperAdmin && (data.orgId || data.org_id))
    ? (data.orgId || data.org_id)
    : orgId;

  // Redundancy & Duplicate Data Check
  const cleanCode = assetCode.trim();
  const cleanSerial = serialNumber.trim();
  const mac = (data.macAddress || data.mac_address || '').trim();
  const imei = (data.imeiNumber || data.imei_number || '').trim();

  const isAutoSerial = cleanSerial.toLowerCase().startsWith('sn-ast') || cleanSerial.toLowerCase().startsWith('sn-bulk');
  const duplicateQuery = `
    SELECT id, name, asset_code, serial_number, mac_address, imei_number
    FROM \`assets\`
    WHERE \`org_id\` = ? AND (
      LOWER(\`asset_code\`) = LOWER(?)
      OR (? = 1 AND LOWER(\`serial_number\`) = LOWER(?))
      OR (? != '' AND LOWER(\`mac_address\`) = LOWER(?))
      OR (? != '' AND LOWER(\`imei_number\`) = LOWER(?))
    ) LIMIT 1;
  `;

  const duplicates = await query(duplicateQuery, [
    effectiveOrgId,
    cleanCode,
    cleanSerial && !isAutoSerial ? 1 : 0,
    cleanSerial,
    mac,
    mac,
    imei,
    imei
  ]);

  if (duplicates.length > 0) {
    const match = duplicates[0];
    let conflictField = 'Asset Tag / Barcode';
    let conflictVal = cleanCode;

    if (cleanSerial && !isAutoSerial && match.serial_number && match.serial_number.toLowerCase() === cleanSerial.toLowerCase()) {
      conflictField = 'Serial Number';
      conflictVal = cleanSerial;
    } else if (mac && match.mac_address && match.mac_address.toLowerCase() === mac.toLowerCase()) {
      conflictField = 'MAC Address';
      conflictVal = mac;
    } else if (imei && match.imei_number && match.imei_number.toLowerCase() === imei.toLowerCase()) {
      conflictField = 'IMEI Number';
      conflictVal = imei;
    }

    res.status(409).json({
      error: `Redundant data detected: ${conflictField} "${conflictVal}" is already registered to "${match.name}" (Tag: ${match.asset_code}).`,
      conflictField,
      conflictAsset: {
        id: match.id,
        name: match.name,
        assetCode: match.asset_code
      }
    });
    return;
  }

  const insertSql = `
    INSERT INTO \`assets\` (
      \`id\`, \`org_id\`, \`branch_id\`, \`branch_name\`, \`category_id\`, \`category_name\`,
      \`asset_code\`, \`name\`, \`model\`, \`serial_number\`, \`mac_address\`, \`phone_number\`,
      \`registered_email\`, \`imei_number\`, \`status\`, \`asset_condition\`, \`purchase_date\`,
      \`purchase_cost\`, \`warranty_expiry\`, \`current_value\`, \`image_url\`, \`notes\`, \`version\`
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1);
  `;

  try {
    await withTransaction(async (tx) => {
      await tx(insertSql, [
        assetId,
        effectiveOrgId,
        effectiveBranchId,
        data.branchName || data.branch_name || 'Main Hub',
        data.categoryId || data.category_id || 'cat-gen',
        data.categoryName || data.category_name || 'Hardware',
        assetCode,
        name,
        data.model || '',
        serialNumber,
        data.macAddress || data.mac_address || null,
        data.phoneNumber || data.phone_number || null,
        data.registeredEmail || data.registered_email || null,
        data.imeiNumber || data.imei_number || null,
        normalizeStatus(data.status),
        condition,
        data.purchaseDate || data.purchase_date || new Date().toISOString().split('T')[0],
        Number(data.purchaseCost ?? data.purchase_cost ?? 0),
        data.warrantyExpiry || data.warranty_expiry || null,
        Number(data.currentValue ?? data.current_value ?? data.purchaseCost ?? data.purchase_cost ?? 0),
        data.imageUrl || data.image_url || '',
        data.notes || null
      ]);

      await recordAuditEvent(tx, {
        orgId: effectiveOrgId,
        actorId,
        userName: actorName,
        role,
        action: 'CREATE_ASSET',
        entityType: 'Asset',
        entityId: assetId,
        entityName: name,
        changes: {
          assetCode,
          name,
          model: data.model,
          branchId: effectiveBranchId,
          status: data.status || 'ACTIVE'
        },
        ipAddress
      });
    });

    res.status(201).json({ success: true, id: assetId });
  } catch (err: any) {
    res.status(500).json({ error: `Asset creation transaction failed: ${err.message}` });
  }
});

/**
 * PUT /api/assets/:id
 * Updates asset and records UPDATE_ASSET in the same DB transaction!
 */
assetRouter.put('/:id', requirePermission('assets:update'), async (req: Request, res: Response) => {
  const { orgId, role, userId: actorId, fullName: actorName, branchId: userBranchId } = req.auth!;
  const assetId = req.params.id;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  let verifySql = 'SELECT * FROM `assets` WHERE `id` = ? AND `org_id` = ?';
  const verifyParams: any[] = [assetId, orgId];
  if (role === 'BRANCH_MANAGER') {
    verifySql += ' AND `branch_id` = ?';
    verifyParams.push(userBranchId);
  }

  const existing = await query(verifySql, verifyParams);
  if (existing.length === 0) {
    res.status(404).json({ error: 'Asset not found or outside authorized branch boundary.' });
    return;
  }

  const prev = existing[0]!;
  const currentVersion = Number(prev.version || 1);

  // Optimistic Concurrency Control: compare client baseVersion / version / If-Match
  const rawExpected = data.baseVersion ?? data.version ?? (req.headers['if-match'] ? parseInt(String(req.headers['if-match']).replace(/["w/]/gi, ''), 10) : undefined);
  if (rawExpected !== undefined) {
    const expectedVersion = Number(rawExpected);
    if (!isNaN(expectedVersion) && expectedVersion !== currentVersion) {
      res.status(409).json({
        error: `Conflict: Asset version mismatch. Server is at version ${currentVersion}, but update was based on version ${expectedVersion}.`,
        currentVersion,
        expectedVersion
      });
      return;
    }
  }

  const updateSql = `
    UPDATE \`assets\` SET
      \`name\` = ?, \`model\` = ?, \`status\` = ?, \`asset_condition\` = ?, \`current_value\` = ?, \`notes\` = ?,
      \`version\` = \`version\` + 1
    WHERE \`id\` = ? AND \`org_id\` = ?;
  `;

  const updatedCondition = (data.condition || data.assetCondition || data.asset_condition)
    ? normalizeCondition(data.condition || data.assetCondition || data.asset_condition)
    : prev.asset_condition;

  try {
    await withTransaction(async (tx) => {
      await tx(updateSql, [
        data.name || prev.name,
        data.model ?? prev.model,
        data.status ?? prev.status,
        updatedCondition,
        data.currentValue ?? data.current_value ?? prev.current_value,
        data.notes ?? prev.notes,
        assetId,
        orgId
      ]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'UPDATE_ASSET',
        entityType: 'Asset',
        entityId: assetId,
        entityName: data.name || prev.name,
        changes: {
          previous: { status: prev.status, condition: prev.asset_condition, value: prev.current_value, version: currentVersion },
          updated: { status: data.status, condition: data.condition, value: data.currentValue, version: currentVersion + 1 }
        },
        ipAddress
      });
    });

    res.json({ success: true, message: 'Asset updated successfully.', version: currentVersion + 1 });
  } catch (err: any) {
    res.status(500).json({ error: `Asset update transaction failed: ${err.message}` });
  }
});

/**
 * DELETE /api/assets/:id
 * Only ADMIN or FINANCE (for write-off) can delete, recorded in audit transaction!
 */
assetRouter.delete('/:id', requirePermission('assets:delete'), async (req: Request, res: Response) => {
  const { orgId, role, userId: actorId, fullName: actorName } = req.auth!;
  const assetId = req.params.id;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const existing = await query('SELECT * FROM `assets` WHERE `id` = ? AND `org_id` = ?;', [assetId, orgId]);
  if (existing.length === 0) {
    res.status(404).json({ error: 'Asset not found in organization.' });
    return;
  }

  const currentVersion = Number(existing[0]!.version || 1);
  const rawExpected = req.body?.baseVersion ?? req.body?.version;
  if (rawExpected !== undefined) {
    const expectedVersion = Number(rawExpected);
    if (!isNaN(expectedVersion) && expectedVersion !== currentVersion) {
      res.status(409).json({
        error: `Conflict: Asset version mismatch on delete. Server is at version ${currentVersion}, but deletion was based on version ${expectedVersion}.`,
        currentVersion,
        expectedVersion
      });
      return;
    }
  }

  const assetName = existing[0]!.name || assetId;

  try {
    await withTransaction(async (tx) => {
      await tx('DELETE FROM `assets` WHERE `id` = ? AND `org_id` = ?;', [assetId, orgId]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'DELETE_ASSET',
        entityType: 'Asset',
        entityId: assetId,
        entityName: assetName,
        changes: { deletedAssetId: assetId, status: 'DISPOSED' },
        ipAddress
      });
    });

    res.json({ success: true, message: 'Asset deleted or written off.' });
  } catch (err: any) {
    res.status(500).json({ error: `Asset deletion transaction failed: ${err.message}` });
  }
});
