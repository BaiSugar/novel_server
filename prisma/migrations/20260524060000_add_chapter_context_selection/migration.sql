-- Drop foreign keys that reference the primary key
ALTER TABLE `ai_context_selection_states` DROP FOREIGN KEY `ai_context_selection_states_user_id_fkey`;
ALTER TABLE `ai_context_selection_states` DROP FOREIGN KEY `ai_context_selection_states_novel_id_fkey`;
ALTER TABLE `ai_context_selection_states` DROP FOREIGN KEY `ai_context_selection_states_source_id_fkey`;

-- DropPrimaryKey
ALTER TABLE `ai_context_selection_states` DROP PRIMARY KEY;

-- AlterTable: add chapter_id column
ALTER TABLE `ai_context_selection_states` ADD COLUMN `chapter_id` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `ai_context_selection_states_chapter_id_idx` ON `ai_context_selection_states`(`chapter_id`);

-- AddPrimaryKey with new composite key
ALTER TABLE `ai_context_selection_states` ADD PRIMARY KEY (`user_id`, `novel_id`, `chapter_id`, `source_id`);

-- Re-add foreign keys
ALTER TABLE `ai_context_selection_states` ADD CONSTRAINT `ai_context_selection_states_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ai_context_selection_states` ADD CONSTRAINT `ai_context_selection_states_novel_id_fkey` FOREIGN KEY (`novel_id`) REFERENCES `novel_books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ai_context_selection_states` ADD CONSTRAINT `ai_context_selection_states_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `context_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;