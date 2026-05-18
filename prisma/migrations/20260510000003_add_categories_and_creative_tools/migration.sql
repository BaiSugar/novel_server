-- AlterTable
ALTER TABLE `prompt_templates` ADD COLUMN `category_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('PROMPT', 'CREATIVE_TOOL') NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `prompt_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `categories_type_order_idx`(`type`, `order`),
    UNIQUE INDEX `categories_type_name_key`(`type`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `creative_tools` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `icon` ENUM('SPARKLES', 'BOOK', 'BADGE', 'FILE', 'LIST', 'TRIANGLE', 'GEM', 'PAPERCLIP', 'USER', 'MASK', 'GLOBE', 'LINES', 'IMAGE') NOT NULL,
    `is_new` BOOLEAN NOT NULL DEFAULT false,
    `tool_category_id` INTEGER NOT NULL,
    `prompt_category_id` INTEGER NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `creative_tools_tool_category_id_idx`(`tool_category_id`),
    INDEX `creative_tools_prompt_category_id_idx`(`prompt_category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `prompt_templates_category_id_idx` ON `prompt_templates`(`category_id`);

-- AddForeignKey
ALTER TABLE `prompt_templates` ADD CONSTRAINT `prompt_templates_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `creative_tools` ADD CONSTRAINT `creative_tools_tool_category_id_fkey` FOREIGN KEY (`tool_category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `creative_tools` ADD CONSTRAINT `creative_tools_prompt_category_id_fkey` FOREIGN KEY (`prompt_category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;