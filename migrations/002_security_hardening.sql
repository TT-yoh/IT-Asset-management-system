-- ============================================================================
-- OmniAsset Migration: 002_security_hardening.sql
-- Description: Security hardening, integrity constraints, cryptographic audit
--              chaining, generated unique keys, and separation of duties.
-- ============================================================================

-- 1. Users Security & Lifecycle Extensions
ALTER TABLE `users`
  MODIFY COLUMN `status` ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS `invite_token_hash` VARCHAR(255) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `invited_at` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `invite_expires_at` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `reset_token_hash` VARCHAR(255) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `reset_expires_at` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `version` INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `token_version` INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `is_super_admin` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `password_changed_at` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `two_factor_secret_enc` VARCHAR(255) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `totp_last_step` BIGINT NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `failed_login_attempts` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `locked_until` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `invite_token` VARCHAR(128) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `reset_token` VARCHAR(128) NULL DEFAULT NULL;

-- Ensure email uniqueness across users
CREATE UNIQUE INDEX IF NOT EXISTS `uq_users_email` ON `users` (`email`);

-- 2. Login Attempts Table (Brute-force & lockout protection)
CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL,
  `ip` VARCHAR(64) NOT NULL,
  `failures` INT NOT NULL DEFAULT 0,
  `locked_until` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_login_attempts_email_ip` (`email`, `ip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Recovery Codes Table (2FA emergency backup codes)
CREATE TABLE IF NOT EXISTS `recovery_codes` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `code_hash` VARCHAR(255) NOT NULL,
  `used` TINYINT(1) NOT NULL DEFAULT 0,
  `used_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_recovery_codes_user` (`user_id`),
  CONSTRAINT `fk_recovery_codes_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Optimistic Locking on Core Master Entities
ALTER TABLE `branches`
  ADD COLUMN IF NOT EXISTS `version` INT NOT NULL DEFAULT 1;

ALTER TABLE `departments`
  ADD COLUMN IF NOT EXISTS `version` INT NOT NULL DEFAULT 1;

ALTER TABLE `budgets`
  ADD COLUMN IF NOT EXISTS `version` INT NOT NULL DEFAULT 1;

-- 5. Assets Hardening (Optimistic locking, org asset code unique, partial unique hardware)
ALTER TABLE `assets`
  ADD COLUMN IF NOT EXISTS `version` INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `clean_serial` VARCHAR(128) GENERATED ALWAYS AS (IF(`serial_number` IS NOT NULL AND TRIM(`serial_number`) != '' AND `status` NOT IN ('DISPOSED', 'DELETED'), TRIM(`serial_number`), NULL)) VIRTUAL,
  ADD COLUMN IF NOT EXISTS `clean_mac` VARCHAR(64) GENERATED ALWAYS AS (IF(`mac_address` IS NOT NULL AND TRIM(`mac_address`) != '' AND `status` NOT IN ('DISPOSED', 'DELETED'), TRIM(`mac_address`), NULL)) VIRTUAL,
  ADD COLUMN IF NOT EXISTS `clean_imei` VARCHAR(64) GENERATED ALWAYS AS (IF(`imei_number` IS NOT NULL AND TRIM(`imei_number`) != '' AND `status` NOT IN ('DISPOSED', 'DELETED'), TRIM(`imei_number`), NULL)) VIRTUAL;

CREATE UNIQUE INDEX IF NOT EXISTS `uq_assets_org_code` ON `assets` (`org_id`, `asset_code`);
CREATE UNIQUE INDEX IF NOT EXISTS `uq_assets_org_clean_serial` ON `assets` (`org_id`, `clean_serial`);
CREATE UNIQUE INDEX IF NOT EXISTS `uq_assets_org_clean_mac` ON `assets` (`org_id`, `clean_mac`);
CREATE UNIQUE INDEX IF NOT EXISTS `uq_assets_org_clean_imei` ON `assets` (`org_id`, `clean_imei`);
CREATE INDEX IF NOT EXISTS `idx_assets_org_branch_status` ON `assets` (`org_id`, `branch_id`, `status`);

-- 6. Maintenances Hardening (Multi-tenancy org/branch scoping, versioning, reporting user, RESTRICT FK)
ALTER TABLE `maintenances`
  ADD COLUMN IF NOT EXISTS `org_id` VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS `branch_id` VARCHAR(64) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `version` INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `reported_by_user_id` VARCHAR(64) NULL DEFAULT NULL;

CREATE INDEX IF NOT EXISTS `idx_maintenances_org_branch` ON `maintenances` (`org_id`, `branch_id`);

-- Drop legacy cascading FK if present and apply ON DELETE RESTRICT
-- Assets cannot be deleted if active maintenance tickets exist
ALTER TABLE `maintenances`
  DROP FOREIGN KEY `fk_maintenances_asset`;

ALTER TABLE `maintenances`
  ADD CONSTRAINT `fk_maintenances_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE RESTRICT;

