import crypto from 'crypto';
import express, { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission, idempotent, asyncHandler } from '../middleware';
import { hasPermission, canApproveWriteOff } from '../permissions';
import { recordAuditEvent } from '../audit';
import { calculateStraightLineDepreciation } from '../../shared/finance';
import { issueNextAssetTag } from '../assetTags';
import {
  EXTENDED_ASSET_COLUMN_SQL,
  EXTENDED_ASSET_PLACEHOLDER_SQL,
  EXTENDED_ASSET_UPDATE_SQL,
  extendedColumnValues,
  resolveExtendedAssetColumns
} from '../assetFields';

export const assetRouter = Router();
assetRouter.use(authenticate);

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

/** The one list of asset columns returned to clients; shared with GET /api/init. */
export const EXPLICIT_ASSET_COLUMNS = `
  \`id\`, \`org_id\`, \`branch_id\`, \`branch_name\`, \`category_id\`, \`category_name\`,
  \`asset_code\`, \`name\`, \`model\`, \`serial_number\`, \`mac_address\`, \`phone_number\`,
  \`registered_email\`, \`imei_number\`, \`status\`, \`asset_condition\`, \`purchase_date\`,
  \`purchase_cost\`, \`warranty_expiry\`, \`current_value\`, \`cost_source\`, \`assigned_to_user_id\`,
  \`assigned_to_user_name\`, \`assigned_to_user_avatar\`, \`assigned_at\`, \`image_url\`,
  \`notes\`, \`version\`, \`created_at\`, \`updated_at\`,
  \`manufacturer\`, \`supplier\`, \`invoice_number\`, \`location_detail\`, \`department_id\`,
  \`department_name\`, \`ownership_type\`, \`lease_end_date\`, \`specs\`
`;

/**
 * GET /api/assets
 * Strictly scoped by session org_id and branch boundary with explicit column projection
 */
assetRouter.get('/', requirePermission('assets:read'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, role, branchId } = req.auth!;

  let sql = `SELECT ${EXPLICIT_ASSET_COLUMNS} FROM \`assets\` WHERE \`org_id\` = ?`;
  const params: any[] = [orgId];

  // Enforce branch boundary for BRANCH_MANAGER and USER (fail closed if branchId is missing)
  if (role === 'BRANCH_MANAGER' || role === 'USER') {
    if (!branchId) {
      res.json({ assets: [] });
      return;
    }
    sql += ' AND `branch_id` = ?';
    params.push(branchId);
  }

  sql += ' ORDER BY `created_at` DESC LIMIT 500;';

  const rows = await query(sql, params);
  res.json({ assets: rows });
}));

/**
 * GET /api/assets/next-tag
 * Preview of the next sequential asset tag (ORG-CAT-00001) for a category.
 * Nothing is reserved: the number may be taken by someone else before saving.
 */
assetRouter.get('/next-tag', requirePermission('assets:create'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId } = req.auth!;
  const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined;
  const categoryName = typeof req.query.categoryName === 'string' ? req.query.categoryName : undefined;
  const issued = await issueNextAssetTag(orgId, categoryId, categoryName, { reserve: false });
  res.json(issued);
}));

/**
 * POST /api/assets/next-tag
 * Reserves the next sequential asset tag for a category. Concurrent callers
 * always receive different tags; a reserved number is never issued again.
 */
assetRouter.post('/next-tag', requirePermission('assets:create'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId } = req.auth!;
  const body = req.body || {};
  const categoryId = typeof body.categoryId === 'string' ? body.categoryId : undefined;
  const categoryName = typeof body.categoryName === 'string' ? body.categoryName : undefined;
  const issued = await issueNextAssetTag(orgId, categoryId, categoryName, { reserve: true });
  res.status(201).json(issued);
}));

/**
 * GET /api/assets/check-redundancy
 * Scoped pre-flight redundancy check for Asset Tag, Serial, MAC, and IMEI without leaking cross-tenant data
 */
