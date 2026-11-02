-- ============================================================================
-- OmniAsset Migration Rollback: 001_initial_schema_down.sql
-- ============================================================================

DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `budgets`;
DROP TABLE IF EXISTS `maintenances`;
DROP TABLE IF EXISTS `checkouts`;
DROP TABLE IF EXISTS `assets`;
DROP TABLE IF EXISTS `asset_categories`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `departments`;
DROP TABLE IF EXISTS `branches`;
DROP TABLE IF EXISTS `organizations`;
