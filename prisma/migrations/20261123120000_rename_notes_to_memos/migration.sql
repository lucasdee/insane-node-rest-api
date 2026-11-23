-- DropForeignKey
ALTER TABLE `notes` DROP FOREIGN KEY `notes_authorId_fkey`;

-- DropForeignKey
ALTER TABLE `notes_on_users` DROP FOREIGN KEY `notes_on_users_noteId_fkey`;

-- DropForeignKey
ALTER TABLE `notes_on_users` DROP FOREIGN KEY `notes_on_users_userId_fkey`;

-- DropForeignKey
ALTER TABLE `notes_on_users` DROP FOREIGN KEY `notes_on_users_assignedById_fkey`;

-- DropTable
DROP TABLE `notes`;

-- DropTable
DROP TABLE `notes_on_users`;

-- CreateTable
CREATE TABLE `memos` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `title` VARCHAR(128) NOT NULL,
    `content` TEXT NOT NULL,
    `authorId` INTEGER UNSIGNED NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `memos_uuid_key`(`uuid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `memos_on_users` (
    `memoId` INTEGER UNSIGNED NOT NULL,
    `userId` INTEGER UNSIGNED NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `assignedById` INTEGER UNSIGNED NOT NULL,
    `role` ENUM('USER', 'MOD', 'ADMIN') NOT NULL DEFAULT 'USER',

    PRIMARY KEY (`memoId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `memos` ADD CONSTRAINT `memos_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memos_on_users` ADD CONSTRAINT `memos_on_users_memoId_fkey` FOREIGN KEY (`memoId`) REFERENCES `memos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memos_on_users` ADD CONSTRAINT `memos_on_users_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memos_on_users` ADD CONSTRAINT `memos_on_users_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

