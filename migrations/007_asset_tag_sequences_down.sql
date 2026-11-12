-- Rollback 007_asset_tag_sequences.sql
DROP TABLE IF EXISTS `asset_tag_counters`;

ALTER TABLE `organizations`
  DROP COLUMN IF EXISTS `tag_prefix`;
