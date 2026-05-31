-- CreateTable
CREATE TABLE `context_folders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `source_id` INTEGER NOT NULL,
    `parent_id` INTEGER NULL,
    `name` VARCHAR(128) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `context_folders_user_id_source_id_parent_id_sort_order_idx`(`user_id`, `source_id`, `parent_id`, `sort_order`),
    INDEX `context_folders_parent_id_idx`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `context_items` ADD COLUMN `folder_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `context_items_user_id_source_id_folder_id_is_deleted_idx` ON `context_items`(`user_id`, `source_id`, `folder_id`, `is_deleted`);

-- AddForeignKey
ALTER TABLE `context_folders` ADD CONSTRAINT `context_folders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `context_folders` ADD CONSTRAINT `context_folders_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `context_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `context_folders` ADD CONSTRAINT `context_folders_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `context_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `context_items` ADD CONSTRAINT `context_items_folder_id_fkey` FOREIGN KEY (`folder_id`) REFERENCES `context_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed ContextSource
INSERT INTO `context_sources` (`name`, `key`, `description`, `field_schema`, `render_template`, `enabled`, `sort_order`, `created_at`, `updated_at`)
VALUES
(
    '角色库',
    'character',
    '作品素材库角色卡，可按用户选择注入 AI 上下文。',
    JSON_ARRAY(
        JSON_OBJECT('key', 'name', 'label', '姓名', 'type', 'text', 'required', true, 'maxLength', 128),
        JSON_OBJECT('key', 'gender', 'label', '性别', 'type', 'text', 'required', false, 'maxLength', 32),
        JSON_OBJECT('key', 'personality', 'label', '角色性格', 'type', 'textarea', 'required', false, 'maxLength', 2000),
        JSON_OBJECT('key', 'background', 'label', '角色设定与背景', 'type', 'textarea', 'required', false, 'maxLength', 4000),
        JSON_OBJECT('key', 'appearance', 'label', '外貌', 'type', 'textarea', 'required', false, 'maxLength', 2000)
    ),
    '## 角色：{{name}}\n- 性别：{{gender}}\n- 性格：{{personality}}\n- 设定与背景：{{background}}\n- 外貌：{{appearance}}',
    true,
    10,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
),
(
    '词条库',
    'glossary',
    '作品素材库设定词条，可按用户选择注入 AI 上下文。',
    JSON_ARRAY(
        JSON_OBJECT('key', 'name', 'label', '词条名称', 'type', 'text', 'required', true, 'maxLength', 128),
        JSON_OBJECT('key', 'definition', 'label', '词条释义', 'type', 'textarea', 'required', true, 'maxLength', 4000)
    ),
    '## 词条：{{name}}\n{{definition}}',
    true,
    20,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `description` = VALUES(`description`),
    `field_schema` = VALUES(`field_schema`),
    `render_template` = VALUES(`render_template`),
    `enabled` = VALUES(`enabled`),
    `sort_order` = VALUES(`sort_order`),
    `updated_at` = CURRENT_TIMESTAMP(3);