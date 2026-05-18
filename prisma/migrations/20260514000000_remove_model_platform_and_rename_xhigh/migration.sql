-- Rename enum value XHIGH to XHI
ALTER TABLE `ai_model_definitions` MODIFY COLUMN `reasoning_effort` ENUM('NONE', 'LOW', 'MEDIUM', 'HIGH', 'XHI') NOT NULL DEFAULT 'NONE';

-- Drop indexes referencing platform column
DROP INDEX `ai_model_definitions_platform_identifier_key` ON `ai_model_definitions`;
DROP INDEX `ai_model_definitions_platform_enabled_idx` ON `ai_model_definitions`;

-- Drop platform and endpoint columns
ALTER TABLE `ai_model_definitions` DROP COLUMN `platform`;
ALTER TABLE `ai_model_definitions` DROP COLUMN `endpoint`;