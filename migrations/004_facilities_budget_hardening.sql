-- Migration 004: Facilities & Budget Hardening
-- Adds unique constraints to prevent duplicate departments and budgets per org
-- Adds soft-delete archived_at columns to branches and departments

-- 1. Departments unique constraint and archived_at
ALTER TABLE `departments`
  ADD COLUMN IF NOT EXISTS `archived_at` TIMESTAMP NULL DEFAULT NULL;

-- Safe duplicate department cleanup before creating unique index
DELETE d1 FROM `departments` d1
INNER JOIN `departments` d2 
WHERE d1.id > d2.id AND d1.org_id = d2.org_id AND d1.name = d2.name;

CREATE UNIQUE INDEX IF NOT EXISTS `uq_org_dept_name` ON `departments` (`org_id`, `name`);

-- 2. Budgets unique constraint
-- Safe duplicate budget cleanup before creating unique index
DELETE b1 FROM `budgets` b1
INNER JOIN `budgets` b2
WHERE b1.id > b2.id 
  AND b1.org_id = b2.org_id 
  AND b1.department_name = b2.department_name 
  AND b1.branch_name = b2.branch_name 
  AND b1.fiscal_year = b2.fiscal_year;

CREATE UNIQUE INDEX IF NOT EXISTS `uq_org_budget` ON `budgets` (`org_id`, `department_name`, `branch_name`, `fiscal_year`);

-- 3. Branches archived_at
ALTER TABLE `branches`
  ADD COLUMN IF NOT EXISTS `archived_at` TIMESTAMP NULL DEFAULT NULL;