assetRouter.get('/check-redundancy', requirePermission('assets:read'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, role, branchId } = req.auth!;

  const assetCode = String(req.query.assetCode || '').trim();
  const serialNumber = String(req.query.serialNumber || '').trim();
  const macAddress = String(req.query.macAddress || '').trim();
  const imeiNumber = String(req.query.imeiNumber || '').trim();
  const excludeId = String(req.query.excludeId || '').trim();

  const isAutoSerial = serialNumber.toLowerCase().startsWith('sn-ast') || serialNumber.toLowerCase().startsWith('sn-bulk');

  let duplicateQuery = `
    SELECT \`id\`, \`name\`, \`asset_code\`, \`serial_number\`, \`mac_address\`, \`imei_number\`, \`branch_id\`
    FROM \`assets\`
    WHERE \`org_id\` = ? AND \`id\` != ? AND (
      (? != '' AND LOWER(\`asset_code\`) = LOWER(?))
      OR (? = 1 AND LOWER(\`serial_number\`) = LOWER(?))
      OR (? != '' AND LOWER(\`mac_address\`) = LOWER(?))
      OR (? != '' AND LOWER(\`imei_number\`) = LOWER(?))
    )
  `;
  const params: any[] = [
    orgId,
    excludeId,
    assetCode,
    assetCode,
    serialNumber && !isAutoSerial ? 1 : 0,
    serialNumber,
    macAddress,
    macAddress,
    imeiNumber,
    imeiNumber
  ];

  if ((role === 'BRANCH_MANAGER' || role === 'USER') && branchId) {
    duplicateQuery += ' AND `branch_id` = ?';
    params.push(branchId);
  }

  duplicateQuery += ' LIMIT 1;';

  const rows = await query(duplicateQuery, params);

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
    tagConflict: isTagMatch ? { assetCode: match.asset_code } : null,
    serialConflict: isSerialMatch ? { serialNumber: match.serial_number } : null,
    macConflict: isMacMatch ? { macAddress: match.mac_address } : null,
    imeiConflict: isImeiMatch ? { imeiNumber: match.imei_number } : null,
    conflictField,
    conflictValue: conflictVal,
    message: `${conflictField} "${conflictVal}" is already registered.`
  });
}));

/**
 * POST /api/assets
 * Creates asset with org_id derived strictly from session
 * Records CREATE_ASSET in the same DB transaction!
 */
