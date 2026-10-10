-- ============================================================================
-- Migration: 001_phase2_auth_and_schema.sql
-- Description: Adds account lockout, password reset, and invitation tracking
--              to users table for strict server-side authentication.
-- ============================================================================

USE `it_asset_ledger`;

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `failed_login_attempts` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `locked_until` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `reset_token` VARCHAR(128) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `reset_expires_at` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `status` ENUM('ACTIVE', 'INVITED', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS `invite_token` VARCHAR(128) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `invited_at` TIMESTAMP NULL DEFAULT NULL;

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS `idx_users_invite_token` ON `users` (`invite_token`);
CREATE INDEX IF NOT EXISTS `idx_users_reset_token` ON `users` (`reset_token`);
