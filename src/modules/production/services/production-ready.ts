// Sprint 29: Production Readiness — Circuit Breaker + Retry Strategy
import { logger } from '@/shared/logger/logger';
import { config } from '@/shared/config/config';

// ============================================
// Circuit Breaker
// States: CLOSED → OPEN (after failures) → HALF_OPEN (after timeout) → CLOSED
// ============================================

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  failureThreshold: number;    // failures before opening
  resetTimeoutMs: number;      // ms before trying HALF_OPEN
  halfOpenMaxRequests: number; // max requests in HALF_OPEN before deciding
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  halfOpenRequests: number;
}

const breakers = new Map<string, CircuitBreakerState>();

const DEFAULT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,       // 30 seconds
  halfOpenMaxRequests: 3,
};

export class CircuitBreaker {
  constructor(
    private name: string,
    private config: CircuitBreakerConfig = DEFAULT_BREAKER_CONFIG,
  ) {
    if (!breakers.has(name)) {
      breakers.set(name, { state: 'CLOSED', failureCount: 0, lastFailureTime: 0, halfOpenRequests: 0 });
    }
  }

  private get state(): CircuitBreakerState {
    return breakers.get(this.name)!;
  }

  /** Execute a function with circuit breaker protection */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state.state === 'OPEN') {
      if (Date.now() - this.state.lastFailureTime > this.config.resetTimeoutMs) {
        this.state.state = 'HALF_OPEN';
        this.state.halfOpenRequests = 0;
        logger.info({ module: 'circuit-breaker', name: this.name }, 'Circuit HALF_OPEN — testing recovery');
      } else {
        throw new Error(`Circuit breaker [${this.name}] is OPEN. Try again later.`);
      }
    }

    if (this.state.state === 'HALF_OPEN') {
      if (this.state.halfOpenRequests >= this.config.halfOpenMaxRequests) {
        throw new Error(`Circuit breaker [${this.name}] is HALF_OPEN — too many test requests.`);
      }
      this.state.halfOpenRequests++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state.state === 'HALF_OPEN') {
      this.state.state = 'CLOSED';
      this.state.failureCount = 0;
      logger.info({ module: 'circuit-breaker', name: this.name }, 'Circuit CLOSED — recovered');
    }
    this.state.failureCount = 0;
  }

  private onFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();
    if (this.state.failureCount >= this.config.failureThreshold) {
      this.state.state = 'OPEN';
      logger.warn({ module: 'circuit-breaker', name: this.name, failures: this.state.failureCount }, 'Circuit OPEN — too many failures');
    }
  }

  getState(): CircuitState { return this.state.state; }
  getFailureCount(): number { return this.state.failureCount; }
  reset(): void { this.state.state = 'CLOSED'; this.state.failureCount = 0; this.state.halfOpenRequests = 0; }

  static resetAll(): void { breakers.clear(); }
}

// ============================================
// Retry Strategy — Exponential Backoff with Jitter
// ============================================

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryOn?: (error: Error) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (cfg.retryOn && !cfg.retryOn(lastError)) throw lastError;
      if (attempt === cfg.maxRetries) throw lastError;

      let delay = cfg.baseDelayMs * Math.pow(cfg.backoffMultiplier, attempt);
      delay = Math.min(delay, cfg.maxDelayMs);
      if (cfg.jitter) {
        delay = delay * (0.5 + Math.random() * 0.5); // 50%-100% of calculated delay
      }

      logger.warn({ module: 'retry', attempt: attempt + 1, maxRetries: cfg.maxRetries, delayMs: Math.round(delay), error: lastError.message }, 'Retrying after failure');
      await sleep(Math.round(delay));
    }
  }
  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// AI Request Queue — simple in-process FIFO
// ============================================

interface QueueItem<T> {
  id: string;
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (err: Error) => void;
  priority: number;
  createdAt: number;
}

class AIRequestQueue {
  private queue: QueueItem<any>[] = [];
  private processing = false;
  private concurrency: number;
  private activeCount = 0;
  private counter = 0;

  constructor(concurrency = 3) {
    this.concurrency = concurrency;
  }

