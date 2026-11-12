-- Rollback 008_asset_extended_fields.sql
DROP INDEX IF EXISTS `idx_assets_org_department` ON `assets`;

ALTER TABLE `assets`
  DROP COLUMN IF EXISTS `specs`,
  DROP COLUMN IF EXISTS `lease_end_date`,
  DROP COLUMN IF EXISTS `ownership_type`,
  DROP COLUMN IF EXISTS `department_name`,
  DROP COLUMN IF EXISTS `department_id`,
  DROP COLUMN IF EXISTS `location_detail`,
  DROP COLUMN IF EXISTS `invoice_number`,
  DROP COLUMN IF EXISTS `supplier`,
  DROP COLUMN IF EXISTS `manufacturer`;
