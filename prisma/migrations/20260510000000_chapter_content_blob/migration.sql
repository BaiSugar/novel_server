-- Change chapter content storage from plaintext LONGTEXT to encrypted compressed LONGBLOB.
ALTER TABLE `novel_chapters` MODIFY `content` LONGBLOB NULL;