assetRouter.post('/', requirePermission('assets:create'), idempotent(), asyncHandler(async (req: Request, res: Response) => {
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

  const assetId = (data.id && typeof data.id === 'string' && /^[a-zA-Z0-9_-]{3,64}$/.test(data.id)) ? data.id : crypto.randomUUID();

  // Validate branch: BRANCH_MANAGER restricted to assigned branch; other roles can specify or fallback
  let effectiveBranchId = role === 'BRANCH_MANAGER' ? userBranchId : (data.branchId || data.branch_id || userBranchId);
  let effectiveBranchName = data.branchName || data.branch_name || 'Main Hub';

  if (effectiveBranchId) {
    const branchCheck = await query<any>(
      'SELECT `id`, `name` FROM `branches` WHERE `id` = ? AND `org_id` = ? LIMIT 1;',
      [effectiveBranchId, orgId]
    );
    if (branchCheck.length === 0) {
      res.status(400).json({ error: 'Specified branch does not exist in your organization.' });
      return;
    }
    effectiveBranchId = branchCheck[0].id;
    effectiveBranchName = branchCheck[0].name;
  }

  const condition = normalizeCondition(data.condition || data.assetCondition || data.asset_condition);

  // Redundancy & Duplicate Data Check
  const cleanCode = String(assetCode).trim();
  const cleanSerial = String(serialNumber).trim();
  const mac = (data.macAddress || data.mac_address || '').trim();
  const imei = (data.imeiNumber || data.imei_number || '').trim();

  const isAutoSerial = cleanSerial.toLowerCase().startsWith('sn-ast') || cleanSerial.toLowerCase().startsWith('sn-bulk');
  const duplicateQuery = `
    SELECT \`id\`, \`name\`, \`asset_code\`, \`serial_number\`, \`mac_address\`, \`imei_number\`
    FROM \`assets\`
    WHERE \`org_id\` = ? AND (
      LOWER(\`asset_code\`) = LOWER(?)
      OR (? = 1 AND LOWER(\`serial_number\`) = LOWER(?))
      OR (? != '' AND LOWER(\`mac_address\`) = LOWER(?))
      OR (? != '' AND LOWER(\`imei_number\`) = LOWER(?))
    ) LIMIT 1;
  `;

  const duplicates = await query(duplicateQuery, [
    orgId,
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
      error: `Redundant data detected: ${conflictField} "${conflictVal}" is already registered.`,
      code: 'DUPLICATE_ASSET_DATA',
      conflictField,
      conflictAsset: {
        id: match.id,
        name: match.name,
        assetCode: match.asset_code
      }
    });
    return;
  }

  const createCategoryId = data.categoryId || data.category_id || 'cat-gen';
  const createCategoryName = data.categoryName || data.category_name || 'Hardware';
  const extended = await resolveExtendedAssetColumns(orgId, data, createCategoryId, createCategoryName);

  const insertSql = `
    INSERT INTO \`assets\` (
      \`id\`, \`org_id\`, \`branch_id\`, \`branch_name\`, \`category_id\`, \`category_name\`,
      \`asset_code\`, \`name\`, \`model\`, \`serial_number\`, \`mac_address\`, \`phone_number\`,
      \`registered_email\`, \`imei_number\`, \`status\`, \`asset_condition\`, \`purchase_date\`,
      \`purchase_cost\`, \`warranty_expiry\`, \`current_value\`, \`cost_source\`, \`image_url\`, \`notes\`,
      ${EXTENDED_ASSET_COLUMN_SQL}, \`version\`
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${EXTENDED_ASSET_PLACEHOLDER_SQL}, 1);
  `;

  const costSource = (data.costSource || data.cost_source) === 'ESTIMATED' ? 'ESTIMATED' : 'MANUAL';

  try {
    await withTransaction(async (tx) => {
      await tx(insertSql, [
        assetId,
        orgId,
        effectiveBranchId,
        effectiveBranchName,
        createCategoryId,
        createCategoryName,
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
        costSource,
        data.imageUrl || data.image_url || '',
        data.notes || null,
        ...extendedColumnValues(extended)
      ]);

      await recordAuditEvent(tx, {
        orgId,
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

      if (req.idempotency) {
        await req.idempotency.complete(tx, 201, { success: true, id: assetId });
      }
    });

    res.status(201).json({ success: true, id: assetId });
  } catch (_err) {
    res.status(500).json({ error: 'Asset creation transaction failed.' });
  }
}));

/**
 * POST /api/assets/bulk
 * Addendum 4 Section D: High-throughput authoritative batch ingestion.
 * Validates every row against tenant schemas (branch, category, unique tag/serial).
 * Generates asset tags from sequence if omitted (no random suffixes).
 * Calculates currentValue via shared/finance.ts if omitted.
 * Free text in assignedTo cannot create custody (requires real user checkout).
 */
assetRouter.post('/bulk', express.json({ limit: '5mb' }), requirePermission('assets:create'), idempotent(), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, role, userId: actorId, fullName: actorName, branchId: userBranchId } = req.auth!;
  const { assets: rawAssets } = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (!Array.isArray(rawAssets) || rawAssets.length === 0) {
    res.status(400).json({ error: 'Body must include a non-empty "assets" array.' });
    return;
  }

  if (rawAssets.length > 500) {
    res.status(400).json({ error: 'Bulk import exceeds maximum allowed limit of 500 items per request.' });
    return;
  }

  const results: { imported: number; skipped: number; errors: string[]; warnings: string[] } = {
    imported: 0,
    skipped: 0,
    errors: [],
    warnings: []
  };

  const seenCodes = new Set<string>();
  const seenSerials = new Set<string>();

  try {
    await withTransaction(async (tx) => {
      // 1. Preload tenant branches and categories
      const dbBranches = await tx<any>('SELECT `id`, `name` FROM `branches` WHERE `org_id` = ?;', [orgId]);
      const branchById = new Map<string, { id: string; name: string }>();
      const branchByName = new Map<string, { id: string; name: string }>();
      for (const b of dbBranches) {
        branchById.set(b.id, b);
        branchByName.set(b.name.toLowerCase().trim(), b);
      }

      const dbCats = await tx<any>('SELECT `id`, `name`, `depreciation_years` FROM `asset_categories`;');
      const catById = new Map<string, { id: string; name: string; depreciation_years: number }>();
      const catByName = new Map<string, { id: string; name: string; depreciation_years: number }>();
      for (const c of dbCats) {
        catById.set(c.id, c);
        catByName.set(c.name.toLowerCase().trim(), c);
      }

      // 2. Preload existing asset tags and serial numbers in this organization to check DB duplicates
      const existingRows = await tx<any>('SELECT LOWER(`asset_code`) as code, LOWER(`serial_number`) as serial FROM `assets` WHERE `org_id` = ?;', [orgId]);
      const existingTags = new Set<string>();
      const existingSerials = new Set<string>();
      for (const r of existingRows) {
        if (r.code) existingTags.add(r.code);
        if (r.serial) existingSerials.add(r.serial);
      }

      // 3. Sequence counter for auto-generating omitted tags
      const countRows = await tx<any>('SELECT COUNT(*) as cnt FROM `assets` WHERE `org_id` = ?;', [orgId]);
      let nextSeqCounter = (countRows[0]?.cnt || 0) + 1;

      const validRows: any[][] = [];

      for (let i = 0; i < rawAssets.length; i++) {
        const item = rawAssets[i] || {};
        const rowNum = i + 1;

        // Name is required
        const name = String(item.name || item.assetName || item.asset_name || '').trim();
        if (!name) {
          results.skipped++;
          results.errors.push(`Row #${rowNum}: Device Name is required`);
          continue;
        }

        // Branch matching (fail closed - never silent fallback)
        const branchKey = item.branchId || item.branch_id;
        const branchNameKey = String(item.branchName || item.branch_name || '').toLowerCase().trim();
        let targetBranch = branchKey ? branchById.get(branchKey) : (branchNameKey ? branchByName.get(branchNameKey) : undefined);

        // Branch manager default to their own branch if not specified
        if (!targetBranch && role === 'BRANCH_MANAGER' && userBranchId) {
          targetBranch = branchById.get(userBranchId);
        }

        if (!targetBranch) {
          results.skipped++;
          results.errors.push(`Row #${rowNum}: Unknown branch "${item.branchName || item.branch_name || item.branchId}". Branch must exist in your organization.`);
          continue;
        }

        if (role === 'BRANCH_MANAGER' && userBranchId && targetBranch.id !== userBranchId) {
          results.skipped++;
          results.errors.push(`Row #${rowNum}: Branch managers can only import assets into their assigned branch.`);
          continue;
        }

        // Category matching (fail closed)
        const catKey = item.categoryId || item.category_id;
        const catNameKey = String(item.categoryName || item.category_name || item.category || '').toLowerCase().trim();
        const targetCat = catKey ? catById.get(catKey) : (catNameKey ? catByName.get(catNameKey) : undefined);

        if (!targetCat) {
          results.skipped++;
          results.errors.push(`Row #${rowNum}: Unknown category "${item.categoryName || item.category || item.categoryId}". Category does not exist.`);
          continue;
        }

        // Asset tag generation or validation
        let assetCode = String(item.assetCode || item.asset_code || '').trim();
        if (!assetCode) {
          assetCode = `OMNI-TAG-${String(nextSeqCounter++).padStart(5, '0')}`;
        }

        const cleanCode = assetCode.toLowerCase();
        if (seenCodes.has(cleanCode)) {
          results.skipped++;
          results.errors.push(`Row #${rowNum}: Duplicate asset tag "${assetCode}" within import file.`);
          continue;
        }
        if (existingTags.has(cleanCode)) {
          results.skipped++;
          results.errors.push(`Row #${rowNum}: Asset tag "${assetCode}" already registered in database.`);
          continue;
        }
        seenCodes.add(cleanCode);

        // Serial number validation
        const serialNumber = String(item.serialNumber || item.serial_number || `SN-${assetCode}`).trim();
        const isAutoSerial = serialNumber.toLowerCase().startsWith('sn-omni') || serialNumber.toLowerCase().startsWith('sn-ast');
        if (!isAutoSerial) {
          const cleanSerial = serialNumber.toLowerCase();
          if (seenSerials.has(cleanSerial)) {
            results.skipped++;
            results.errors.push(`Row #${rowNum}: Duplicate serial number "${serialNumber}" within import file.`);
            continue;
          }
          if (existingSerials.has(cleanSerial)) {
            results.skipped++;
            results.errors.push(`Row #${rowNum}: Serial number "${serialNumber}" already registered in database.`);
            continue;
          }
          seenSerials.add(cleanSerial);
        }

        // Free text in assignedTo cannot create custody (drop with warning)
        if (item.assignedTo && typeof item.assignedTo === 'string' && item.assignedTo.trim() && !item.assignedToUserId) {
          results.warnings.push(`Row #${rowNum}: Free-text custodian "${item.assignedTo}" dropped. Custody must be formally assigned via checkout.`);
        }

        const purchaseCost = Math.max(0, Number(item.purchaseCost ?? item.purchase_cost ?? 0));
        const purchaseDate = String(item.purchaseDate || item.purchase_date || new Date().toISOString().split('T')[0]!).trim();

        // Calculate currentValue using shared/finance.ts if omitted
        let currentValue = Number(item.currentValue ?? item.current_value);
        if (isNaN(currentValue) || currentValue <= 0) {
          const usefulMonths = Math.max(12, (targetCat.depreciation_years || 3) * 12);
          currentValue = calculateStraightLineDepreciation(purchaseCost, purchaseDate, { usefulLifeMonths: usefulMonths }).bookValue;
        }

        const costSource = (item.costSource || item.cost_source) === 'ESTIMATED' ? 'ESTIMATED' : 'MANUAL';
        const assetId = crypto.randomUUID();

        validRows.push([
          assetId,
          orgId,
          targetBranch.id,
          targetBranch.name,
          targetCat.id,
          targetCat.name,
          assetCode,
          name,
          item.model || '',
          serialNumber,
          item.macAddress || item.mac_address || null,
          item.phoneNumber || item.phone_number || null,
          item.registeredEmail || item.registered_email || null,
          item.imeiNumber || item.imei_number || null,
          normalizeStatus(item.status),
          normalizeCondition(item.condition || item.assetCondition),
          purchaseDate,
          purchaseCost,
          item.warrantyExpiry || item.warranty_expiry || null,
          currentValue,
          costSource,
          item.imageUrl || item.image_url || '',
          item.notes || null
        ]);

        results.imported++;
      }

      // Execute in batch chunks of 50
      const CHUNK_SIZE = 50;
      for (let c = 0; c < validRows.length; c += CHUNK_SIZE) {
        const chunk = validRows.slice(c, c + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').join(', ');
        const bulkInsertSql = `
          INSERT INTO \`assets\` (
            \`id\`, \`org_id\`, \`branch_id\`, \`branch_name\`, \`category_id\`, \`category_name\`,
            \`asset_code\`, \`name\`, \`model\`, \`serial_number\`, \`mac_address\`, \`phone_number\`,
            \`registered_email\`, \`imei_number\`, \`status\`, \`asset_condition\`, \`purchase_date\`,
            \`purchase_cost\`, \`warranty_expiry\`, \`current_value\`, \`cost_source\`, \`image_url\`, \`notes\`, \`version\`
          ) VALUES ${placeholders};
        `;
        const flatParams = chunk.flat();
        await tx(bulkInsertSql, flatParams);
      }

      if (results.imported > 0) {
        await recordAuditEvent(tx, {
          orgId,
          actorId,
          userName: actorName,
          role,
          action: 'BULK_IMPORT',
          entityType: 'Asset',
          entityId: `bulk-${Date.now()}`,
          entityName: `${results.imported} Assets`,
          changes: { importedCount: results.imported, skippedCount: results.skipped },
          ipAddress
        });
      }

      if (req.idempotency) {
        await req.idempotency.complete(tx, 201, { success: true, ...results });
      }
    });

    res.status(201).json({ success: true, ...results });
  } catch (err: any) {
    res.status(500).json({ error: 'Bulk asset import transaction failed: ' + (err.message || 'database error') });
  }
}));

