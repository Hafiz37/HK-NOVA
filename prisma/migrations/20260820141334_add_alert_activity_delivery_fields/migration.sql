-- AlterTable
ALTER TABLE `Alert` ADD COLUMN `assigneeId` VARCHAR(191) NULL,
    ADD COLUMN `firstTriggeredAt` DATETIME(3) NULL,
    ADD COLUMN `note` TEXT NULL,
    ADD COLUMN `valueSnapshot` JSON NULL,
    MODIFY `type` ENUM('DEVICE_DOWN', 'DEVICE_UP', 'HIGH_UTILIZATION', 'ANOMALY_DETECTED', 'BACKUP_FAILED', 'PROVISIONING_FAILED', 'CUSTOM_OID_OUT_OF_RANGE') NOT NULL;

-- CreateTable
CREATE TABLE `AlertActivity` (
    `id` VARCHAR(191) NOT NULL,
    `alertId` VARCHAR(191) NOT NULL,
    `action` ENUM('CREATED', 'ACKNOWLEDGED', 'RESOLVED', 'ASSIGNED', 'NOTE_ADDED', 'ESCALATED', 'REOPENED') NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `actorName` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `details` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AlertActivity_alertId_createdAt_idx`(`alertId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AlertDelivery` (
    `id` VARCHAR(191) NOT NULL,
    `alertId` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,
    `sentAt` DATETIME(3) NULL,
    `nextRetryAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AlertDelivery_alertId_status_idx`(`alertId`, `status`),
    INDEX `AlertDelivery_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertActivity` ADD CONSTRAINT `AlertActivity_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `Alert`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlertDelivery` ADD CONSTRAINT `AlertDelivery_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `Alert`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
