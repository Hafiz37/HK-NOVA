-- AlterTable
ALTER TABLE `Anomaly` MODIFY `severity` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL;
