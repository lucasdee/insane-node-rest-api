-- Deleting a memo removes its assignments, as it already removes its tag links.

-- DropForeignKey
ALTER TABLE `memos_on_users` DROP FOREIGN KEY `memos_on_users_memoId_fkey`;

-- AddForeignKey
ALTER TABLE `memos_on_users` ADD CONSTRAINT `memos_on_users_memoId_fkey` FOREIGN KEY (`memoId`) REFERENCES `memos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
