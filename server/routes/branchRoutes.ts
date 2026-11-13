import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db';
import { authenticate, requirePermission, asyncHandler } from '../middleware';
import { recordAuditEvent } from '../audit';

export const branchRouter = Router();
branchRouter.use(authenticate);

const EXPLICIT_BRANCH_COLUMNS = `
  \`id\`, \`org_id\`, \`name\`, \`code\`, \`location\`, \`city\`, \`country\`, \`manager_name\`, \`version\`, \`created_at\`
`;

const CreateBranchSchema = z.object({
  // Optional client-generated id, so a record created optimistically in the browser keeps
  // the same id on the server and can be edited before the next data refresh.
  id: z.string().regex(/^[a-zA-Z0-9_-]{3,64}$/).optional(),
  name: z.string().trim().min(1, 'Branch name is required').max(100),
  city: z.string().trim().min(1, 'City is required').max(100),
  code: z.string().trim().max(64).optional(),
  location: z.string().trim().max(255).optional(),
  country: z.string().trim().max(100).optional(),
  managerName: z.string().trim().max(128).optional(),
  manager_name: z.string().trim().max(128).optional()
});

const UpdateBranchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  code: z.string().trim().max(64).optional(),
  location: z.string().trim().max(255).optional(),
  country: z.string().trim().max(100).optional(),
  managerName: z.string().trim().max(128).optional(),
  manager_name: z.string().trim().max(128).optional(),
  baseVersion: z.number().int().positive().optional()
});

/**
 * GET /api/branches
 * Scoped strictly by tenant org_id with explicit columns
 */
branchRouter.get('/', requirePermission('branches:read'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId } = req.auth!;

  const rows = await query(
    `SELECT ${EXPLICIT_BRANCH_COLUMNS} FROM \`branches\` WHERE \`org_id\` = ? AND \`archived_at\` IS NULL ORDER BY \`name\` ASC;`,
    [orgId]
  );

  res.json({ branches: rows });
}));

/**
 * POST /api/branches
 * Ignores client-supplied id; generates UUID; plain INSERT; fails on duplicate code.
 */
branchRouter.post('/', requirePermission('branches:manage'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const parseResult = CreateBranchSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: parseResult.error.issues[0]?.message || 'Invalid branch data',
      code: 'VALIDATION_ERROR'
    });
    return;
  }

  const data = parseResult.data;
  const branchId = data.id || crypto.randomUUID();
  const rawCode = data.code || `BR-${data.name.substring(0, 3).toUpperCase()}`;
  const code = rawCode.trim();
  const managerName = data.managerName || data.manager_name || 'Unassigned';

  try {
    await withTransaction(async (tx) => {
      await tx(`
        INSERT INTO \`branches\` (\`id\`, \`org_id\`, \`name\`, \`code\`, \`location\`, \`city\`, \`country\`, \`manager_name\`, \`version\`)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1);
      `, [
        branchId,
        orgId,
        data.name.trim(),
        code,
        data.location || 'Site Facility',
        data.city.trim(),
        data.country || 'Australia',
        managerName.trim()
      ]);

      await tx(
        'UPDATE `organizations` SET `branches_count` = (SELECT COUNT(*) FROM `branches` WHERE `org_id` = ? AND `archived_at` IS NULL) WHERE `id` = ?;',
        [orgId, orgId]
      );

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'CREATE_BRANCH',
        entityType: 'Organization',
        entityId: branchId,
        entityName: data.name.trim(),
        changes: { code, city: data.city.trim(), location: data.location, managerName },
        ipAddress
      });
    });

    res.status(201).json({ success: true, id: branchId });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      res.status(409).json({
        error: `Branch with code "${code}" already exists in this organization.`,
        code: 'DUPLICATE'
      });
      return;
    }
    res.status(500).json({ error: 'Branch creation transaction failed.' });
  }
}));

/**
 * PUT /api/branches/:id
 * Enforces OCC via baseVersion and updates version.
 */
