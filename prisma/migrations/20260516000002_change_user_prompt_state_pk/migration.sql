-- Drop foreign key first (FK depends on the PK)
ALTER TABLE `user_prompt_states` DROP FOREIGN KEY `user_prompt_states_user_id_fkey`;

-- Drop old single-column primary key
ALTER TABLE `user_prompt_states` DROP PRIMARY KEY;

-- Change categoryId to NOT NULL (it's part of the composite PK)
ALTER TABLE `user_prompt_states` MODIFY COLUMN `category_id` INTEGER NOT NULL;

-- Add composite primary key
ALTER TABLE `user_prompt_states` ADD PRIMARY KEY (`user_id`, `category_id`);

-- Re-add foreign key
ALTER TABLE `user_prompt_states` ADD CONSTRAINT `user_prompt_states_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;