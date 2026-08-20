-- AlterTable
ALTER TABLE `Alert` ADD COLUMN `escalationLevel` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `AlertEscalation` (
    `id` VARCHAR(191) NOT NULL,
    `alertId` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `triggeredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `details` JSON NULL,

    INDEX `AlertEscalation_alertId_level_idx`(`alertId`, `level`),
    INDEX `AlertEscalation_triggeredAt_idx`(`triggeredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AlertEscalation` ADD CONSTRAINT `AlertEscalation_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `Alert`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
