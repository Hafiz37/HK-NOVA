-- AlterTable
ALTER TABLE `ProvisioningLog` ADD COLUMN `isRollback` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `rollbackLogId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `ProvisioningLog_rollbackLogId_idx` ON `ProvisioningLog`(`rollbackLogId`);

-- AddForeignKey
ALTER TABLE `ProvisioningLog` ADD CONSTRAINT `ProvisioningLog_rollbackLogId_fkey` FOREIGN KEY (`rollbackLogId`) REFERENCES `ProvisioningLog`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
