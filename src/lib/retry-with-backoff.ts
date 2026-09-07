export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
  retryableErrors?: (error: Error) => boolean;
}

export interface RetryMetrics {
  attempts: number;
  totalDelayMs: number;
  lastError?: string;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 16000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
};

function calculateDelay(
  attempt: number,
  options: RetryOptions
): number {
  const baseDelay = Math.min(
    options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt),
    options.maxDelayMs
  );

  const jitter = baseDelay * options.jitterFactor * (Math.random() * 2 - 1);
  
  return Math.max(0, baseDelay + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: Error, options: RetryOptions): boolean {
  if (options.retryableErrors) {
    return options.retryableErrors(error);
  }

  const message = error.message.toLowerCase();
  
  const retryablePatterns = [
    'timeout',
    'econnrefused',
    'econnreset',
    'etimedout',
    'enetunreach',
    'ehostunreach',
    'epipe',
    'socket hang up',
    'network error',
    'connection lost',
    'connection refused',
    'too many connections',
  ];

  return retryablePatterns.some((pattern) => message.includes(pattern));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const metrics: RetryMetrics = {
    attempts: 0,
    totalDelayMs: 0,
  };

  let lastError: Error;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    metrics.attempts = attempt + 1;

    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      metrics.lastError = lastError.message;

      if (attempt === opts.maxRetries) {
        throw new Error(
          `Max retries (${opts.maxRetries}) reached. Last error: ${lastError.message}`
        );
      }

      if (!isRetryableError(lastError, opts)) {
        throw lastError;
      }

      const delayMs = calculateDelay(attempt, opts);
      metrics.totalDelayMs += delayMs;

      console.log(
        `[Retry] Attempt ${attempt + 1}/${opts.maxRetries + 1} failed: ${
          lastError.message
        }. Retrying in ${Math.round(delayMs)}ms...`
      );

      await sleep(delayMs);
    }
  }

  throw lastError!;
}

export async function retryWithBackoffAndMetrics<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<{ result: T; metrics: RetryMetrics }> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const metrics: RetryMetrics = {
    attempts: 0,
    totalDelayMs: 0,
  };

  let lastError: Error;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    metrics.attempts = attempt + 1;

    try {
      const result = await fn();
      return { result, metrics };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      metrics.lastError = lastError.message;

      if (attempt === opts.maxRetries) {
        throw new Error(
          `Max retries (${opts.maxRetries}) reached. Last error: ${lastError.message}`
        );
      }

      if (!isRetryableError(lastError, opts)) {
        throw lastError;
      }

      const delayMs = calculateDelay(attempt, opts);
      metrics.totalDelayMs += delayMs;

      await sleep(delayMs);
    }
  }

  throw lastError!;
}

export { calculateDelay, isRetryableError };
