-- ============================================================================
-- OmniAsset Migration: 009_staff_without_login.sql
-- Description: Staff who hold assets but never sign in.
--   Only IT and management roles have system access; the USER role is now a
--   staff record (see shared/permissions.ts hasSystemAccess). Such staff may
--   have no email address, so `email` becomes optional. The unique index on
--   `email` still applies to every address that is set (NULLs do not clash).
-- ============================================================================

ALTER TABLE `users` MODIFY COLUMN `email` VARCHAR(255) DEFAULT NULL;
