-- AlterEnum: Add UPDATE to ProvisioningAction
ALTER TABLE `ProvisioningLog` MODIFY `action` ENUM('CREATE', 'SUSPEND', 'REACTIVATE', 'TERMINATE', 'STATUS_CHECK', 'UPDATE') NOT NULL;

-- CreateTable: Customer
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `phoneNumber` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `serviceType` ENUM('PPPOE', 'DHCP', 'STATIC', 'HOTSPOT') NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `macAddress` VARCHAR(191) NULL,
    `uploadSpeed` INTEGER NOT NULL,
    `downloadSpeed` INTEGER NOT NULL,
    `packageName` VARCHAR(191) NOT NULL,
    `pppoePassword` VARCHAR(191) NULL,
    `pppoeProfile` VARCHAR(191) NULL,
    `dhcpServer` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'TERMINATED', 'PENDING') NOT NULL DEFAULT 'PENDING',
    `isOnline` BOOLEAN NOT NULL DEFAULT false,
    `lastSeen` DATETIME(3) NULL,
    `activationDate` DATETIME(3) NOT NULL,
    `expiryDate` DATETIME(3) NULL,
    `billingCycle` VARCHAR(191) NULL,
    `monthlyFee` DECIMAL(10, 2) NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(191) NULL,
    `notes` TEXT NULL,

    UNIQUE INDEX `Customer_username_key`(`username`),
    INDEX `Customer_deviceId_idx`(`deviceId`),
    INDEX `Customer_status_idx`(`status`),
    INDEX `Customer_username_idx`(`username`),
    INDEX `Customer_serviceType_idx`(`serviceType`),
    INDEX `Customer_status_isOnline_idx`(`status`, `isOnline`),
    INDEX `Customer_deviceId_status_idx`(`deviceId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: CustomerProvisioningLog
CREATE TABLE `CustomerProvisioningLog` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `action` ENUM('CREATE', 'SUSPEND', 'REACTIVATE', 'TERMINATE', 'STATUS_CHECK', 'UPDATE') NOT NULL,
    `success` BOOLEAN NOT NULL,
    `errorMessage` TEXT NULL,
    `commandSent` TEXT NULL,
    `response` TEXT NULL,
    `executedBy` VARCHAR(191) NULL,
    `executedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CustomerProvisioningLog_customerId_idx`(`customerId`),
    INDEX `CustomerProvisioningLog_executedAt_idx`(`executedAt`),
    INDEX `CustomerProvisioningLog_action_idx`(`action`),
    INDEX `CustomerProvisioningLog_success_idx`(`success`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: CustomerStatusHistory
CREATE TABLE `CustomerStatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `fromStatus` ENUM('ACTIVE', 'SUSPENDED', 'TERMINATED', 'PENDING') NOT NULL,
    `toStatus` ENUM('ACTIVE', 'SUSPENDED', 'TERMINATED', 'PENDING') NOT NULL,
    `reason` VARCHAR(191) NULL,
    `changedBy` VARCHAR(191) NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CustomerStatusHistory_customerId_idx`(`customerId`),
    INDEX `CustomerStatusHistory_changedAt_idx`(`changedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
