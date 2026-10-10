-- ============================================================================
-- PingCAP TiDB Cloud Schema: Enterprise Multi-Tenant IT Asset Management
-- Engine: Distributed MySQL 8.0 Wire-Compatible + TiKV (OLTP) + TiFlash (HTAP)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `it_asset_ledger` 
  DEFAULT CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE `it_asset_ledger`;

-- ----------------------------------------------------------------------------
-- 1. Organizations (Multi-Tenant Master Registry)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `organizations` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `type` VARCHAR(64) NOT NULL DEFAULT 'Enterprise',
  `logo` TEXT,
  `branding_color` VARCHAR(32) DEFAULT '#10b981',
  `branches_count` INT NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. Branches (Geographic Hubs & Locations)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `branches` (
  `id` VARCHAR(64) NOT NULL,
  `org_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `location` VARCHAR(255) NOT NULL,
  `city` VARCHAR(128) NOT NULL,
  `country` VARCHAR(128) NOT NULL,
  `manager_name` VARCHAR(128) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_branches_org` (`org_id`),
  UNIQUE KEY `uq_org_branch_code` (`org_id`, `code`),
  CONSTRAINT `fk_branches_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Departments (Cost Centers & Divisions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `departments` (
  `id` VARCHAR(64) NOT NULL,
  `org_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `head_count` INT NOT NULL DEFAULT 0,
  `budget_allocated` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_departments_org` (`org_id`),
  CONSTRAINT `fk_departments_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. Users (Authentication, Multi-Tenant Staff & Roles)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL,
  `org_id` VARCHAR(64) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(255) NOT NULL,
  `role` ENUM('ADMIN', 'DIRECTOR', 'BRANCH_MANAGER', 'IT_SUPPORT', 'FINANCE', 'USER') NOT NULL DEFAULT 'USER',
  `password_hash` VARCHAR(255) DEFAULT NULL,
  `department_id` VARCHAR(64) DEFAULT NULL,
  `department_name` VARCHAR(128) DEFAULT NULL,
  `branch_id` VARCHAR(64) DEFAULT NULL,
  `branch_name` VARCHAR(128) DEFAULT NULL,
  `two_factor_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `avatar` TEXT,
  `two_factor_secret` VARCHAR(64) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_users_org_role` (`org_id`, `role`),
  KEY `idx_users_email` (`email`),
  CONSTRAINT `fk_users_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. Asset Categories (Taxonomy & Depreciation Rules)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `asset_categories` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `icon` VARCHAR(64) DEFAULT NULL,
  `description` TEXT,
  `depreciation_years` INT NOT NULL DEFAULT 3,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. Assets (Hardware Ledger with Serial, MAC, and Financial Tracking)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `assets` (
  `id` VARCHAR(64) NOT NULL,
  `org_id` VARCHAR(64) NOT NULL,
  `branch_id` VARCHAR(64) NOT NULL,
  `branch_name` VARCHAR(128) DEFAULT NULL,
  `category_id` VARCHAR(64) NOT NULL,
  `category_name` VARCHAR(128) DEFAULT NULL,
  `asset_code` VARCHAR(128) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `model` VARCHAR(255) DEFAULT NULL,
  `serial_number` VARCHAR(128) NOT NULL,
  `mac_address` VARCHAR(64) DEFAULT NULL,
  `phone_number` VARCHAR(64) DEFAULT NULL,
  `registered_email` VARCHAR(255) DEFAULT NULL,
  `imei_number` VARCHAR(64) DEFAULT NULL,
  `status` ENUM('ACTIVE', 'DAMAGED', 'REPAIR', 'DEPRECATED', 'SOLD', 'DISPOSED') NOT NULL DEFAULT 'ACTIVE',
  `asset_condition` ENUM('NEW', 'GOOD', 'FAIR', 'POOR') NOT NULL DEFAULT 'GOOD',
  `purchase_date` DATE NOT NULL,
  `purchase_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `warranty_expiry` DATE DEFAULT NULL,
  `current_value` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `assigned_to_user_id` VARCHAR(64) DEFAULT NULL,
  `assigned_to_user_name` VARCHAR(255) DEFAULT NULL,
  `assigned_to_user_avatar` TEXT,
  `assigned_at` TIMESTAMP NULL DEFAULT NULL,
  `image_url` TEXT,
  `notes` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_assets_org_status` (`org_id`, `status`),
  KEY `idx_assets_branch` (`branch_id`),
  KEY `idx_assets_code` (`asset_code`),
  KEY `idx_assets_serial` (`serial_number`),
  KEY `idx_assets_assigned` (`assigned_to_user_id`),
  CONSTRAINT `fk_assets_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. Checkouts (Chain of Custody & Return Logs)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `checkouts` (
  `id` VARCHAR(64) NOT NULL,
  `asset_id` VARCHAR(64) NOT NULL,
  `asset_code` VARCHAR(128) NOT NULL,
  `asset_name` VARCHAR(255) NOT NULL,
  `checked_out_by` VARCHAR(255) NOT NULL,
  `checked_out_to_user_id` VARCHAR(64) NOT NULL,
  `checked_out_to_user_name` VARCHAR(255) NOT NULL,
  `checked_out_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expected_return_date` DATE DEFAULT NULL,
  `checked_in_at` TIMESTAMP NULL DEFAULT NULL,
  `return_condition` ENUM('NEW', 'GOOD', 'FAIR', 'POOR') DEFAULT NULL,
  `damage_reported` TINYINT(1) NOT NULL DEFAULT 0,
  `damage_description` TEXT,
  `reason` VARCHAR(255) DEFAULT NULL,
  `status` ENUM('ACTIVE', 'RETURNED', 'LOST', 'DAMAGED_DURING_CHECKOUT') NOT NULL DEFAULT 'ACTIVE',
  `notes` TEXT,
  PRIMARY KEY (`id`),
  KEY `idx_checkouts_asset` (`asset_id`),
  KEY `idx_checkouts_user` (`checked_out_to_user_id`),
  KEY `idx_checkouts_status` (`status`),
  CONSTRAINT `fk_checkouts_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. Maintenances (Service Tickets & Cost Rollup)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `maintenances` (
  `id` VARCHAR(64) NOT NULL,
  `asset_id` VARCHAR(64) NOT NULL,
  `asset_code` VARCHAR(128) NOT NULL,
  `asset_name` VARCHAR(255) NOT NULL,
  `type` ENUM('REPAIR', 'PREVENTIVE', 'INSPECTION', 'UPGRADE') NOT NULL DEFAULT 'REPAIR',
  `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `priority` ENUM('HIGH', 'MEDIUM', 'LOW') NOT NULL DEFAULT 'MEDIUM',
  `description` TEXT NOT NULL,
  `reported_by` VARCHAR(255) NOT NULL,
  `assigned_technician` VARCHAR(255) NOT NULL,
  `start_date` DATE NOT NULL,
  `expected_completion` DATE NOT NULL,
  `actual_completion` DATE DEFAULT NULL,
  `cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `parts_replaced` TEXT,
  `notes` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_maintenances_asset` (`asset_id`),
  KEY `idx_maintenances_status` (`status`),
  KEY `idx_maintenances_priority` (`priority`),
  CONSTRAINT `fk_maintenances_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. Budgets (Financial Allocations & Real-Time Spend)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `budgets` (
  `id` VARCHAR(64) NOT NULL,
  `org_id` VARCHAR(64) NOT NULL,
  `department_name` VARCHAR(128) NOT NULL,
  `branch_name` VARCHAR(128) NOT NULL,
  `fiscal_year` INT NOT NULL,
  `allocated` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `spent` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_budgets_org_year` (`org_id`, `fiscal_year`),
  CONSTRAINT `fk_budgets_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. Audit Logs (Tamper-Resistant Ledger with IP Tracking)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(64) NOT NULL,
  `org_id` VARCHAR(64) NOT NULL,
  `user_name` VARCHAR(255) NOT NULL,
  `user_role` VARCHAR(64) NOT NULL,
  `action` VARCHAR(128) NOT NULL,
  `entity_type` VARCHAR(64) NOT NULL,
  `entity_name` VARCHAR(255) NOT NULL,
  `changes` TEXT NOT NULL,
  `timestamp` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` VARCHAR(64) NOT NULL DEFAULT '127.0.0.1',
  PRIMARY KEY (`id`),
  KEY `idx_audit_org_time` (`org_id`, `timestamp`),
  CONSTRAINT `fk_audit_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 11. System Notifications (Alerts & Warranty Reminders)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` VARCHAR(64) NOT NULL,
  `org_id` VARCHAR(64) NOT NULL,
  `type` ENUM('WARRANTY', 'MAINTENANCE', 'ALERT', 'ASSIGNMENT') NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `timestamp` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_notif_org_read` (`org_id`, `is_read`),
  CONSTRAINT `fk_notifications_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TiFlash HTAP Real-Time Analytical Columnar Replicas
-- Enables sub-second 3D telemetry, depreciation aggregation, and reporting
-- without locking TiKV OLTP transaction execution.
-- ============================================================================
ALTER TABLE `assets` SET TIFLASH REPLICA 1;
ALTER TABLE `maintenances` SET TIFLASH REPLICA 1;
ALTER TABLE `checkouts` SET TIFLASH REPLICA 1;
ALTER TABLE `budgets` SET TIFLASH REPLICA 1;
ALTER TABLE `audit_logs` SET TIFLASH REPLICA 1;
