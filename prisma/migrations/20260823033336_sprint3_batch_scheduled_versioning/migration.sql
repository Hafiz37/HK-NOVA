-- CreateTable
CREATE TABLE `BatchProvisioning` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `action` ENUM('CREATE', 'SUSPEND', 'REACTIVATE', 'TERMINATE', 'STATUS_CHECK') NOT NULL,
    `templateName` VARCHAR(191) NULL,
    `items` JSON NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL') NOT NULL DEFAULT 'PENDING',
    `totalItems` INTEGER NOT NULL,
    `successCount` INTEGER NOT NULL DEFAULT 0,
    `failedCount` INTEGER NOT NULL DEFAULT 0,
    `continueOnError` BOOLEAN NOT NULL DEFAULT true,
    `parallelExecution` BOOLEAN NOT NULL DEFAULT false,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `metadata` JSON NULL,

    INDEX `BatchProvisioning_deviceId_createdAt_idx`(`deviceId`, `createdAt`),
    INDEX `BatchProvisioning_status_idx`(`status`),
    INDEX `BatchProvisioning_createdBy_idx`(`createdBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduledProvisioning` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `action` ENUM('CREATE', 'SUSPEND', 'REACTIVATE', 'TERMINATE', 'STATUS_CHECK') NOT NULL,
    `templateName` VARCHAR(191) NULL,
    `fields` JSON NOT NULL,
    `scheduledAt` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'EXECUTED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `executedAt` DATETIME(3) NULL,
    `logId` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ScheduledProvisioning_logId_key`(`logId`),
    INDEX `ScheduledProvisioning_scheduledAt_status_idx`(`scheduledAt`, `status`),
    INDEX `ScheduledProvisioning_deviceId_idx`(`deviceId`),
    INDEX `ScheduledProvisioning_createdBy_idx`(`createdBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OltTemplateVersion` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `version` VARCHAR(191) NOT NULL,
    `content` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `changelog` TEXT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OltTemplateVersion_name_isActive_idx`(`name`, `isActive`),
    UNIQUE INDEX `OltTemplateVersion_name_version_key`(`name`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BatchProvisioning` ADD CONSTRAINT `BatchProvisioning_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledProvisioning` ADD CONSTRAINT `ScheduledProvisioning_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledProvisioning` ADD CONSTRAINT `ScheduledProvisioning_logId_fkey` FOREIGN KEY (`logId`) REFERENCES `ProvisioningLog`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
