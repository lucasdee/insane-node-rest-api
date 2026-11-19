-- AlterTable
-- Added as nullable first: tokens issued before families existed each become
-- their own family. A plain NOT NULL column would give them all the same empty
-- familyId, and reusing any one of them would revoke all of them.
ALTER TABLE `refresh_tokens` ADD COLUMN `familyId` CHAR(36) NULL;

UPDATE `refresh_tokens` SET `familyId` = UUID();

ALTER TABLE `refresh_tokens` MODIFY `familyId` CHAR(36) NOT NULL;

-- CreateIndex
CREATE INDEX `refresh_tokens_familyId_idx` ON `refresh_tokens`(`familyId`);
