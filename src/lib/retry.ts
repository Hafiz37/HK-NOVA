export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: (error: Error) => {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('ehostunreach') ||
      message.includes('enetunreach') ||
      message.includes('temporarily unavailable')
    );
  },
};

function calculateDelay(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, options.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<RetryResult<T>> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const data = await operation();
      return {
        success: true,
        data,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isLastAttempt = attempt === config.maxAttempts;
      const isRetryable = config.retryableErrors!(lastError);

      if (isLastAttempt || !isRetryable) {
        return {
          success: false,
          error: lastError,
          attempts: attempt,
          totalTimeMs: Date.now() - startTime,
        };
      }

      const delayMs = calculateDelay(attempt, config);
      
      if (config.onRetry) {
        config.onRetry(lastError, attempt, delayMs);
      }

      await sleep(delayMs);
    }
  }

  return {
    success: false,
    error: lastError || new Error('Unknown error'),
    attempts: config.maxAttempts,
    totalTimeMs: Date.now() - startTime,
  };
}

export class RetryableOperation<T = any> {
  private options: RetryOptions;

  constructor(options: Partial<RetryOptions> = {}) {
    this.options = { ...DEFAULT_RETRY_OPTIONS, ...options };
  }

  async execute(operation: () => Promise<T>): Promise<T> {
    const result = await retryWithBackoff(operation, this.options);
    
    if (!result.success) {
      throw result.error;
    }
    
    return result.data!;
  }

  withOptions(overrides: Partial<RetryOptions>): RetryableOperation<T> {
    return new RetryableOperation({ ...this.options, ...overrides });
  }
}

export const sshRetry = new RetryableOperation({
  maxAttempts: 3,
  initialDelayMs: 2000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: (error: Error) => {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('network')
    );
  },
});

export const snmpRetry = new RetryableOperation({
  maxAttempts: 2,
  initialDelayMs: 1000,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  retryableErrors: (error: Error) => {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('no response')
    );
  },
});

export const databaseRetry = new RetryableOperation({
  maxAttempts: 5,
  initialDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  retryableErrors: (error: Error) => {
    const message = error.message.toLowerCase();
    return (
      message.includes('deadlock') ||
      message.includes('lock timeout') ||
      message.includes('connection') ||
      message.includes('too many connections')
    );
  },
});
