-- AlterTable
ALTER TABLE `Alert` MODIFY `type` ENUM('DEVICE_DOWN', 'DEVICE_UP', 'HIGH_UTILIZATION', 'ANOMALY_DETECTED', 'BACKUP_FAILED', 'PROVISIONING_FAILED', 'CUSTOM_OID_OUT_OF_RANGE', 'RULE_BREACH') NOT NULL;

-- CreateTable
CREATE TABLE `AlertRule` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `metric` VARCHAR(191) NOT NULL,
    `operator` ENUM('GT', 'GTE', 'LT', 'LTE') NOT NULL DEFAULT 'GTE',
    `threshold` DOUBLE NOT NULL,
    `severity` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'HIGH',
    `consecutiveSamples` INTEGER NOT NULL DEFAULT 2,
    `deviceScope` ENUM('ALL', 'DEVICE_TYPE', 'DEVICES') NOT NULL DEFAULT 'ALL',
    `deviceType` ENUM('ROUTER', 'SWITCH', 'OLT', 'ONT', 'FIREWALL', 'SERVER', 'OTHER') NULL,
    `deviceIds` JSON NULL,
    `customOidId` VARCHAR(191) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `cooldownMs` INTEGER NOT NULL DEFAULT 300000,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AlertRule_enabled_idx`(`enabled`),
    INDEX `AlertRule_metric_idx`(`metric`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AlertRule` ADD CONSTRAINT `AlertRule_customOidId_fkey` FOREIGN KEY (`customOidId`) REFERENCES `CustomOid`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
