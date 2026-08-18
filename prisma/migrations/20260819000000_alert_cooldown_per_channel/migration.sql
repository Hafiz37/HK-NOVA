-- AlterTable: replace per-device unique with per (deviceId, channel, cooldownKey) uniqueness
ALTER TABLE `AlertCooldown` DROP INDEX `AlertCooldown_deviceId_key`;

-- AlterTable
ALTER TABLE `AlertCooldown` ADD COLUMN `cooldownKey` VARCHAR(191) NOT NULL DEFAULT 'default';

-- CreateIndex
CREATE UNIQUE INDEX `AlertCooldown_deviceId_channel_cooldownKey_key` ON `AlertCooldown`(`deviceId`, `channel`, `cooldownKey`);

-- CreateIndex
CREATE INDEX `AlertCooldown_deviceId_idx` ON `AlertCooldown`(`deviceId`);

-- CreateIndex
CREATE INDEX `AlertCooldown_cooldownAt_idx` ON `AlertCooldown`(`cooldownAt`);