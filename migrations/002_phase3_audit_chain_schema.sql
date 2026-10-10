-- ============================================================================
-- Migration: 002_phase3_audit_chain_schema.sql
-- Description: Adds sequential ordering, actor tracking, and cryptographic
--              SHA-256 hash chaining columns to audit_logs for tamper detection.
-- ============================================================================

USE `it_asset_ledger`;

ALTER TABLE `audit_logs`
  ADD COLUMN IF NOT EXISTS `seq` BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `actor_id` VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS `entity_id` VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS `prev_hash` VARCHAR(64) NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
  ADD COLUMN IF NOT EXISTS `hash` VARCHAR(64) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS `idx_audit_org_seq` ON `audit_logs` (`org_id`, `seq`);
