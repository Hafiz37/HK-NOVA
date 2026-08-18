-- AlterTable: cooldown timestamps need millisecond precision for accurate cooldown math
ALTER TABLE `AlertCooldown` MODIFY `cooldownAt` TIMESTAMP(3) NOT NULL;