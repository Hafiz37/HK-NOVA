-- CreateTable
CREATE TABLE `ExportTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `format` VARCHAR(191) NOT NULL,
    `filters` JSON NOT NULL,
    `columns` JSON NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExportTemplate_createdBy_idx`(`createdBy`),
    INDEX `ExportTemplate_isDefault_idx`(`isDefault`),
    UNIQUE INDEX `ExportTemplate_name_createdBy_key`(`name`, `createdBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
