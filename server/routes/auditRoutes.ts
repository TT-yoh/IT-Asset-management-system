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
    SELECT \`id\`, \`org_id\`, \`seq\`, \`actor_id\`, \`actor_user_id\`, \`user_name\`, \`user_role\`,
           \`action\`, \`entity_type\`, \`entity_id\`, \`entity_name\`,
           \`changes\`, \`timestamp\`, \`prev_hash\`, \`hash\`, \`hash_version\`, \`ip_address\`
    FROM \`audit_logs\`
    WHERE \`org_id\` = ?
    ORDER BY \`seq\` DESC, \`timestamp\` DESC LIMIT 500;
  `, [orgId]);

  res.json({ auditLogs: rows });
});

/**
 * GET /api/audit-logs/verify
 * Validates the cryptographic chain for the active tenant.
 * Cursor-based streaming verification in batches of 1000.
 * Default verifies last 10,000 rows (O(1) memory); ?full=1 restricted to ADMIN.
 */
auditRouter.get('/verify', requirePermission('audit:read'), async (req: Request, res: Response) => {
  const { orgId, role } = req.auth!;
  const isFullRequested = req.query.full === '1' || req.query.full === 'true';

  if (isFullRequested && role !== 'ADMIN') {
    res.status(403).json({ error: 'Full historical audit verification is restricted to administrators' });
    return;
  }

  try {
    const result = await verifyAuditChain(orgId, { full: isFullRequested });
    res.json({
      valid: result.valid,
      checkedCount: result.checkedCount,
      firstSeq: result.firstSeq,
      lastSeq: result.lastSeq,
      brokenAtSeq: result.brokenAtSeq,
      reason: result.reason,
      // Retained backwards-compatible fields
      orgId: result.orgId,
      totalRecords: result.totalRecords,
      chainLength: result.chainLength,
      genesisHash: result.genesisHash,
      latestHash: result.latestHash,
      errors: result.errors
    });
  } catch (err: any) {
    console.error(`[AUDIT VERIFY ERROR] orgId=${orgId}:`, err?.message || err);
    res.status(500).json({ error: 'Audit chain verification error' });
  }
});
