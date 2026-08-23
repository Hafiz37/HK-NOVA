-- CreateTable
CREATE TABLE `ProvisioningRequest` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `action` ENUM('CREATE', 'SUSPEND', 'REACTIVATE', 'TERMINATE', 'STATUS_CHECK') NOT NULL,
    `templateName` VARCHAR(191) NULL,
    `fields` JSON NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `requestedBy` VARCHAR(191) NOT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectionReason` TEXT NULL,
    `logId` VARCHAR(191) NULL,
    `metadata` JSON NULL,

    UNIQUE INDEX `ProvisioningRequest_logId_key`(`logId`),
    INDEX `ProvisioningRequest_status_requestedAt_idx`(`status`, `requestedAt`),
    INDEX `ProvisioningRequest_deviceId_idx`(`deviceId`),
    INDEX `ProvisioningRequest_requestedBy_idx`(`requestedBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProvisioningRequest` ADD CONSTRAINT `ProvisioningRequest_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProvisioningRequest` ADD CONSTRAINT `ProvisioningRequest_logId_fkey` FOREIGN KEY (`logId`) REFERENCES `ProvisioningLog`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
