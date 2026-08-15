-- CreateTable
CREATE TABLE `Setting` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Setting_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Device` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NOT NULL,
    `type` ENUM('ROUTER', 'SWITCH', 'OLT', 'ONT', 'FIREWALL', 'SERVER', 'OTHER') NOT NULL,
    `vendor` VARCHAR(191) NULL,
    `model` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `status` ENUM('UP', 'DOWN', 'UNKNOWN', 'MAINTENANCE') NOT NULL DEFAULT 'UNKNOWN',
    `description` TEXT NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Device_ip_key`(`ip`),
    INDEX `Device_status_idx`(`status`),
    INDEX `Device_type_idx`(`type`),
    INDEX `Device_deletedAt_idx`(`deletedAt`),
    INDEX `Device_isDemo_idx`(`isDemo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Credential` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `snmpVersion` VARCHAR(191) NULL,
    `snmpCommunity` TEXT NULL,
    `snmpUser` VARCHAR(191) NULL,
    `snmpAuthPass` TEXT NULL,
    `snmpPrivPass` TEXT NULL,
    `snmpPort` INTEGER NULL DEFAULT 161,
    `sshUsername` VARCHAR(191) NULL,
    `sshPassword` TEXT NULL,
    `sshPort` INTEGER NULL DEFAULT 22,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Credential_deviceId_key`(`deviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Metric` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metricType` VARCHAR(191) NOT NULL,
    `source` ENUM('REAL', 'DEMO', 'GENERATOR') NOT NULL DEFAULT 'REAL',
    `latency` DOUBLE NULL,
    `packetLoss` DOUBLE NULL,
    `cpuUtil` DOUBLE NULL,
    `memUtil` DOUBLE NULL,
    `interfaceData` JSON NULL,

    INDEX `Metric_deviceId_timestamp_idx`(`deviceId`, `timestamp`),
    INDEX `Metric_metricType_timestamp_idx`(`metricType`, `timestamp`),
    INDEX `Metric_source_idx`(`source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Backup` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `configHash` VARCHAR(191) NOT NULL,
    `configContent` LONGTEXT NOT NULL,
    `changeDetected` BOOLEAN NOT NULL DEFAULT true,
    `status` ENUM('SUCCESS', 'FAILED', 'IN_PROGRESS') NOT NULL,
    `errorMessage` TEXT NULL,

    INDEX `Backup_deviceId_timestamp_idx`(`deviceId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProvisioningLog` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `action` ENUM('CREATE', 'SUSPEND', 'REACTIVATE', 'TERMINATE', 'STATUS_CHECK') NOT NULL,
    `ontSerial` VARCHAR(191) NULL,
    `ponPort` VARCHAR(191) NULL,
    `vlan` INTEGER NULL,
    `serviceProfile` VARCHAR(191) NULL,
    `command` TEXT NOT NULL,
    `response` TEXT NULL,
    `status` ENUM('SUCCESS', 'FAILED', 'PENDING') NOT NULL,
    `errorMessage` TEXT NULL,
    `executedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `executedBy` VARCHAR(191) NULL,

    INDEX `ProvisioningLog_deviceId_executedAt_idx`(`deviceId`, `executedAt`),
    INDEX `ProvisioningLog_ontSerial_idx`(`ontSerial`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Anomaly` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `metricType` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `anomalyScore` DOUBLE NOT NULL,
    `severity` ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL,
    `autoResolved` BOOLEAN NOT NULL DEFAULT false,
    `resolvedAt` DATETIME(3) NULL,

    INDEX `Anomaly_deviceId_timestamp_idx`(`deviceId`, `timestamp`),
    INDEX `Anomaly_severity_idx`(`severity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Alert` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('DEVICE_DOWN', 'DEVICE_UP', 'HIGH_UTILIZATION', 'ANOMALY_DETECTED', 'BACKUP_FAILED', 'PROVISIONING_FAILED') NOT NULL,
    `deviceId` VARCHAR(191) NULL,
    `message` TEXT NOT NULL,
    `severity` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    `status` ENUM('ACTIVE', 'RESOLVED', 'ACKNOWLEDGED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acknowledgedAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,

    INDEX `Alert_status_severity_idx`(`status`, `severity`),
    INDEX `Alert_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `details` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_entity_entityId_idx`(`entity`, `entityId`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `fullName` VARCHAR(191) NULL,
    `role` ENUM('ADMIN', 'OPERATOR', 'VIEWER') NOT NULL DEFAULT 'OPERATOR',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastLoginAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Credential` ADD CONSTRAINT `Credential_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Metric` ADD CONSTRAINT `Metric_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Backup` ADD CONSTRAINT `Backup_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProvisioningLog` ADD CONSTRAINT `ProvisioningLog_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Anomaly` ADD CONSTRAINT `Anomaly_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Alert` ADD CONSTRAINT `Alert_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

