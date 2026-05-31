-- CreateTable
CREATE TABLE `user_prompt_favorites` (
    `user_id` INTEGER NOT NULL,
    `prompt_template_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_prompt_favorites_user_id_idx`(`user_id`),
    INDEX `user_prompt_favorites_prompt_template_id_idx`(`prompt_template_id`),
    PRIMARY KEY (`user_id`, `prompt_template_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_prompt_favorites` ADD CONSTRAINT `user_prompt_favorites_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_prompt_favorites` ADD CONSTRAINT `user_prompt_favorites_prompt_template_id_fkey` FOREIGN KEY (`prompt_template_id`) REFERENCES `prompt_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;