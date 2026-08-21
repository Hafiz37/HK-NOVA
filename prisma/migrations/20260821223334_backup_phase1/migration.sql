-- AlterTable
ALTER TABLE `Alert` MODIFY `type` ENUM('DEVICE_DOWN', 'DEVICE_UP', 'HIGH_UTILIZATION', 'ANOMALY_DETECTED', 'BACKUP_FAILED', 'PROVISIONING_FAILED', 'CUSTOM_OID_OUT_OF_RANGE', 'RULE_BREACH', 'HIGH_CPU', 'HIGH_MEMORY', 'INTERFACE_DOWN', 'INTERFACE_ERRORS') NOT NULL;

-- AlterTable
ALTER TABLE `Backup` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `changesSummary` JSON NULL,
    ADD COLUMN `compressedBytes` INTEGER NULL,
    ADD COLUMN `criticalChanges` JSON NULL,
    ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `durationMs` INTEGER NULL,
    ADD COLUMN `filePath` VARCHAR(191) NULL,
    ADD COLUMN `isCompressed` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `isEncrypted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `isProtected` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `riskScore` DOUBLE NULL,
    ADD COLUMN `sizeBytes` INTEGER NULL,
    ADD COLUMN `sshConnectMs` INTEGER NULL,
    ADD COLUMN `storageLocation` VARCHAR(191) NOT NULL DEFAULT 'database',
    MODIFY `configContent` MEDIUMBLOB NULL;

-- AlterTable
ALTER TABLE `Device` ADD COLUMN `backupEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `backupPriority` INTEGER NOT NULL DEFAULT 50,
    ADD COLUMN `backupRetentionDays` INTEGER NULL,
    ADD COLUMN `backupSchedule` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `BackupRestore` (
    `id` VARCHAR(191) NOT NULL,
    `backupId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `restoredBy` VARCHAR(191) NOT NULL,
    `restoredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('SUCCESS', 'FAILED', 'PENDING') NOT NULL,
    `dryRun` BOOLEAN NOT NULL DEFAULT false,
    `preRestoreBackupId` VARCHAR(191) NULL,
    `command` TEXT NOT NULL,
    `response` TEXT NULL,
    `errorMessage` TEXT NULL,
    `durationMs` INTEGER NULL,

    INDEX `BackupRestore_deviceId_restoredAt_idx`(`deviceId`, `restoredAt`),
    INDEX `BackupRestore_backupId_idx`(`backupId`),
    INDEX `BackupRestore_restoredBy_idx`(`restoredBy`),
    INDEX `BackupRestore_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BackupMetrics` (
    `id` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `totalDevices` INTEGER NOT NULL,
    `successCount` INTEGER NOT NULL,
    `failedCount` INTEGER NOT NULL,
    `skippedCount` INTEGER NOT NULL,
    `avgDurationMs` INTEGER NOT NULL,
    `maxDurationMs` INTEGER NOT NULL,
    `minDurationMs` INTEGER NOT NULL,
    `dbStorageMB` DOUBLE NOT NULL,
    `filesystemStorageMB` DOUBLE NULL,
    `totalBackupCount` INTEGER NOT NULL,
    `compressionRatio` DOUBLE NULL,
    `criticalChangesCount` INTEGER NOT NULL DEFAULT 0,
    `consecutiveFailures` JSON NULL,

    INDEX `BackupMetrics_timestamp_idx`(`timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Alert_status_createdAt_idx` ON `Alert`(`status`, `createdAt`);

-- CreateIndex
CREATE INDEX `Backup_storageLocation_idx` ON `Backup`(`storageLocation`);

-- CreateIndex
CREATE INDEX `Backup_archivedAt_idx` ON `Backup`(`archivedAt`);

-- CreateIndex
CREATE INDEX `Backup_deletedAt_idx` ON `Backup`(`deletedAt`);

-- CreateIndex
CREATE INDEX `Backup_isProtected_idx` ON `Backup`(`isProtected`);

-- CreateIndex
CREATE INDEX `Backup_riskScore_idx` ON `Backup`(`riskScore`);

-- CreateIndex
CREATE INDEX `Metric_deviceId_metricType_timestamp_idx` ON `Metric`(`deviceId`, `metricType`, `timestamp`);

-- CreateIndex
CREATE INDEX `Metric_timestamp_idx` ON `Metric`(`timestamp`);

-- AddForeignKey
ALTER TABLE `BackupRestore` ADD CONSTRAINT `BackupRestore_backupId_fkey` FOREIGN KEY (`backupId`) REFERENCES `Backup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BackupRestore` ADD CONSTRAINT `BackupRestore_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BackupRestore` ADD CONSTRAINT `BackupRestore_restoredBy_fkey` FOREIGN KEY (`restoredBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