/**
 * PUT /api/assets/:id
 * Addendum 4 Section E1: Strict persistence contract. Whitelist updatable fields.
 * Updates asset and records UPDATE_ASSET in the same DB transaction.
 * Enforces mandatory baseVersion (OCC), valuation permissions, and write-off SoD guards.
 * Prohibits changing branchId/branchName directly (use dedicated transfer-branch endpoint).
 */
assetRouter.put('/:id', requirePermission('assets:update'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, role, userId: actorId, fullName: actorName, branchId: userBranchId } = req.auth!;
  const assetId = req.params.id;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  let verifySql = `SELECT ${EXPLICIT_ASSET_COLUMNS} FROM \`assets\` WHERE \`id\` = ? AND \`org_id\` = ?`;
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

  // Mandatory baseVersion for Optimistic Concurrency Control (OCC)
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
      error: `Conflict: Asset version mismatch. Server is at version ${currentVersion}, but update was based on version ${expectedVersion}.`,
      code: 'VERSION_CONFLICT',
      currentVersion,
      expectedVersion
    });
    return;
  }

  // Permission check for valuation changes (current_value)
  const isUpdatingValue = data.currentValue !== undefined || data.current_value !== undefined;
  if (isUpdatingValue) {
    const proposedValue = Number(data.currentValue ?? data.current_value);
    if (proposedValue !== Number(prev.current_value)) {
      if (!hasPermission(role, 'assets:valuation')) {
        res.status(403).json({
          error: 'Only administrators and finance personnel are authorized to modify asset valuation.',
          code: 'FORBIDDEN'
        });
        return;
      }
    }
  }

  // Status transitions & Separation of Duties
  let targetStatus = prev.status;
  if (data.status && data.status !== prev.status) {
    const candidateStatus = normalizeStatus(data.status);

    if (candidateStatus === 'DISPOSED' || candidateStatus === 'SOLD' || candidateStatus === 'DEPRECATED') {
      if (!hasPermission(role, 'assets:writeoff')) {
        res.status(403).json({
          error: 'You do not have permission to write off, dispose, or retire assets.',
          code: 'FORBIDDEN'
        });
        return;
      }

      if (!canApproveWriteOff(actorId, prev.assigned_to_user_id, role, prev.created_by_user_id)) {
        res.status(403).json({
          error: 'Separation of duties violation: custody holder or creator cannot approve asset write-off.',
          code: 'SOD_VIOLATION'
        });
        return;
      }
    } else if (candidateStatus === 'REPAIR') {
      if (prev.status === 'DISPOSED' || prev.status === 'SOLD' || prev.status === 'DEPRECATED') {
        res.status(400).json({
          error: `Cannot transition asset in "${prev.status}" state to REPAIR.`,
          code: 'INVALID_STATUS_TRANSITION'
        });
        return;
      }
    }

    targetStatus = candidateStatus;
  }

  const updatedCondition = (data.condition || data.assetCondition || data.asset_condition)
    ? normalizeCondition(data.condition || data.assetCondition || data.asset_condition)
    : prev.asset_condition;

  const targetValue = isUpdatingValue ? Number(data.currentValue ?? data.current_value) : prev.current_value;

  // Whitelisted updatable fields (strictly excluding id, org_id, branch_id, asset_code, custody)
  const newName = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : prev.name;
  const newModel = typeof data.model === 'string' ? data.model.trim() : prev.model;
  const newSerial = typeof data.serialNumber === 'string' && data.serialNumber.trim() ? data.serialNumber.trim() : prev.serial_number;
  const newMac = data.macAddress !== undefined ? (data.macAddress || null) : prev.mac_address;
  const newImei = data.imeiNumber !== undefined ? (data.imeiNumber || null) : prev.imei_number;
  const newPhone = data.phoneNumber !== undefined ? (data.phoneNumber || null) : prev.phone_number;
  const newCatId = data.categoryId || data.category_id || prev.category_id;
  const newCatName = data.categoryName || data.category_name || prev.category_name;
  const newCost = data.purchaseCost !== undefined ? Number(data.purchaseCost) : prev.purchase_cost;
  const newWarranty = data.warrantyExpiry !== undefined ? (data.warrantyExpiry || null) : prev.warranty_expiry;
  const newCostSource = data.costSource === 'ESTIMATED' ? 'ESTIMATED' : (data.costSource === 'MANUAL' ? 'MANUAL' : prev.cost_source);
  const newNotes = data.notes !== undefined ? (data.notes || null) : prev.notes;
  const newImage = data.imageUrl !== undefined ? (data.imageUrl || '') : prev.image_url;
  const extended = await resolveExtendedAssetColumns(orgId, data, newCatId, newCatName, prev);

  const updateSql = `
    UPDATE \`assets\` SET
      \`name\` = ?, \`model\` = ?, \`serial_number\` = ?, \`mac_address\` = ?, \`imei_number\` = ?, \`phone_number\` = ?,
      \`category_id\` = ?, \`category_name\` = ?, \`status\` = ?, \`asset_condition\` = ?,
      \`purchase_cost\` = ?, \`warranty_expiry\` = ?, \`current_value\` = ?, \`cost_source\` = ?,
      \`notes\` = ?, \`image_url\` = ?, ${EXTENDED_ASSET_UPDATE_SQL}, \`version\` = \`version\` + 1
    WHERE \`id\` = ? AND \`org_id\` = ? AND \`version\` = ?;
  `;

  try {
    await withTransaction(async (tx) => {
      const updateRes = await tx(updateSql, [
        newName,
        newModel,
        newSerial,
        newMac,
        newImei,
        newPhone,
        newCatId,
        newCatName,
        targetStatus,
        updatedCondition,
        newCost,
        newWarranty,
        targetValue,
        newCostSource,
        newNotes,
        newImage,
        ...extendedColumnValues(extended),
        assetId,
        orgId,
        currentVersion
      ]);

      const affected = (updateRes as any)?.affectedRows ?? (Array.isArray(updateRes) ? (updateRes as any)[0]?.affectedRows : undefined);
      if (affected !== undefined && affected === 0) {
        const err: any = new Error('Conflict: Asset version mismatch. Concurrent update already modified this asset.');
        err.statusCode = 409;
        err.code = 'VERSION_CONFLICT';
        throw err;
      }

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'UPDATE_ASSET',
        entityType: 'Asset',
        entityId: assetId,
        entityName: newName,
        changes: {
          previous: { status: prev.status, condition: prev.asset_condition, value: prev.current_value, version: currentVersion },
          updated: { status: targetStatus, condition: updatedCondition, value: targetValue, version: currentVersion + 1 }
        },
        ipAddress
      });
    });

    res.json({ success: true, message: 'Asset updated successfully.', version: currentVersion + 1 });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: statusCode === 409 ? err.message : 'Asset update transaction failed.' });
  }
}));

