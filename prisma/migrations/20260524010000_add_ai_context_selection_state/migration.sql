-- CreateTable
CREATE TABLE `ai_context_selection_states` (
    `user_id` INTEGER NOT NULL,
    `novel_id` INTEGER NOT NULL,
    `source_id` INTEGER NOT NULL,
    `context_item_ids` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_context_selection_states_novel_id_idx`(`novel_id`),
    INDEX `ai_context_selection_states_source_id_idx`(`source_id`),
    PRIMARY KEY (`user_id`, `novel_id`, `source_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_context_selection_states` ADD CONSTRAINT `ai_context_selection_states_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_context_selection_states` ADD CONSTRAINT `ai_context_selection_states_novel_id_fkey` FOREIGN KEY (`novel_id`) REFERENCES `novel_books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_context_selection_states` ADD CONSTRAINT `ai_context_selection_states_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `context_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;