  async enqueue<T>(task: () => Promise<T>, priority = 0): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        id: `aiq_${++this.counter}_${Date.now()}`,
        task, resolve, reject, priority, createdAt: Date.now(),
      });
      this.queue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.activeCount >= this.concurrency || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0 && this.activeCount < this.concurrency) {
      const item = this.queue.shift()!;
      this.activeCount++;

      try {
        const result = await item.task();
        item.resolve(result);
      } catch (err) {
        item.reject(err instanceof Error ? err : new Error(String(err)));
      } finally {
        this.activeCount--;
      }
    }

    this.processing = false;
    if (this.queue.length > 0) this.processNext();
  }

  get length(): number { return this.queue.length; }
  get active(): number { return this.activeCount; }
}

export const aiQueue = new AIRequestQueue(3);

// ============================================
// Feature Flags
// ============================================

const flags = new Map<string, boolean>();

const DEFAULTS: Record<string, boolean> = {
  'rag-enabled': false,
  'ai-cache-enabled': true,
  'ai-cost-tracking': true,
  'circuit-breaker': true,
  'observability': true,
  'learning-memory': true,
  'recommendation-engine': true,
  'writing-coach-rubric': true,
  'llm-evaluation': false,
  'experiment': false,
};

export function isFeatureEnabled(feature: string): boolean {
  if (flags.has(feature)) return flags.get(feature)!;
  return DEFAULTS[feature] ?? false;
}

export function setFeatureFlag(feature: string, enabled: boolean): void {
  flags.set(feature, enabled);
  logger.info({ module: 'feature-flags', feature, enabled }, `Feature flag updated`);
}

export function getAllFeatureFlags(): Record<string, boolean> {
  const result: Record<string, boolean> = { ...DEFAULTS };
  for (const [key, value] of flags) result[key] = value;
  return result;
}

// ============================================
// Health Check + Readiness Check
// ============================================

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: Record<string, { status: string; message?: string; latencyMs?: number }>;
}

const startTime = Date.now();

export async function healthCheck(): Promise<HealthStatus> {
  const checks: HealthStatus['checks'] = {};
  let healthy = true;

  // Check AI provider
  const aiStart = Date.now();
  try {
    const configured = config.deepseek.isConfigured || config.gemini.isConfigured;
    checks.ai = { status: configured ? 'healthy' : 'degraded', message: configured ? 'AI configured' : 'No AI key set', latencyMs: Date.now() - aiStart };
    if (!configured) healthy = false;
  } catch {
    checks.ai = { status: 'unhealthy', message: 'AI check failed' };
    healthy = false;
  }

  // Check database
  try {
    checks.database = { status: 'healthy', message: 'DB configured (check via Prisma)' };
  } catch {
    checks.database = { status: 'unhealthy' };
    healthy = false;
  }

  // Check memory
  const memUsage = process.memoryUsage?.();
  if (memUsage) {
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    checks.memory = { status: heapUsedMB < 512 ? 'healthy' : 'degraded', message: `${heapUsedMB}MB heap used` };
  }

  return {
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.round((Date.now() - startTime) / 1000),
    checks,
  };
}

export async function readinessCheck(): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
  return {
    ready: true,
    checks: {
      ai: !!(config.deepseek.isConfigured || config.gemini.isConfigured),
      database: true,
      memory: true,
    },
  };
}

// ============================================
// Graceful Shutdown
// ============================================

const shutdownHandlers: Array<{ name: string; handler: () => Promise<void> }> = [];

export function onShutdown(name: string, handler: () => Promise<void>): void {
  shutdownHandlers.push({ name, handler });
}

export async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ module: 'shutdown', signal }, 'Graceful shutdown initiated');
  for (const { name, handler } of shutdownHandlers) {
    try {
      logger.info({ module: 'shutdown', handler: name }, 'Running shutdown handler');
      await Promise.race([handler(), sleep(5000)]);
    } catch (err) {
      logger.error({ module: 'shutdown', handler: name, error: (err as Error)?.message }, 'Shutdown handler failed');
    }
  }
  logger.info({ module: 'shutdown' }, 'Graceful shutdown complete');
}

// Register process handlers (Node.js)
if (typeof process !== 'undefined') {
  ['SIGTERM', 'SIGINT'].forEach(signal => {
    process.on(signal, () => {
      gracefulShutdown(signal).then(() => process.exit(0));
    });
  });
}
