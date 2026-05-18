-- DropForeignKey
ALTER TABLE `creative_tools` DROP FOREIGN KEY `creative_tools_tool_category_id_fkey`;

-- DropForeignKey
ALTER TABLE `creative_tools` DROP FOREIGN KEY `creative_tools_prompt_category_id_fkey`;

-- DropIndex
DROP INDEX `creative_tools_tool_category_id_idx` ON `creative_tools`;

-- DropIndex
DROP INDEX `creative_tools_prompt_category_id_idx` ON `creative_tools`;

-- AlterTable
ALTER TABLE `creative_tools` ADD COLUMN `category_id` INTEGER NULL;

-- DataMigration
UPDATE `creative_tools` SET `category_id` = `prompt_category_id`;

-- AlterTable
ALTER TABLE `creative_tools` DROP COLUMN `tool_category_id`, DROP COLUMN `prompt_category_id`;

-- CreateIndex
CREATE INDEX `creative_tools_category_id_idx` ON `creative_tools`(`category_id`);

-- AddForeignKey
ALTER TABLE `creative_tools` ADD CONSTRAINT `creative_tools_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- DataCleanup
DELETE FROM `categories` WHERE `type` = 'CREATIVE_TOOL';

-- AlterTable
ALTER TABLE `categories` MODIFY `type` ENUM('PROMPT') NOT NULL DEFAULT 'PROMPT';