-- ============================================================================
-- Migration: 003_phase4_concurrency_schema.sql
-- Description: Adds optimistic locking version columns and idempotency key
--              tracking for offline sync and concurrent mutation safety.
-- ============================================================================

USE `it_asset_ledger`;

-- 1. Idempotency Keys table for deduplication of replayed mutations
CREATE TABLE IF NOT EXISTS `idempotency_keys` (
  `key` VARCHAR(128) NOT NULL,
  `org_id` VARCHAR(64) NOT NULL,
  `client_id` VARCHAR(64) NOT NULL,
  `client_seq` BIGINT NOT NULL DEFAULT 1,
  `response_status` INT NOT NULL,
  `response_body` MEDIUMTEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`),
  INDEX `idx_idemp_org_client` (`org_id`, `client_id`, `client_seq`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Optimistic locking version columns across mutable entities
ALTER TABLE `assets`
  ADD COLUMN IF NOT EXISTS `version` INT NOT NULL DEFAULT 1;

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `version` INT NOT NULL DEFAULT 1;

ALTER TABLE `maintenances`
  ADD COLUMN IF NOT EXISTS `version` INT NOT NULL DEFAULT 1;

ALTER TABLE `checkouts`
  ADD COLUMN IF NOT EXISTS `version` INT NOT NULL DEFAULT 1;

ALTER TABLE `budgets`
  ADD COLUMN IF NOT EXISTS `version` INT NOT NULL DEFAULT 1;

ALTER TABLE `branches`
  ADD COLUMN IF NOT EXISTS `version` INT NOT NULL DEFAULT 1;