/**
 * Addendum 4 Section E1: Dedicated Branch Transfer Endpoint
 * POST /api/assets/:id/transfer-branch
 * Moves an asset between branches within the tenant boundary.
 * Audited, verifies target branch exists in the caller's organization.
 */
assetRouter.post('/:id/transfer-branch', requirePermission('assets:update'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, role, userId: actorId, fullName: actorName, branchId: userBranchId } = req.auth!;
  const assetId = req.params.id;
  const { targetBranchId, reason } = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (!targetBranchId || typeof targetBranchId !== 'string') {
    res.status(400).json({ error: 'targetBranchId is required.' });
    return;
  }

  // 1. Verify asset exists
  let verifySql = `SELECT ${EXPLICIT_ASSET_COLUMNS} FROM \`assets\` WHERE \`id\` = ? AND \`org_id\` = ?`;
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

  // 2. Cannot transfer assets that are currently checked out
  if (prev.assigned_to_user_id) {
    res.status(400).json({
      error: `Asset is currently checked out to "${prev.assigned_to_user_name}". It must be returned before transferring branches.`,
      code: 'ASSET_CHECKED_OUT'
    });
    return;
  }

  // 3. Verify target branch belongs to caller's org
  const branchRows = await query<any>(
    'SELECT `id`, `name` FROM `branches` WHERE `id` = ? AND `org_id` = ? LIMIT 1;',
    [targetBranchId.trim(), orgId]
  );
  if (branchRows.length === 0) {
    res.status(400).json({ error: 'Target branch does not exist in your organization.' });
    return;
  }

  const targetBranch = branchRows[0]!;
  if (targetBranch.id === prev.branch_id) {
    res.status(400).json({ error: 'Asset is already assigned to this branch.' });
    return;
  }

  await withTransaction(async (tx) => {
    await tx(
      'UPDATE `assets` SET `branch_id` = ?, `branch_name` = ?, `version` = `version` + 1 WHERE `id` = ? AND `org_id` = ?;',
      [targetBranch.id, targetBranch.name, assetId, orgId]
    );

    await recordAuditEvent(tx, {
      orgId,
      actorId,
      userName: actorName,
      role,
      action: 'TRANSFER_BRANCH',
      entityType: 'Asset',
      entityId: assetId,
      entityName: prev.name,
      changes: {
        fromBranchId: prev.branch_id,
        fromBranchName: prev.branch_name,
        toBranchId: targetBranch.id,
        toBranchName: targetBranch.name,
        reason: reason || 'Inter-facility inventory rebalancing'
      },
      ipAddress
    });
  });

  res.json({
    success: true,
    message: `Asset successfully transferred from ${prev.branch_name} to ${targetBranch.name}.`,
    branchId: targetBranch.id,
    branchName: targetBranch.name
  });
}));

