-- AlterTable
ALTER TABLE `Alert` ADD COLUMN `correlationKey` VARCHAR(191) NULL,
    ADD COLUMN `dedupKey` VARCHAR(191) NULL,
    ADD COLUMN `parentId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Alert_dedupKey_idx` ON `Alert`(`dedupKey`);

-- CreateIndex
CREATE INDEX `Alert_correlationKey_idx` ON `Alert`(`correlationKey`);

-- CreateIndex
CREATE INDEX `Alert_parentId_idx` ON `Alert`(`parentId`);

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Alert`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
