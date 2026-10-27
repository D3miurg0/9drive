-- Security: add user roles. Only admins may manage global/system settings.
ALTER TABLE `users` ADD COLUMN `role` VARCHAR(32) NOT NULL DEFAULT 'user';

-- Promote the oldest existing account (the instance owner) to admin.
UPDATE `users` SET `role` = 'admin' ORDER BY `created_at` ASC LIMIT 1;