branchRouter.put('/:id', requirePermission('branches:manage'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const branchId = req.params.id;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  const parseResult = UpdateBranchSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: parseResult.error.issues[0]?.message || 'Invalid branch update payload',
      code: 'VALIDATION_ERROR'
    });
    return;
  }

  const data = parseResult.data;
  const existing = await query<any>(
    'SELECT * FROM `branches` WHERE `id` = ? AND `org_id` = ? AND `archived_at` IS NULL LIMIT 1;',
    [branchId, orgId]
  );

  if (existing.length === 0) {
    res.status(404).json({ error: 'Branch not found in organization.' });
    return;
  }

  const prev = existing[0]!;
  if (data.baseVersion !== undefined && prev.version !== data.baseVersion) {
    res.status(409).json({
      error: 'Branch record has been modified by another transaction.',
      code: 'VERSION_CONFLICT',
      currentVersion: prev.version,
      expectedVersion: data.baseVersion
    });
    return;
  }

  const name = data.name !== undefined ? data.name.trim() : prev.name;
  const code = data.code !== undefined ? data.code.trim() : prev.code;
  const location = data.location ?? prev.location;
  const city = data.city !== undefined ? data.city.trim() : prev.city;
  const country = data.country !== undefined ? data.country.trim() : prev.country;
  const managerName = data.managerName || data.manager_name || prev.manager_name;
  const newVersion = (prev.version || 1) + 1;

  try {
    await withTransaction(async (tx) => {
      await tx(`
        UPDATE \`branches\` SET
          \`name\` = ?, \`code\` = ?, \`location\` = ?, \`city\` = ?, \`country\` = ?, \`manager_name\` = ?, \`version\` = ?
        WHERE \`id\` = ? AND \`org_id\` = ?;
      `, [name, code, location, city, country, managerName, newVersion, branchId, orgId]);

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'UPDATE_BRANCH',
        entityType: 'Organization',
        entityId: branchId,
        entityName: name,
        changes: { previous: prev, updated: { name, code, location, city, country, managerName, version: newVersion } },
        ipAddress
      });
    });

    res.json({ success: true, message: 'Branch updated successfully.', version: newVersion });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      res.status(409).json({
        error: `Branch with code "${code}" already exists in this organization.`,
        code: 'DUPLICATE'
      });
      return;
    }
    res.status(500).json({ error: 'Branch update transaction failed.' });
  }
}));

/**
 * DELETE /api/branches/:id
 * Refuses inside one transaction when ANY of assets, users, checkouts, budgets reference it.
 */
branchRouter.delete('/:id', requirePermission('branches:manage'), asyncHandler(async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role } = req.auth!;
  const branchId = req.params.id;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  try {
    await withTransaction(async (tx) => {
      const existing = await tx(
        'SELECT * FROM `branches` WHERE `id` = ? AND `org_id` = ? AND `archived_at` IS NULL LIMIT 1 FOR UPDATE;',
        [branchId, orgId]
      );
      if (existing.length === 0) {
        res.status(404).json({ error: 'Branch not found in organization.' });
        return;
      }
      const branchRow = existing[0];

      // 1. Assets check
      const assetsCount = await tx(
        'SELECT COUNT(*) as cnt FROM `assets` WHERE `branch_id` = ? AND `org_id` = ?;',
        [branchId, orgId]
      );
      if ((assetsCount[0]?.cnt || 0) > 0) {
        res.status(409).json({
          error: `Cannot delete branch with ${assetsCount[0].cnt} associated asset(s). Reassign assets first.`,
          code: 'BRANCH_HAS_ASSETS'
        });
        return;
      }

      // 2. Users check
      const usersCount = await tx(
        "SELECT COUNT(*) as cnt FROM `users` WHERE `branch_id` = ? AND `org_id` = ? AND `status` != 'DELETED';",
        [branchId, orgId]
      );
      if ((usersCount[0]?.cnt || 0) > 0) {
        res.status(409).json({
          error: `Cannot delete branch with ${usersCount[0].cnt} associated staff member(s). Reassign staff first.`,
          code: 'BRANCH_HAS_USERS'
        });
        return;
      }

      // 3. Active checkouts check
      const checkoutsCount = await tx(
        "SELECT COUNT(*) as cnt FROM `checkouts` WHERE `branch_id` = ? AND `org_id` = ? AND `status` = 'ACTIVE';",
        [branchId, orgId]
      );
      if ((checkoutsCount[0]?.cnt || 0) > 0) {
        res.status(409).json({
          error: `Cannot delete branch with ${checkoutsCount[0].cnt} active checkout lease(s). Return assets first.`,
          code: 'BRANCH_HAS_CHECKOUTS'
        });
        return;
      }

      // 4. Budgets check
      const budgetsCount = await tx(
        'SELECT COUNT(*) as cnt FROM `budgets` WHERE `branch_name` = ? AND `org_id` = ?;',
        [branchRow.name, orgId]
      );
      if ((budgetsCount[0]?.cnt || 0) > 0) {
        res.status(409).json({
          error: `Cannot delete branch with ${budgetsCount[0].cnt} associated budget record(s).`,
          code: 'BRANCH_HAS_BUDGETS'
        });
        return;
      }

      // Execute delete (or soft delete)
      await tx('DELETE FROM `branches` WHERE `id` = ? AND `org_id` = ?;', [branchId, orgId]);

      // Update organizations branches count
      await tx(
        'UPDATE `organizations` SET `branches_count` = (SELECT COUNT(*) FROM `branches` WHERE `org_id` = ? AND `archived_at` IS NULL) WHERE `id` = ?;',
        [orgId, orgId]
      );

      await recordAuditEvent(tx, {
        orgId,
        actorId,
        userName: actorName,
        role,
        action: 'DELETE_BRANCH',
        entityType: 'Organization',
        entityId: branchId,
        entityName: branchRow.name,
        changes: { deletedBranchId: branchId },
        ipAddress
      });

      res.json({ success: true, message: 'Branch removed successfully.' });
    });
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Branch deletion transaction failed.' });
    }
  }
}));
