import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate, requirePermission } from '../middleware';
import { verifyAuditChain } from '../audit';

export const auditRouter = Router();
auditRouter.use(authenticate);

/**
 * GET /api/audit-logs
 * Only ADMIN, DIRECTOR, and FINANCE can read immutable audit logs.
 * Strictly scopes by session tenant ID with explicit column projection.
 */
auditRouter.get('/', requirePermission('audit:read'), async (req: Request, res: Response) => {
  const { orgId } = req.auth!;

  const rows = await query(`
    SELECT \`id\`, \`org_id\`, \`seq\`, \`actor_id\`, \`user_name\`, \`user_role\`,
           \`action\`, \`entity_type\`, \`entity_id\`, \`entity_name\`,
           \`changes\`, \`timestamp\`, \`prev_hash\`, \`hash\`, \`ip_address\`
    FROM \`audit_logs\`
    WHERE \`org_id\` = ?
    ORDER BY \`seq\` DESC, \`timestamp\` DESC LIMIT 500;
  `, [orgId]);

  res.json({ auditLogs: rows });
});

/**
 * GET /api/audit-logs/verify
 * Validates the entire SHA-256 cryptographic chain for the active tenant.
 */
auditRouter.get('/verify', requirePermission('audit:read'), async (req: Request, res: Response) => {
  const { orgId } = req.auth!;

  try {
    const result = await verifyAuditChain(orgId);
    res.json(result);
  } catch (_err) {
    res.status(500).json({ error: 'Audit chain verification error' });
  }
});
