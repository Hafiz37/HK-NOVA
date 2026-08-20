-- AlterTable
ALTER TABLE `Metric` ADD COLUMN `customOidData` JSON NULL,
    ADD COLUMN `isIPv6` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `jitter` DOUBLE NULL,
    ADD COLUMN `rttMax` DOUBLE NULL,
    ADD COLUMN `rttMin` DOUBLE NULL;

-- CreateTable
CREATE TABLE `CustomOid` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `oid` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `alertHigh` DOUBLE NULL,
    `alertLow` DOUBLE NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CustomOid_deviceId_idx`(`deviceId`),
    INDEX `CustomOid_enabled_idx`(`enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeviceThreshold` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `metric` VARCHAR(191) NOT NULL,
    `dynamicHigh` DOUBLE NULL,
    `dynamicLow` DOUBLE NULL,
    `baselineMean` DOUBLE NULL,
    `baselineStddev` DOUBLE NULL,
    `sampleCount` INTEGER NOT NULL DEFAULT 0,
    `manualHigh` DOUBLE NULL,
    `manualLow` DOUBLE NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DeviceThreshold_deviceId_idx`(`deviceId`),
    INDEX `DeviceThreshold_computedAt_idx`(`computedAt`),
    UNIQUE INDEX `DeviceThreshold_deviceId_metric_key`(`deviceId`, `metric`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CustomOid` ADD CONSTRAINT `CustomOid_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeviceThreshold` ADD CONSTRAINT `DeviceThreshold_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
