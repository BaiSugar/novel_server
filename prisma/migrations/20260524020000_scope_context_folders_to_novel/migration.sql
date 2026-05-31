-- AlterTable
ALTER TABLE `context_folders` ADD COLUMN `novel_id` INTEGER NULL;

-- Backfill existing folders to the first active novel of the same user when possible.
UPDATE `context_folders` AS `cf`
JOIN (
    SELECT `user_id`, MIN(`id`) AS `novel_id`
    FROM `novel_books`
    WHERE `is_trash` = false
    GROUP BY `user_id`
) AS `nb` ON `nb`.`user_id` = `cf`.`user_id`
SET `cf`.`novel_id` = `nb`.`novel_id`
WHERE `cf`.`novel_id` IS NULL;

-- Remove orphan folders that cannot be assigned to a work.
DELETE FROM `context_folders` WHERE `novel_id` IS NULL;

-- AlterTable
ALTER TABLE `context_folders` MODIFY `novel_id` INTEGER NOT NULL;

-- CreateIndex before dropping the old one because source_id FK needs a supporting index.
CREATE INDEX `context_folders_scope_idx` ON `context_folders`(`user_id`, `novel_id`, `source_id`, `parent_id`, `sort_order`);

-- Drop old scope index after the replacement index exists.
DROP INDEX `context_folders_user_id_source_id_parent_id_sort_order_idx` ON `context_folders`;

-- CreateIndex
CREATE INDEX `context_folders_novel_id_idx` ON `context_folders`(`novel_id`);

-- Drop obsolete ContextItem global index; field remains internal compatibility data.
DROP INDEX `context_items_user_id_is_global_is_deleted_idx` ON `context_items`;

-- AddForeignKey
ALTER TABLE `context_folders` ADD CONSTRAINT `context_folders_novel_id_fkey` FOREIGN KEY (`novel_id`) REFERENCES `novel_books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;