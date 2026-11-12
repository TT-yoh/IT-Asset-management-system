-- Rollback 006_cost_source_hardening.sql
ALTER TABLE `assets`
  DROP COLUMN IF EXISTS `cost_source`;

