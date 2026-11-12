import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db';
import { authenticate, requireSuperAdmin, invalidateUserCache, asyncHandler } from '../middleware';
import { recordAuditEvent } from '../audit';
import { validateRequest } from '../middleware/validate';

export const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(requireSuperAdmin);

const switchOrgSchema = z.object({
  orgId: z.string().min(1, 'Target organization ID is required')
}).strict();

/**
 * POST /api/admin/switch-org
 * Explicit audited endpoint allowing super admins to switch tenant scope.
 * Validates target organization against database and records an audit log.
 */
adminRouter.post(
  '/switch-org',
  validateRequest({ body: switchOrgSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { orgId: targetOrgId } = req.body;
    const actor = req.auth!;
    const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

    const orgs = await query<any>(
      'SELECT `id`, `name`, `type` FROM `organizations` WHERE `id` = ? LIMIT 1;',
      [targetOrgId]
    );

    if (orgs.length === 0) {
      res.status(404).json({
        error: `Organization with ID "${targetOrgId}" does not exist.`,
        code: 'ORG_NOT_FOUND'
      });
      return;
    }

    const targetOrg = orgs[0];
    const previousOrgId = actor.orgId;

    // Persist new organization scope for the super-admin user atomically with audit log
    await withTransaction(async (tx) => {
      await tx(
        'UPDATE `users` SET `org_id` = ?, `updated_at` = NOW() WHERE `id` = ?;',
        [targetOrg.id, actor.userId]
      );

      // Audit log the scope switch
      await recordAuditEvent(tx, {
        orgId: targetOrg.id,
        actorId: actor.userId,
        userName: actor.fullName,
        role: actor.role,
        action: 'SWITCH_ORG',
        entityType: 'Organization',
        entityId: targetOrg.id,
        entityName: targetOrg.name,
        changes: {
          previousOrgId,
          newOrgId: targetOrg.id
        },
        ipAddress
      });
    });

    // Invalidate user cache so subsequent queries immediately pick up new org_id
    invalidateUserCache(actor.userId);

    res.json({
      success: true,
      message: `Switched active organization to ${targetOrg.name}`,
      activeOrg: targetOrg
    });
  })
);

/**
 * GET /api/admin/organizations
 * Returns all system organizations for super admins.
 */
adminRouter.get('/organizations', asyncHandler(async (_req: Request, res: Response) => {
  const orgs = await query<any>(
    'SELECT `id`, `name`, `type`, `logo`, `branding_color`, `branches_count` FROM `organizations` ORDER BY `name` ASC;'
  );
  res.json({ organizations: orgs });
}));

