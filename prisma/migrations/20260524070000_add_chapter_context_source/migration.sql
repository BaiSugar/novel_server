-- Seed chapter ContextSource for AI context selection
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