-- ============================================================================
-- Migration: 003_phase4_concurrency_schema_down.sql
-- Description: Rollback script for migration 003
-- ============================================================================

USE `it_asset_ledger`;

DROP TABLE IF EXISTS `idempotency_keys`;

ALTER TABLE `assets` DROP COLUMN IF EXISTS `version`;
ALTER TABLE `users` DROP COLUMN IF EXISTS `version`;
ALTER TABLE `maintenances` DROP COLUMN IF EXISTS `version`;
ALTER TABLE `checkouts` DROP COLUMN IF EXISTS `version`;
ALTER TABLE `budgets` DROP COLUMN IF EXISTS `version`;
ALTER TABLE `branches` DROP COLUMN IF EXISTS `version`;
