-- CreateTable
CREATE TABLE `prompt_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `preset_options` JSON NULL,
    `description` TEXT NULL,
    `privacy` ENUM('PRIVATE', 'SHARED', 'AUTHORIZED') NOT NULL DEFAULT 'PRIVATE',
    `usage_guide` VARCHAR(500) NULL,
    `is_approved` BOOLEAN NOT NULL DEFAULT false,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `prompt_templates_user_id_idx`(`user_id`),
    INDEX `prompt_templates_privacy_idx`(`privacy`),
    INDEX `prompt_templates_is_approved_idx`(`is_approved`),
    INDEX `prompt_templates_is_deleted_idx`(`is_deleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prompt_template_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prompt_template_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `preset_options` JSON NULL,
    `description` TEXT NULL,
    `usage_guide` VARCHAR(500) NULL,
    `change_note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `prompt_template_versions_prompt_template_id_version_idx`(`prompt_template_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `prompt_templates` ADD CONSTRAINT `prompt_templates_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_template_versions` ADD CONSTRAINT `prompt_template_versions_prompt_template_id_fkey` FOREIGN KEY (`prompt_template_id`) REFERENCES `prompt_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;