-- 7. Checkouts Hardening (Single active checkout per asset, org/branch scoping, versioning, RESTRICT FK)
ALTER TABLE `checkouts`
  ADD COLUMN IF NOT EXISTS `org_id` VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS `branch_id` VARCHAR(64) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `version` INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `active_asset_id` VARCHAR(64) GENERATED ALWAYS AS (IF(`status` = 'ACTIVE', `asset_id`, NULL)) VIRTUAL;

CREATE INDEX IF NOT EXISTS `idx_checkouts_org_branch` ON `checkouts` (`org_id`, `branch_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `uq_checkouts_active_asset` ON `checkouts` (`active_asset_id`);

-- Drop legacy cascading FK if present and apply ON DELETE RESTRICT
-- Custody history must never be destroyed by deleting an asset
ALTER TABLE `checkouts`
  DROP FOREIGN KEY `fk_checkouts_asset`;

ALTER TABLE `checkouts`
  ADD CONSTRAINT `fk_checkouts_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE RESTRICT;

-- 8. Audit Ledger Hardening (Sequential ordering, actor/request tracking, tamper-detection hash chain)
ALTER TABLE `audit_logs`
  ADD COLUMN IF NOT EXISTS `seq` BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `actor_id` VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS `actor_user_id` VARCHAR(64) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `entity_id` VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS `request_id` VARCHAR(64) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `prev_hash` VARCHAR(64) NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
  ADD COLUMN IF NOT EXISTS `hash` VARCHAR(64) NOT NULL DEFAULT '';

-- Backfill existing rows with unique sequence numbers per organization before applying unique index
UPDATE `audit_logs` a
JOIN (
  SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `org_id` ORDER BY `timestamp` ASC, `id` ASC) as `new_seq`
  FROM `audit_logs`
) ranked ON a.id = ranked.id
SET a.seq = ranked.new_seq;

CREATE UNIQUE INDEX IF NOT EXISTS `uq_audit_org_seq` ON `audit_logs` (`org_id`, `seq`);

-- Drop legacy cascading FK on audit_logs and enforce ON DELETE RESTRICT
-- Organizations must never cascade-delete audit ledger history
ALTER TABLE `audit_logs`
  DROP FOREIGN KEY `fk_audit_org`;

ALTER TABLE `audit_logs`
  ADD CONSTRAINT `fk_audit_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT;

-- 9. Per-Org Audit Chain Heads Table (Row-level serialization and tamper-proofing)
CREATE TABLE IF NOT EXISTS `audit_chain_heads` (
  `org_id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `last_seq` BIGINT NOT NULL DEFAULT 0,
  `last_hash` VARCHAR(64) NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_audit_chain_heads_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Idempotency Keys (v1 and v2 for offline sync, duplicate suppression, replay protection)
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

CREATE TABLE IF NOT EXISTS `idempotency_keys_v2` (
  `key` VARCHAR(128) NOT NULL,
  `org_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) DEFAULT NULL,
  `request_path` VARCHAR(255) NOT NULL,
  `request_hash` VARCHAR(64) NOT NULL,
  `status` ENUM('PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PROCESSING',
  `response_status` INT DEFAULT NULL,
  `response_body` MEDIUMTEXT DEFAULT NULL,
  `response_headers` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` TIMESTAMP NOT NULL,
  PRIMARY KEY (`key`, `org_id`),
  INDEX `idx_idemp_v2_org_created` (`org_id`, `created_at`),
  INDEX `idx_idemp_v2_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
