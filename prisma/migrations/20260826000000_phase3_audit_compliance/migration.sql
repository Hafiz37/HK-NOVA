-- Phase 3: Audit & Compliance Models
-- Enhanced AuditLog with immutability fields
-- AuditLogArchive for archival
-- ComplianceReport for compliance reporting

-- Add new columns to existing AuditLog table
ALTER TABLE `AuditLog` 
ADD COLUMN `signature` TEXT NULL,
ADD COLUMN `previousHash` TEXT NULL,
ADD COLUMN `sequenceNumber` BIGINT NOT NULL AUTO_INCREMENT,
ADD COLUMN `sessionId` VARCHAR(191) NULL,
ADD COLUMN `apiKeyId` VARCHAR(191) NULL,
ADD COLUMN `dataClassification` VARCHAR(191) NULL DEFAULT 'internal',
ADD COLUMN `containsPII` BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN `containsSecrets` BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN `retentionPolicy` VARCHAR(191) NULL DEFAULT 'standard',
ADD COLUMN `retentionUntil` DATETIME(3) NULL,
ADD COLUMN `isArchived` BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN `archivedAt` DATETIME(3) NULL,
ADD COLUMN `verified` BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN `verifiedAt` DATETIME(3) NULL,
ADD COLUMN `tampered` BOOLEAN NOT NULL DEFAULT FALSE,
ADD INDEX `AuditLog_sequenceNumber_idx` (`sequenceNumber`),
ADD INDEX `AuditLog_retentionUntil_idx` (`retentionUntil`),
ADD INDEX `AuditLog_isArchived_idx` (`isArchived`);

-- Create AuditLogArchive table
CREATE TABLE `AuditLogArchive` (
    `id` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `filePath` VARCHAR(191) NOT NULL,
    `fileHash` VARCHAR(191) NOT NULL,
    `fileSize` INT NOT NULL,
    `compressed` BOOLEAN NOT NULL DEFAULT TRUE,
    `encrypted` BOOLEAN NOT NULL DEFAULT TRUE,
    `recordCount` INT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `AuditLogArchive_startDate_endDate_idx` ON `AuditLogArchive`(`startDate`, `endDate`);

-- Create ComplianceReport table
CREATE TABLE `ComplianceReport` (
    `id` VARCHAR(191) NOT NULL,
    `reportType` VARCHAR(191) NOT NULL,
    `standard` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `summary` JSON NOT NULL,
    `findings` JSON NOT NULL,
    `recommendations` JSON NULL,
    `filePath` VARCHAR(191) NULL,
    `fileHash` VARCHAR(191) NULL,
    `generatedBy` VARCHAR(191) NOT NULL,
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ComplianceReport_reportType_generatedAt_idx` ON `ComplianceReport`(`reportType`, `generatedAt`);
CREATE INDEX `ComplianceReport_standard_idx` ON `ComplianceReport`(`standard`);

-- Update existing AuditLog records to have sequenceNumber
-- This is a one-time operation for existing records
-- Note: In production, this would be handled differently