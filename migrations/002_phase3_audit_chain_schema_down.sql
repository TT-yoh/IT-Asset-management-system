-- ============================================================================
-- Down Migration: 002_phase3_audit_chain_schema_down.sql
-- Description: Reverts the additions of seq, actor_id, entity_id, prev_hash, and hash.
-- ============================================================================

USE `it_asset_ledger`;

DROP INDEX IF EXISTS `idx_audit_org_seq` ON `audit_logs`;

ALTER TABLE `audit_logs`
  DROP COLUMN IF EXISTS `seq`,
  DROP COLUMN IF EXISTS `actor_id`,
  DROP COLUMN IF EXISTS `entity_id`,
  DROP COLUMN IF EXISTS `prev_hash`,
  DROP COLUMN IF EXISTS `hash`;
