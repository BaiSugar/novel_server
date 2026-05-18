-- CreateTable
CREATE TABLE `user_model_states` (
    `user_id` INTEGER NOT NULL,
    `model_id` INTEGER NOT NULL,
    `temperature` DECIMAL(3,2) NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT `user_model_states_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;