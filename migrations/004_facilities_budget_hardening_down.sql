-- Rollback Migration 004
ALTER TABLE `budgets` DROP INDEX IF EXISTS `uq_org_budget`;
ALTER TABLE `departments` DROP INDEX IF EXISTS `uq_org_dept_name`;
ALTER TABLE `departments` DROP COLUMN IF EXISTS `archived_at`;
ALTER TABLE `branches` DROP COLUMN IF EXISTS `archived_at`;
