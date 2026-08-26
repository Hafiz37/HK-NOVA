import { z } from 'zod';

/**
 * Environment Variables Schema Validation
 * Strictly validates process.env at application startup or when imported.
 */
const envSchema = z.object({
  // Core Database & Security
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ENCRYPTION_KEY: z.string().refine(
    (val) => !val || (val.length === 64 && /^[0-9a-fA-F]+$/.test(val)),
    { message: 'ENCRYPTION_KEY must be a 64-character hex string' }
  ).optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET should be at least 16 characters').optional(),
  AUDIT_HMAC_KEY: z.string().min(16, 'AUDIT_HMAC_KEY should be at least 16 characters').optional(),

  // Operator Defaults
  OPERATOR_USERNAME: z.string().default('admin'),
  OPERATOR_PASSWORD: z.string().default('admin123'),

  // Environment & Runtime Mode
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  // Redis
  REDIS_URL: z.string().optional(),
  REDIS_QUEUE_TTL_SECONDS: z.coerce.number().int().positive().default(600),

  // Worker Configurations
  ICMP_POLL_INTERVAL: z.string().default('*/1 * * * *'),
  ICMP_BATCH_SIZE: z.coerce.number().int().positive().default(20),
  ICMP_CONCURRENCY_LIMIT: z.coerce.number().int().positive().default(10),

  SNMP_POLL_INTERVAL: z.string().default('*/5 * * * *'),
  SNMP_BATCH_SIZE: z.coerce.number().int().positive().default(20),
  SNMP_CONCURRENCY_LIMIT: z.coerce.number().int().positive().default(10),

  // Feature Flags
  ENABLE_OLT_EXECUTION: z.coerce.boolean().default(false),
  ENABLE_ML_ANOMALY: z.coerce.boolean().default(true),
  DEMO_MODE_ENABLED: z.coerce.boolean().default(true),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates process.env against schema.
 * Throws actionable errors in production if required keys are missing or invalid.
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formattedErrors = result.error.format();
    console.error('❌ Environment validation error:', JSON.stringify(formattedErrors, null, 2));
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid environment configuration in production. See logs for details.');
    }
  }

  return result.success ? result.data : (process.env as unknown as Env);
}

export const env = validateEnv();
