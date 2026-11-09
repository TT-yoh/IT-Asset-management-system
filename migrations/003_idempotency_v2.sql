-- Migration 003: Authoritative Idempotency Keys v2 Architecture
-- Primary Key: (org_id, user_id, idem_key)
-- Atomic claim protocol with lease lock (locked_until) and SHA-256 request payload fingerprinting.

DROP TABLE IF EXISTS `idempotency_keys_v2`;

CREATE TABLE `idempotency_keys_v2` (
  `org_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `idem_key` VARCHAR(128) NOT NULL,
  `method` VARCHAR(10) NOT NULL,
  `route` VARCHAR(255) NOT NULL,
  `request_hash` VARCHAR(64) NOT NULL,
  `state` ENUM('PROCESSING', 'COMPLETED') NOT NULL DEFAULT 'PROCESSING',
  `response_status` INT DEFAULT NULL,
  `response_content_type` VARCHAR(128) DEFAULT NULL,
  `response_body` MEDIUMTEXT DEFAULT NULL,
  `locked_until` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`org_id`, `user_id`, `idem_key`),
  INDEX `idx_idemp_v2_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
