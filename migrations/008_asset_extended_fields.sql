-- ============================================================================
-- OmniAsset Migration: 008_asset_extended_fields.sql
-- Description: Extra asset record fields.
--   Every device: manufacturer, supplier, invoice/PO number, location within
--   the branch, owning department, ownership type and lease end date.
--   Per device kind: a `specs` JSON document (CPU/RAM for computers, rack
--   position for servers, ...) validated against shared/asset-fields.ts.
-- Additive only: all columns are nullable or defaulted; existing rows are
-- treated as company-owned.
-- ============================================================================

ALTER TABLE `assets`
  ADD COLUMN IF NOT EXISTS `manufacturer` VARCHAR(128) DEFAULT NULL AFTER `model`,
  ADD COLUMN IF NOT EXISTS `supplier` VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `invoice_number` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `location_detail` VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `department_id` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `department_name` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `ownership_type` ENUM('OWNED', 'LEASED', 'PERSONAL') NOT NULL DEFAULT 'OWNED',
  ADD COLUMN IF NOT EXISTS `lease_end_date` DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `specs` JSON DEFAULT NULL;

CREATE INDEX IF NOT EXISTS `idx_assets_org_department` ON `assets` (`org_id`, `department_id`);
