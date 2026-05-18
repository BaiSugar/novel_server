-- Rename enum value XHI to XHIGH
ALTER TABLE `ai_model_definitions` MODIFY COLUMN `reasoning_effort` ENUM('NONE', 'LOW', 'MEDIUM', 'HIGH', 'XHIGH') NOT NULL DEFAULT 'NONE';