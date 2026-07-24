// Sprint 80: Retry Policy — centralized retry logic for AI calls
// All AI use cases delegate retry behavior here. No inline retry loops in use cases.

import { logger } from '@/shared/logger/logger';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableErrorPattern?: RegExp;
  onRetry?: (attempt: number, error: string) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  retryableErrorPattern: /AI 回傳格式無法解析|AI 回傳資料格式異常|JSON|timeout|rate.?limit|503|429/i,
  onRetry: () => {},
};

/**
 * Execute an async function with retry logic.
 * Only retries on errors matching `retryableErrorPattern`.
 */
export async function executeWithRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isRetryable = opts.retryableErrorPattern.test(message);

      if (!isRetryable || attempt >= opts.maxRetries - 1) {
        throw err;
      }

      const delay = Math.min(opts.baseDelayMs * Math.pow(2, attempt), opts.maxDelayMs);
      opts.onRetry(attempt + 1, message);
      logger.warn({ module: 'retry', attempt: attempt + 1, delay, error: message.slice(0, 100) }, 'Retrying AI call');

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Unreachable — TypeScript guard
  throw new Error('executeWithRetry: max retries exceeded');
}
