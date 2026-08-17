-- AlterTable
ALTER TABLE `Device` ADD COLUMN `cpuThresholdOverride` DOUBLE NULL,
    ADD COLUMN `memThresholdOverride` DOUBLE NULL,
    ADD COLUMN `cpuResolveThresholdOverride` DOUBLE NULL,
    ADD COLUMN `memResolveThresholdOverride` DOUBLE NULL;