/**
 * DELETE /api/assets/:id
 * Only ADMIN can execute hard deletion, and only on assets with ZERO linked records and NO active assignment.
 * Assets with history must be written off (status: DISPOSED) to preserve custody ledger integrity.
 */
assetRouter.delete('/:id', requirePermission('assets:delete'), idempotent(), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, role, userId: actorId, fullName: actorName } = req.auth!;
  const assetId = req.params.id;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  if (role !== 'ADMIN') {
    res.status(403).json({ error: 'Only administrators are authorized to purge assets from the registry.' });
    return;
  }

  const existing = await query(`SELECT ${EXPLICIT_ASSET_COLUMNS} FROM \`assets\` WHERE \`id\` = ? AND \`org_id\` = ?;`, [assetId, orgId]);
  if (existing.length === 0) {
    res.status(404).json({ error: 'Asset not found in organization.' });
    return;
  }

  const asset = existing[0]!;
  const currentVersion = Number(asset.version || 1);

  const rawExpected = req.body?.baseVersion ?? req.body?.version;
  if (rawExpected !== undefined) {
    const expectedVersion = Number(rawExpected);
    if (!isNaN(expectedVersion) && expectedVersion !== currentVersion) {
      res.status(409).json({
        error: `Conflict: Asset version mismatch on delete. Server is at version ${currentVersion}, but deletion was based on version ${expectedVersion}.`,
        code: 'VERSION_CONFLICT',
        currentVersion,
        expectedVersion
      });
      return;
    }
  }

  // Refuse hard delete if asset has linked checkouts, maintenances, or is currently assigned
  const historyCheck = await query<any>(
    'SELECT (SELECT COUNT(*) FROM `checkouts` WHERE `asset_id` = ?) + (SELECT COUNT(*) FROM `maintenances` WHERE `asset_id` = ?) AS cnt;',
    [assetId, assetId]
  );
  const hasLinkedRecords = (historyCheck[0]?.cnt || 0) > 0;
  const isAssigned = Boolean(asset.assigned_to_user_id);

  if (hasLinkedRecords || isAssigned) {
    res.status(409).json({
      error: 'Cannot delete asset with associated checkout or maintenance records or active custody. Write off asset (status: DISPOSED) instead.',
      code: 'ASSET_HAS_HISTORY'
    });
    return;
  }

  const assetName = asset.name || assetId;

  try {
    await withTransaction(async (tx) => {
      const deleteRes = await tx(
        'DELETE FROM `assets` WHERE `id` = ? AND `org_id` = ? AND (`version` = ? OR ? IS NULL);',
        [assetId, orgId, currentVersion, currentVersion]
      );

      const affected = (deleteRes as any)?.affectedRows ?? (Array.isArray(deleteRes) ? (deleteRes as any)[0]?.affectedRows : undefined);
      if (affected !== undefined && affected === 0) {
        const err: any = new Error('Conflict: Asset version mismatch on delete.');
        err.statusCode = 409;
        err.code = 'VERSION_CONFLICT';
        throw err;
      }

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'DELETE_ASSET',
        entityType: 'Asset',
        entityId: assetId,
        entityName: assetName,
        changes: { deletedAssetId: assetId },
        ipAddress
      });

      if (req.idempotency) {
        await req.idempotency.complete(tx, 200, {
          success: true,
          message: 'Asset purged from registry.'
        });
      }
    });

    res.json({ success: true, message: 'Asset purged from registry.' });
  } catch (_err) {
    res.status(500).json({ error: 'Asset deletion transaction failed.' });
  }
}));
