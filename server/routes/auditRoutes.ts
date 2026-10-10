import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate, requirePermission } from '../middleware';
import { recordAuditEvent, verifyAuditChain } from '../audit';

export const auditRouter = Router();
auditRouter.use(authenticate);

/**
 * GET /api/audit-logs
 * Only ADMIN, DIRECTOR, and FINANCE can read immutable audit logs
 */
auditRouter.get('/', requirePermission('audit:read'), async (req: Request, res: Response) => {
  const { orgId } = req.auth!;

  const rows = await query(`
    SELECT * FROM \`audit_logs\`
    WHERE \`org_id\` = ?
    ORDER BY \`seq\` DESC, \`timestamp\` DESC LIMIT 500;
  `, [orgId]);

  res.json({ auditLogs: rows });
});

/**
 * GET /api/audit-logs/verify
 * Validates the entire SHA-256 cryptographic chain for the active tenant
 */
auditRouter.get('/verify', requirePermission('audit:read'), async (req: Request, res: Response) => {
  const { orgId } = req.auth!;

  try {
    const result = await verifyAuditChain(orgId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: `Audit chain verification error: ${err.message}` });
  }
});

/**
 * POST /api/audit-logs
 * Records an audit log linked to the tenant's hash chain
 */
auditRouter.post('/', async (req: Request, res: Response) => {
  const { orgId, userId: actorId, fullName: actorName, role: actorRole } = req.auth!;
  const data = req.body;
  const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

  try {
    const record = await recordAuditEvent(query, {
      orgId,
      actorId,
      userName: actorName,
      role: actorRole,
      action: data.action || 'MODIFY',
      entityType: data.entityType || 'Asset',
      entityId: data.entityId || data.id || 'system',
      entityName: data.entityName || 'System Record',
      changes: data.changes || {},
      ipAddress
    });

    res.status(201).json({ success: true, record });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to record audit log: ${err.message}` });
  }
});
