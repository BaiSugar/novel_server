-- CreateTable
CREATE TABLE `ai_model_definitions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `identifier` VARCHAR(128) NOT NULL,
    `display_name` VARCHAR(128) NOT NULL,
    `platform` VARCHAR(32) NOT NULL,
    `endpoint` VARCHAR(32) NOT NULL,
    `context_window` INTEGER NOT NULL,
    `max_output_tokens` INTEGER NOT NULL,
    `default_temperature` DECIMAL(3, 2) NOT NULL,
    `reasoning_effort` ENUM('NONE', 'LOW', 'MEDIUM', 'HIGH') NOT NULL DEFAULT 'NONE',
    `extra_params` JSON NULL,
    `capabilities` JSON NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_model_definitions_platform_identifier_key`(`platform`, `identifier`),
    INDEX `ai_model_definitions_platform_enabled_idx`(`platform`, `enabled`),
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

    UNIQUE INDEX `ai_model_account_bindings_model_id_account_id_key`(`model_id`, `account_id`),
    INDEX `ai_model_account_bindings_model_id_priority_idx`(`model_id`, `priority`),
    INDEX `ai_model_account_bindings_account_id_idx`(`account_id`),
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

    UNIQUE INDEX `ai_provider_account_health_model_id_account_id_key`(`model_id`, `account_id`),
    INDEX `ai_provider_account_health_model_id_idx`(`model_id`),
    INDEX `ai_provider_account_health_account_id_idx`(`account_id`),
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
ALTER TABLE `ai_generation_jobs` ADD CONSTRAINT `ai_generation_jobs_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generation_jobs` ADD CONSTRAINT `ai_generation_jobs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_messages` ADD CONSTRAINT `ai_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_messages` ADD CONSTRAINT `ai_messages_parent_message_id_fkey` FOREIGN KEY (`parent_message_id`) REFERENCES `ai_messages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_messages` ADD CONSTRAINT `ai_messages_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `ai_generation_jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_image_generation_jobs` ADD CONSTRAINT `ai_image_generation_jobs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;