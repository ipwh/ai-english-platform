// Sprint 84: Circuit Breaker — provider resilience pattern
// Automatically skips unhealthy providers after consecutive failures.

export type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerEntry {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureTime: number;
  openedAt: number;
}

const breakers = new Map<string, CircuitBreakerEntry>();

const FAILURE_THRESHOLD = 5;
const RECOVERY_WINDOW_MS = 30000; // 30 seconds before trying half-open
const HALF_OPEN_SUCCESS_THRESHOLD = 2;

function ensureBreaker(provider: string): CircuitBreakerEntry {
  if (!breakers.has(provider)) {
    breakers.set(provider, { state: 'closed', consecutiveFailures: 0, lastFailureTime: 0, openedAt: 0 });
  }
  return breakers.get(provider)!;
}

/** Record a successful provider call */
export function recordSuccess(provider: string): void {
  const breaker = ensureBreaker(provider);
  if (breaker.state === 'half-open') {
    breaker.consecutiveFailures = 0;
    // Stay half-open until threshold met
    return;
  }
  breaker.consecutiveFailures = 0;
  breaker.state = 'closed';
}

/** Record a failed provider call */
export function recordFailure(provider: string): void {
  const breaker = ensureBreaker(provider);
  breaker.consecutiveFailures++;
  breaker.lastFailureTime = Date.now();

  if (breaker.state === 'half-open') {
    breaker.state = 'open';
    breaker.openedAt = Date.now();
  } else if (breaker.consecutiveFailures >= FAILURE_THRESHOLD) {
    breaker.state = 'open';
    breaker.openedAt = Date.now();
  }
}

/** Check if a provider is available (circuit not open) */
export function isProviderAvailable(provider: string): boolean {
  const breaker = ensureBreaker(provider);

  if (breaker.state === 'closed') return true;

  if (breaker.state === 'open') {
    const elapsed = Date.now() - breaker.openedAt;
    if (elapsed >= RECOVERY_WINDOW_MS) {
      breaker.state = 'half-open';
      breaker.consecutiveFailures = 0;
      return true; // Allow one request through (half-open)
    }
    return false;
  }

  // half-open: allow through
  return true;
}

export function getCircuitBreakerState(provider: string): CircuitState {
  return ensureBreaker(provider).state;
}

export function getAllCircuitBreakers(): Record<string, {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
}> {
  const result: Record<string, any> = {};
  for (const [name, breaker] of breakers) {
    result[name] = {
      state: breaker.state,
      consecutiveFailures: breaker.consecutiveFailures,
      openedAt: breaker.openedAt || null,
    };
  }
  return result;
}

export function resetCircuitBreakers(): void {
  breakers.clear();
}
