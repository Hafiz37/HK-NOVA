-- Initialize database for development
-- This script runs automatically when MySQL container starts for the first time

-- Ensure UTF8MB4 charset
ALTER DATABASE hk_nova_dev CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Grant all privileges to dev user
GRANT ALL PRIVILEGES ON hk_nova_dev.* TO 'hk_nova_dev'@'%';
FLUSH PRIVILEGES;

SELECT 'Database initialized successfully' AS message;
