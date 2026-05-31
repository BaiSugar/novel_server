-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(64) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'AUTHOR') NOT NULL DEFAULT 'AUTHOR',
    `status` ENUM('ACTIVE', 'BANNED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
    `token_version` INTEGER NOT NULL DEFAULT 1,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `family` CHAR(36) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_user_id_idx`(`user_id`),
    INDEX `refresh_tokens_family_idx`(`family`),
    INDEX `refresh_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `novel_books` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `type` ENUM('NOVEL', 'SCRIPT') NULL,
    `total_words` INTEGER NOT NULL DEFAULT 0,
    `order` INTEGER NOT NULL DEFAULT 0,
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `is_trash` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `novel_books_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `novel_chapters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `book_id` INTEGER NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `summary` TEXT NULL,
    `content` LONGBLOB NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `word_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `novel_chapters_book_id_idx`(`book_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prompt_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `preset_options` JSON NULL,
    `description` TEXT NULL,
    `privacy` ENUM('PRIVATE', 'SHARED', 'AUTHORIZED') NOT NULL DEFAULT 'PRIVATE',
    `category_id` INTEGER NULL,
    `usage_guide` VARCHAR(500) NULL,
    `is_approved` BOOLEAN NOT NULL DEFAULT false,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `prompt_templates_user_id_idx`(`user_id`),
    INDEX `prompt_templates_privacy_idx`(`privacy`),
    INDEX `prompt_templates_is_approved_idx`(`is_approved`),
    INDEX `prompt_templates_is_deleted_idx`(`is_deleted`),
    INDEX `prompt_templates_category_id_idx`(`category_id`),
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

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('PROMPT') NOT NULL DEFAULT 'PROMPT',
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
    `category_id` INTEGER NULL,
    `is_new` BOOLEAN NOT NULL DEFAULT false,
    `order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `creative_tools_category_id_idx`(`category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- Seed context sources
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
),
(
    '备忘录',
    'memo',
    '素材库备忘录，支持全局和作品作用域，可按用户选择注入 AI 上下文。',
    JSON_ARRAY(
        JSON_OBJECT('key', 'title', 'label', '标题', 'type', 'text', 'required', true, 'maxLength', 128),
        JSON_OBJECT('key', 'content', 'label', '内容', 'type', 'textarea', 'required', true, 'maxLength', 20000),
        JSON_OBJECT('key', 'scope', 'label', '作用域', 'type', 'select', 'required', true, 'options', JSON_ARRAY('GLOBAL', 'NOVEL'))
    ),
    '## 备忘录：{{title}}\n{{content}}',
    true,
    30,
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

-- Seed chapter source
INSERT INTO `context_sources` (`name`, `key`, `description`, `field_schema`, `render_template`, `enabled`, `sort_order`, `created_at`, `updated_at`)
VALUES
(
    '章节',
    'chapter',
    '作品章节，可作为前文按用户选择注入 AI 上下文。',
    NULL,
    NULL,
    true,
    40,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `description` = VALUES(`description`),
    `enabled` = VALUES(`enabled`),
    `sort_order` = VALUES(`sort_order`),
    `updated_at` = CURRENT_TIMESTAMP(3);

-- Seed chapterSummary source
INSERT INTO `context_sources` (`name`, `key`, `description`, `field_schema`, `render_template`, `enabled`, `sort_order`, `created_at`, `updated_at`)
VALUES
(
    '章节概要',
    'chapterSummary',
    '作品章节概要，作为前文按用户选择注入 AI 上下文。',
    NULL,
    NULL,
    true,
    50,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `description` = VALUES(`description`),
    `enabled` = VALUES(`enabled`),
    `sort_order` = VALUES(`sort_order`),
    `updated_at` = CURRENT_TIMESTAMP(3);

-- CreateTable
CREATE TABLE `context_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `source_id` INTEGER NOT NULL,
    `folder_id` INTEGER NULL,
    `title` VARCHAR(128) NOT NULL,
    `summary` VARCHAR(500) NULL,
    `data` JSON NULL,
    `rendered_text` TEXT NOT NULL,
    `is_global` BOOLEAN NOT NULL DEFAULT false,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `context_items_user_id_source_id_is_deleted_idx`(`user_id`, `source_id`, `is_deleted`),
    INDEX `context_items_user_id_source_id_folder_id_is_deleted_idx`(`user_id`, `source_id`, `folder_id`, `is_deleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `context_folders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `novel_id` INTEGER NULL,
    `source_id` INTEGER NOT NULL,
    `parent_id` INTEGER NULL,
    `name` VARCHAR(128) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `context_folders_scope_idx`(`user_id`, `novel_id`, `source_id`, `parent_id`, `sort_order`),
    INDEX `context_folders_novel_id_idx`(`novel_id`),
    INDEX `context_folders_parent_id_idx`(`parent_id`),
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

    INDEX `novel_context_bindings_user_id_novel_id_enabled_sort_order_idx`(`user_id`, `novel_id`, `enabled`, `sort_order`),
    INDEX `novel_context_bindings_context_item_id_idx`(`context_item_id`),
    UNIQUE INDEX `novel_context_bindings_novel_id_context_item_id_key`(`novel_id`, `context_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_model_definitions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `identifier` VARCHAR(128) NOT NULL,
    `display_name` VARCHAR(128) NOT NULL,
    `context_window` INTEGER NOT NULL,
    `max_output_tokens` INTEGER NOT NULL,
    `default_temperature` DECIMAL(3, 2) NOT NULL,
    `reasoning_effort` ENUM('NONE', 'LOW', 'MEDIUM', 'HIGH', 'XHIGH') NOT NULL DEFAULT 'NONE',
    `extra_params` JSON NULL,
    `capabilities` JSON NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_model_definitions_identifier_key`(`identifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_model_slots` (
    `id` INTEGER NOT NULL,
    `display_name` VARCHAR(64) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `tags` JSON NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `failover_strategy` ENUM('SEQUENTIAL', 'ROUND_ROBIN') NOT NULL DEFAULT 'SEQUENTIAL',
    `default_temperature` DECIMAL(3, 2) NULL,
    `bound_model_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_model_slots_enabled_sort_order_idx`(`enabled`, `sort_order`),
    INDEX `ai_model_slots_bound_model_id_idx`(`bound_model_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_provider_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `platform` VARCHAR(32) NOT NULL,
    `label` VARCHAR(64) NOT NULL,
    `base_url` VARCHAR(255) NOT NULL,
    `api_key_encrypted` TEXT NOT NULL,
    `extra_headers` JSON NULL,
    `extra_params` JSON NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `weight` INTEGER NOT NULL DEFAULT 1,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_provider_accounts_platform_enabled_idx`(`platform`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_model_account_bindings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `model_id` INTEGER NOT NULL,
    `account_id` INTEGER NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_model_account_bindings_model_id_priority_idx`(`model_id`, `priority`),
    INDEX `ai_model_account_bindings_account_id_idx`(`account_id`),
    UNIQUE INDEX `ai_model_account_bindings_model_id_account_id_key`(`model_id`, `account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_provider_account_health` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `model_id` INTEGER NOT NULL,
    `account_id` INTEGER NOT NULL,
    `window_size` INTEGER NOT NULL DEFAULT 50,
    `success_count` INTEGER NOT NULL DEFAULT 0,
    `failure_count` INTEGER NOT NULL DEFAULT 0,
    `p95_latency_ms` INTEGER NULL,
    `consecutive_failures` INTEGER NOT NULL DEFAULT 0,
    `circuit_open_until` DATETIME(3) NULL,
    `last_success_at` DATETIME(3) NULL,
    `last_failure_at` DATETIME(3) NULL,
    `last_error_code` VARCHAR(64) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_provider_account_health_model_id_idx`(`model_id`),
    INDEX `ai_provider_account_health_account_id_idx`(`account_id`),
    UNIQUE INDEX `ai_provider_account_health_model_id_account_id_key`(`model_id`, `account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_conversations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `title` VARCHAR(128) NOT NULL DEFAULT '',
    `mode` ENUM('STANDARD', 'AGENT') NOT NULL DEFAULT 'STANDARD',
    `model_id` INTEGER NOT NULL,
    `system_prompt` TEXT NULL,
    `metadata` JSON NULL,
    `status` ENUM('ACTIVE', 'ARCHIVED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
    `message_count` INTEGER NOT NULL DEFAULT 0,
    `last_message_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_conversations_user_id_status_last_message_at_idx`(`user_id`, `status`, `last_message_at`),
    INDEX `ai_conversations_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` INTEGER NOT NULL,
    `parent_message_id` INTEGER NULL,
    `role` ENUM('SYSTEM', 'USER', 'ASSISTANT', 'TOOL') NOT NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'SUPERSEDED', 'FAILED') NOT NULL DEFAULT 'ACTIVE',
    `content` MEDIUMTEXT NOT NULL,
    `content_hash` CHAR(64) NOT NULL,
    `tool_calls` JSON NULL,
    `tool_call_id` VARCHAR(64) NULL,
    `tool_name` VARCHAR(64) NULL,
    `token_usage` JSON NULL,
    `model_id` INTEGER NULL,
    `job_id` INTEGER NULL,
    `seq` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_messages_conversation_id_status_seq_idx`(`conversation_id`, `status`, `seq`),
    INDEX `ai_messages_parent_message_id_status_idx`(`parent_message_id`, `status`),
    INDEX `ai_messages_conversation_id_created_at_idx`(`conversation_id`, `created_at`),
    INDEX `ai_messages_tool_call_id_idx`(`tool_call_id`),
    INDEX `ai_messages_job_id_idx`(`job_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_generation_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `mode` ENUM('STANDARD', 'AGENT') NOT NULL,
    `model_id` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `anchor_message_id` INTEGER NULL,
    `retry_target_id` INTEGER NULL,
    `client_request_id` VARCHAR(64) NULL,
    `iteration_count` INTEGER NOT NULL DEFAULT 0,
    `max_iterations` INTEGER NOT NULL DEFAULT 8,
    `error_code` VARCHAR(64) NULL,
    `error_message` VARCHAR(500) NULL,
    `token_usage` JSON NULL,
    `context_item_ids` JSON NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_generation_jobs_conversation_id_created_at_idx`(`conversation_id`, `created_at`),
    INDEX `ai_generation_jobs_user_id_status_created_at_idx`(`user_id`, `status`, `created_at`),
    INDEX `ai_generation_jobs_conversation_id_client_request_id_idx`(`conversation_id`, `client_request_id`),
    INDEX `ai_generation_jobs_anchor_message_id_idx`(`anchor_message_id`),
    INDEX `ai_generation_jobs_retry_target_id_idx`(`retry_target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_image_generation_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `model_id` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `client_request_id` VARCHAR(64) NULL,
    `prompt` TEXT NOT NULL,
    `prompt_hash` CHAR(64) NOT NULL,
    `metadata` JSON NULL,
    `options` JSON NULL,
    `result` JSON NULL,
    `error_code` VARCHAR(64) NULL,
    `error_message` VARCHAR(500) NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_image_generation_jobs_user_id_status_created_at_idx`(`user_id`, `status`, `created_at`),
    INDEX `ai_image_generation_jobs_user_id_client_request_id_idx`(`user_id`, `client_request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_context_selection_states` (
    `user_id` INTEGER NOT NULL,
    `novel_id` INTEGER NOT NULL,
    `chapter_id` INTEGER NOT NULL DEFAULT 0,
    `source_id` INTEGER NOT NULL,
    `context_item_ids` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_context_selection_states_novel_id_idx`(`novel_id`),
    INDEX `ai_context_selection_states_source_id_idx`(`source_id`),
    INDEX `ai_context_selection_states_chapter_id_idx`(`chapter_id`),
    PRIMARY KEY (`user_id`, `novel_id`, `chapter_id`, `source_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_model_states` (
    `user_id` INTEGER NOT NULL,
    `model_id` INTEGER NOT NULL,
    `temperature` DECIMAL(3, 2) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_prompt_states` (
    `user_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL,
    `prompt_template_id` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`, `category_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_prompt_favorites` (
    `user_id` INTEGER NOT NULL,
    `prompt_template_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_prompt_favorites_user_id_idx`(`user_id`),
    INDEX `user_prompt_favorites_prompt_template_id_idx`(`prompt_template_id`),
    PRIMARY KEY (`user_id`, `prompt_template_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_preferences` (
    `user_id` INTEGER NOT NULL,
    `key` VARCHAR(128) NOT NULL,
    `value` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_preferences_key_idx`(`key`),
    PRIMARY KEY (`user_id`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `novel_books` ADD CONSTRAINT `novel_books_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `novel_chapters` ADD CONSTRAINT `novel_chapters_book_id_fkey` FOREIGN KEY (`book_id`) REFERENCES `novel_books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_templates` ADD CONSTRAINT `prompt_templates_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_templates` ADD CONSTRAINT `prompt_templates_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_template_versions` ADD CONSTRAINT `prompt_template_versions_prompt_template_id_fkey` FOREIGN KEY (`prompt_template_id`) REFERENCES `prompt_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `creative_tools` ADD CONSTRAINT `creative_tools_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `context_items` ADD CONSTRAINT `context_items_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `context_items` ADD CONSTRAINT `context_items_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `context_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `context_items` ADD CONSTRAINT `context_items_folder_id_fkey` FOREIGN KEY (`folder_id`) REFERENCES `context_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `context_folders` ADD CONSTRAINT `context_folders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `context_folders` ADD CONSTRAINT `context_folders_novel_id_fkey` FOREIGN KEY (`novel_id`) REFERENCES `novel_books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `context_folders` ADD CONSTRAINT `context_folders_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `context_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `context_folders` ADD CONSTRAINT `context_folders_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `context_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `novel_context_bindings` ADD CONSTRAINT `novel_context_bindings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `novel_context_bindings` ADD CONSTRAINT `novel_context_bindings_novel_id_fkey` FOREIGN KEY (`novel_id`) REFERENCES `novel_books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `novel_context_bindings` ADD CONSTRAINT `novel_context_bindings_context_item_id_fkey` FOREIGN KEY (`context_item_id`) REFERENCES `context_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_context_selection_states` ADD CONSTRAINT `ai_context_selection_states_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_context_selection_states` ADD CONSTRAINT `ai_context_selection_states_novel_id_fkey` FOREIGN KEY (`novel_id`) REFERENCES `novel_books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_context_selection_states` ADD CONSTRAINT `ai_context_selection_states_source_id_fkey` FOREIGN KEY (`source_id`) REFERENCES `context_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_model_slots` ADD CONSTRAINT `ai_model_slots_bound_model_id_fkey` FOREIGN KEY (`bound_model_id`) REFERENCES `ai_model_definitions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_model_account_bindings` ADD CONSTRAINT `ai_model_account_bindings_model_id_fkey` FOREIGN KEY (`model_id`) REFERENCES `ai_model_definitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_model_account_bindings` ADD CONSTRAINT `ai_model_account_bindings_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `ai_provider_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_provider_account_health` ADD CONSTRAINT `ai_provider_account_health_model_id_fkey` FOREIGN KEY (`model_id`) REFERENCES `ai_model_definitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_provider_account_health` ADD CONSTRAINT `ai_provider_account_health_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `ai_provider_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_conversations` ADD CONSTRAINT `ai_conversations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_messages` ADD CONSTRAINT `ai_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_messages` ADD CONSTRAINT `ai_messages_parent_message_id_fkey` FOREIGN KEY (`parent_message_id`) REFERENCES `ai_messages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_messages` ADD CONSTRAINT `ai_messages_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `ai_generation_jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generation_jobs` ADD CONSTRAINT `ai_generation_jobs_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generation_jobs` ADD CONSTRAINT `ai_generation_jobs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_image_generation_jobs` ADD CONSTRAINT `ai_image_generation_jobs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_model_states` ADD CONSTRAINT `user_model_states_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_prompt_states` ADD CONSTRAINT `user_prompt_states_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_prompt_favorites` ADD CONSTRAINT `user_prompt_favorites_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_prompt_favorites` ADD CONSTRAINT `user_prompt_favorites_prompt_template_id_fkey` FOREIGN KEY (`prompt_template_id`) REFERENCES `prompt_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_preferences` ADD CONSTRAINT `user_preferences_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
