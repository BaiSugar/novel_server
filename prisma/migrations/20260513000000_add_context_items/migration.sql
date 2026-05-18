-- AlterTable
ALTER TABLE `ai_generation_jobs` ADD COLUMN `context_item_ids` JSON NULL;

-- CreateTable
CREATE TABLE `context_sources` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(64) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `description` VARCHAR(500) NULL,
    `field_schema` JSON NULL,
    `render_template` TEXT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `context_sources_key_key`(`key`),
    INDEX `context_sources_enabled_sort_order_idx`(`enabled`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `context_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `source_id` INTEGER NOT NULL,
    `title` VARCHAR(128) NOT NULL,
    `summary` VARCHAR(500) NULL,
    `data` JSON NULL,
    `rendered_text` TEXT NOT NULL,
    `is_global` BOOLEAN NOT NULL DEFAULT false,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `context_items_user_id_source_id_is_deleted_idx`(`user_id`, `source_id`, `is_deleted`),
    INDEX `context_items_user_id_is_global_is_deleted_idx`(`user_id`, `is_global`, `is_deleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `novel_context_bindings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `novel_id` INTEGER NOT NULL,
    `context_item_id` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `novel_context_bindings_novel_id_context_item_id_key`(`novel_id`, `context_item_id`),
    INDEX `novel_context_bindings_user_id_novel_id_enabled_sort_order_idx`(`user_id`, `novel_id`, `enabled`, `sort_order`),
    INDEX `novel_context_bindings_context_item_id_idx`(`context_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `context_items` ADD CONSTRAINT `context_items_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `context_items` ADD CONSTRAINT `context_items_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `context_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `novel_context_bindings` ADD CONSTRAINT `novel_context_bindings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `novel_context_bindings` ADD CONSTRAINT `novel_context_bindings_novel_id_fkey` FOREIGN KEY (`novel_id`) REFERENCES `novel_books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `novel_context_bindings` ADD CONSTRAINT `novel_context_bindings_context_item_id_fkey` FOREIGN KEY (`context_item_id`) REFERENCES `context_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;