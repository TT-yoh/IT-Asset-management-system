-- Migration: 005_audit_chain_heads_hmac.sql
-- Description: Rebuild audit chain heads, HMAC v2 verification column, indices, and seed heads

-- 1. Create audit_chain_heads table if not already created
CREATE TABLE IF NOT EXISTS `audit_chain_heads` (
  `org_id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `last_seq` BIGINT NOT NULL DEFAULT 0,
  `last_hash` VARCHAR(64) NOT NULL DEFAULT 'GENESIS',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_audit_chain_heads_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add hash_version column to audit_logs for cryptographic versioning
ALTER TABLE `audit_logs`
  ADD COLUMN IF NOT EXISTS `hash_version` VARCHAR(10) NOT NULL DEFAULT 'v1';

-- 3. Ensure indexing and uniqueness on audit_logs
CREATE UNIQUE INDEX IF NOT EXISTS `uq_audit_org_seq` ON `audit_logs` (`org_id`, `seq`);
CREATE INDEX IF NOT EXISTS `idx_audit_org_timestamp` ON `audit_logs` (`org_id`, `timestamp`);

-- 4. Seed audit_chain_heads from latest audit_logs per organization
INSERT INTO `audit_chain_heads` (`org_id`, `last_seq`, `last_hash`)
  SELECT al.`org_id`, al.`seq`, al.`hash`
  FROM `audit_logs` al
  INNER JOIN (
    SELECT `org_id`, MAX(`seq`) AS `max_seq` FROM `audit_logs` GROUP BY `org_id`
  ) latest ON al.`org_id` = latest.`org_id` AND al.`seq` = latest.`max_seq`
ON DUPLICATE KEY UPDATE
  `last_seq` = VALUES(`last_seq`),
  `last_hash` = VALUES(`last_hash`);

-- 5. Seed audit_chain_heads for organizations with zero logs
INSERT INTO `audit_chain_heads` (`org_id`, `last_seq`, `last_hash`)
  SELECT o.`id`, 0, 'GENESIS'
  FROM `organizations` o
  LEFT JOIN `audit_chain_heads` ach ON o.`id` = ach.`org_id`
  WHERE ach.`org_id` IS NULL
ON DUPLICATE KEY UPDATE `org_id` = `org_id`;
