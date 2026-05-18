-- Drop prompt columns from user_model_states
ALTER TABLE `user_model_states` DROP COLUMN `prompt_template_id`;
ALTER TABLE `user_model_states` DROP COLUMN `category_id`;

-- CreateTable
CREATE TABLE `user_prompt_states` (
    `user_id` INTEGER NOT NULL,
    `prompt_template_id` INTEGER NULL,
    `category_id` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT `user_prompt_states_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;