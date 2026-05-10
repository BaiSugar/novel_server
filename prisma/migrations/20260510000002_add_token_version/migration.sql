-- AlterTable: add tokenVersion to users
ALTER TABLE `users` ADD COLUMN `token_version` INTEGER NOT NULL DEFAULT 1;