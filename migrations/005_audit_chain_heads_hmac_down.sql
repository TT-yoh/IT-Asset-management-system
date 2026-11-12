-- Rollback: 005_audit_chain_heads_hmac_down.sql
ALTER TABLE `audit_logs`
  DROP COLUMN IF EXISTS `hash_version`;

