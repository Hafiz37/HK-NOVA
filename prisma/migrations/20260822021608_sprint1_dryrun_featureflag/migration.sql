-- AlterTable
ALTER TABLE `BackupRestore` MODIFY `status` ENUM('SUCCESS', 'FAILED', 'PENDING', 'DRY_RUN') NOT NULL;

-- AlterTable
ALTER TABLE `ProvisioningLog` ADD COLUMN `clientIp` VARCHAR(191) NULL,
    ADD COLUMN `executionMode` ENUM('EXECUTE', 'DRY_RUN', 'SCHEDULED') NOT NULL DEFAULT 'EXECUTE',
    ADD COLUMN `executionTimeMs` INTEGER NULL,
    ADD COLUMN `metadata` JSON NULL,
    ADD COLUMN `templateName` VARCHAR(191) NULL,
    ADD COLUMN `templateVersion` VARCHAR(191) NULL,
    ADD COLUMN `userAgent` VARCHAR(191) NULL,
    MODIFY `status` ENUM('SUCCESS', 'FAILED', 'PENDING', 'DRY_RUN') NOT NULL;

-- CreateTable
CREATE TABLE `FeatureFlag` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `description` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(191) NULL,

    UNIQUE INDEX `FeatureFlag_key_key`(`key`),
    INDEX `FeatureFlag_key_idx`(`key`),
    INDEX `FeatureFlag_scope_idx`(`scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ProvisioningLog_executionMode_idx` ON `ProvisioningLog`(`executionMode`);
