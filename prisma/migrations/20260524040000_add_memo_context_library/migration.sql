-- AlterTable
ALTER TABLE `context_folders` MODIFY `novel_id` INTEGER NULL;

-- Seed memo ContextSource
INSERT INTO `context_sources` (`name`, `key`, `description`, `field_schema`, `render_template`, `enabled`, `sort_order`, `created_at`, `updated_at`)
VALUES
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