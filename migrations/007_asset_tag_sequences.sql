-- ============================================================================
-- OmniAsset Migration: 007_asset_tag_sequences.sql
-- Description: Server-issued sequential asset tags (ORG-CAT-00001).
--   1. organizations.tag_prefix: optional short prefix chosen per organization
--      (when NULL the server derives one from the organization name).
--   2. asset_tag_counters: last issued running number per organization and
--      category code. Rows are locked while a number is issued so two people
--      can never receive the same tag.
-- Additive only: existing asset tags are not changed.
-- ============================================================================

ALTER TABLE `organizations`
  ADD COLUMN IF NOT EXISTS `tag_prefix` VARCHAR(8) DEFAULT NULL AFTER `name`;

CREATE TABLE IF NOT EXISTS `asset_tag_counters` (
  `org_id` VARCHAR(64) NOT NULL,
  `category_code` VARCHAR(8) NOT NULL,
  `last_seq` INT NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`org_id`, `category_code`),
  CONSTRAINT `fk_asset_tag_counters_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
