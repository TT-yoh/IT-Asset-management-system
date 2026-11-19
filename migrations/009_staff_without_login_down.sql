-- Reverts 009_staff_without_login.sql. Fails if any user row has no email:
-- give those staff an address (or remove them) before rolling back.
ALTER TABLE `users` MODIFY COLUMN `email` VARCHAR(255) NOT NULL;
