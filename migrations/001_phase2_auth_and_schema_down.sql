-- ============================================================================
-- Migration Rollback: 001_phase2_auth_and_schema_down.sql
-- ============================================================================

USE `it_asset_ledger`;

ALTER TABLE `users`
  DROP INDEX IF EXISTS `idx_users_invite_token`,
  DROP INDEX IF EXISTS `idx_users_reset_token`,
  DROP COLUMN IF EXISTS `failed_login_attempts`,
  DROP COLUMN IF EXISTS `locked_until`,
  DROP COLUMN IF EXISTS `reset_token`,
  DROP COLUMN IF EXISTS `reset_expires_at`,
  DROP COLUMN IF EXISTS `status`,
  DROP COLUMN IF EXISTS `invite_token`,
  DROP COLUMN IF EXISTS `invited_at`;
