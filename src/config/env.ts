import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid URL' }),

  // Security (CRITICAL - no fallbacks allowed)
  ENCRYPTION_KEY: z.string()
    .length(64, { message: 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)' })
    .regex(/^[0-9a-fA-F]+$/, { message: 'ENCRYPTION_KEY must be hex characters only' }),
  JWT_SECRET: z.string().min(32, { message: 'JWT_SECRET must be at least 32 characters' }),
  OPERATOR_USERNAME: z.string().min(1, { message: 'OPERATOR_USERNAME is required' }),
  OPERATOR_PASSWORD: z.string().min(8, { message: 'OPERATOR_PASSWORD must be at least 8 characters' }),

  // Audit HMAC Key
  AUDIT_HMAC_KEY: z.string().min(32, { message: 'AUDIT_HMAC_KEY must be at least 32 characters' }).optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  // Email / SMTP
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(465),
  SMTP_SECURE: z.coerce.boolean().optional().default(true),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  SMTP_RECIPIENTS: z.string().optional(),

  // Webhook
  NOTIFY_WEBHOOK_URLS: z.string().optional(),

  // SIEM
  SIEM_WEBHOOK_URLS: z.string().optional(),
  SIEM_WEBHOOK_TOKEN: z.string().optional(),
  SIEM_FORMAT: z.enum(['generic', 'splunk']).optional().default('generic'),

  // SMS
  SMS_API_URL: z.string().url().optional().or(z.literal('')),
  SMS_API_KEY: z.string().optional(),
  SMS_ACCOUNT_SID: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  SMS_TO_NUMBERS: z.string().optional(),

  // Rate limiting
  RATE_LIMIT_LOGIN_LIMIT: z.coerce.number().int().positive().optional().default(5),
  RATE_LIMIT_TEST_LIMIT: z.coerce.number().int().positive().optional().default(10),
  RATE_LIMIT_MUTATION_LIMIT: z.coerce.number().int().positive().optional().default(30),
  RATE_LIMIT_USERS_LIMIT: z.coerce.number().int().positive().optional().default(15),
  RATE_LIMIT_SETTINGS_LIMIT: z.coerce.number().int().positive().optional().default(15),
  RATE_LIMIT_EXPORT_LIMIT: z.coerce.number().int().positive().optional().default(5),
  RATE_LIMIT_READ_LIMIT: z.coerce.number().int().positive().optional().default(60),
  RATE_LIMIT_READ_LOOPBACK_LIMIT: z.coerce.number().int().positive().optional().default(2000),
  RATE_LIMIT_PROVISION_LIMIT: z.coerce.number().int().positive().optional().default(10),
  RATE_LIMIT_PROVISION_LOOPBACK_LIMIT: z.coerce.number().int().positive().optional().default(2000),

  // Workers - ICMP
  ICMP_POLL_INTERVAL: z.string().optional().default('*/1 * * * *'),
  ICMP_BATCH_SIZE: z.coerce.number().int().positive().optional().default(20),
  ICMP_CONCURRENCY_LIMIT: z.coerce.number().int().positive().optional().default(10),
  ICMP_PING_RETRIES: z.coerce.number().int().positive().optional().default(3),
  ICMP_ALERT_COOLDOWN_MS: z.coerce.number().int().positive().optional().default(300000),
  DEFAULT_PING_TIMEOUT: z.coerce.number().int().positive().optional().default(5000),

  // Workers - SNMP
  SNMP_POLL_INTERVAL: z.string().optional().default('*/5 * * * *'),
  SNMP_BATCH_SIZE: z.coerce.number().int().positive().optional().default(20),
  SNMP_CONCURRENCY_LIMIT: z.coerce.number().int().positive().optional().default(10),
  SNMP_TIMEOUT_MS: z.coerce.number().int().positive().optional().default(10000),
  SNMP_RETRIES: z.coerce.number().int().positive().optional().default(3),
  SNMP_HIGH_CPU_THRESHOLD: z.coerce.number().int().positive().optional().default(85),
  SNMP_HIGH_MEM_THRESHOLD: z.coerce.number().int().positive().optional().default(90),
  SNMP_HIGH_CPU_RESOLVE_THRESHOLD: z.coerce.number().int().positive().optional().default(80),
  SNMP_HIGH_MEM_RESOLVE_THRESHOLD: z.coerce.number().int().positive().optional().default(85),

  // Workers - Backup
  BACKUP_CRON_SCHEDULE: z.string().optional().default('0 2 * * *'),
  BACKUP_RUN_ON_STARTUP: z.coerce.boolean().optional().default(true),
  BACKUP_CONCURRENCY: z.coerce.number().int().positive().optional().default(4),
  BACKUP_ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-fA-F]+$/).optional(),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().optional().default(365),
  BACKUP_SOFT_DELETE_GRACE_DAYS: z.coerce.number().int().positive().optional().default(30),
  BACKUP_CLEANUP_SCHEDULE: z.string().optional().default('0 4 * * *'),

  // Backup Tiered Storage
  BACKUP_STORAGE_TIERED: z.coerce.boolean().optional().default(false),
  BACKUP_HOT_DAYS: z.coerce.number().int().positive().optional().default(30),
  BACKUP_FILESYSTEM_PATH: z.string().optional().default('/var/backups/hk-nova'),
  BACKUP_ARCHIVE_SCHEDULE: z.string().optional().default('0 3 * * *'),
  BACKUP_ARCHIVE_BATCH_SIZE: z.coerce.number().int().positive().optional().default(100),

  // Backup Phase 3
  BACKUP_MAX_PER_SUBNET: z.coerce.number().int().positive().optional().default(2),
  BACKUP_SKIP_HIGH_LATENCY: z.coerce.boolean().optional().default(true),
  BACKUP_LATENCY_THRESHOLD_MS: z.coerce.number().int().positive().optional().default(500),
  BACKUP_ALLOWED_HOURS: z.string().optional().default('02:00-05:00'),

  // Backup Phase 4
  BACKUP_NOTIFICATIONS_ENABLED: z.coerce.boolean().optional().default(true),
  BACKUP_DAILY_DIGEST_ENABLED: z.coerce.boolean().optional().default(true),
  BACKUP_DAILY_DIGEST_TIME: z.string().optional().default('08:00'),
  BACKUP_CRITICAL_ALERTS_ENABLED: z.coerce.boolean().optional().default(true),
  BACKUP_STORAGE_ALERTS_ENABLED: z.coerce.boolean().optional().default(true),
  BACKUP_STORAGE_ALERT_THRESHOLD: z.coerce.number().int().positive().optional().default(80),
  BACKUP_FAILED_ALERTS_ENABLED: z.coerce.boolean().optional().default(true),
  BACKUP_FAILED_ALERT_THRESHOLD: z.coerce.number().int().positive().optional().default(3),
  BACKUP_WEBHOOK_URL: z.string().optional(),
  BACKUP_EMAIL_RECIPIENTS: z.string().optional(),

  // Anomaly Detection
  ANOMALY_CHECK_INTERVAL: z.string().optional().default('*/10 * * * *'),
  ENABLE_ML_ANOMALY: z.coerce.boolean().optional().default(true),
  ANOMALY_TRAINING_SCHEDULE: z.string().optional().default('0 3 * * 0'),
  ANOMALY_MIN_TRAINING_SAMPLES: z.coerce.number().int().positive().optional().default(100),
  ANOMALY_SENSITIVITY: z.coerce.number().min(0).max(1).optional().default(0.1),
  ANOMALY_MODEL_PATH: z.string().optional().default('./models/anomaly'),
  ANOMALY_TRAINING_DAYS: z.coerce.number().int().positive().optional().default(7),
  ANOMALY_MIN_SAMPLES: z.coerce.number().int().positive().optional().default(50),
  ANOMALY_POLL_INTERVAL: z.string().optional().default('*/5 * * * *'),
  ANOMALY_SCORE_THRESHOLD_HIGH: z.coerce.number().min(0).max(1).optional().default(0.7),
  ANOMALY_SCORE_THRESHOLD_CRITICAL: z.coerce.number().min(0).max(1).optional().default(0.85),

  // Worker Schedules
  ESCALATOR_INTERVAL: z.string().optional().default('* * * * *'),
  RETENTION_BATCH_SIZE: z.coerce.number().int().positive().optional().default(1000),
  RETENTION_CRON_SCHEDULE: z.string().optional().default('0 3 * * *'),
  RETENTION_DRY_RUN: z.coerce.boolean().optional().default(false),
  RETRY_INTERVAL: z.string().optional().default('*/2 * * * *'),
  SCHEDULED_PROVISIONING_CRON: z.string().optional().default('* * * * *'),
  DIGEST_INTERVAL: z.string().optional().default('* * * * *'),
  APP_MODE: z.enum(['development', 'production', 'test']).optional().default('development'),

  // Features
  ENABLE_OLT_EXECUTION: z.coerce.boolean().optional().default(false),
  DEMO_MODE_ENABLED: z.coerce.boolean().optional().default(true),

  // Redis
  REDIS_URL: z.string().url().optional().default('redis://localhost:6379'),
  REDIS_QUEUE_TTL_SECONDS: z.coerce.number().int().positive().optional().default(600),

  // Baseline
  BASELINE_WINDOW_HOURS: z.coerce.number().int().positive().optional().default(24),

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional().default('http://localhost:3000'),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional().default('info'),

  // NextAuth (if used)
  NEXTAUTH_SECRET: z.string().min(32).optional(),
  NEXTAUTH_URL: z.string().url().optional(),

  // Sentry
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

export function validateEnv(): Env {
  if (validatedEnv) return validatedEnv;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten();
    console.error('\n❌ Environment validation failed:');
    console.error('================================');
    if (errors.fieldErrors) {
      for (const [field, messages] of Object.entries(errors.fieldErrors)) {
        console.error(`  ${field}: ${messages.join(', ')}`);
      }
    }
    if (errors.formErrors.length > 0) {
      console.error(`  Form errors: ${errors.formErrors.join(', ')}`);
    }
    console.error('================================\n');
    throw new Error('Invalid environment configuration. Check the errors above.');
  }

  validatedEnv = result.data;
  console.log('✅ Environment validation passed');
  return validatedEnv;
}

export function getEnv(): Env {
  if (!validatedEnv) {
    return validateEnv();
  }
  return validatedEnv;
}

export const env = validateEnv();