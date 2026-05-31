-- Create novel book/chapter tables. Chapter content is stored as encrypted compressed LONGBLOB.
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

ALTER TABLE `novel_books` ADD CONSTRAINT `novel_books_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `novel_chapters` ADD CONSTRAINT `novel_chapters_book_id_fkey` FOREIGN KEY (`book_id`) REFERENCES `novel_books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;