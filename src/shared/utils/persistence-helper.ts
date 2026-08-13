// ============================================
// R3.10-E.2 P1: Shared client persistence reliability helper
// ============================================
// Rules:
//  - Retry ONLY network errors and HTTP 5xx (one retry).
//  - NEVER blindly retry 4xx — a 4xx means the payload is invalid or
//    forbidden; retrying cannot fix it.
//  - Return a final state so UIs never show a "saved" state when
//    persistence is known to have failed.
// ============================================

export type PersistenceFailureKind = 'network' | 'server' | 'client' | 'unknown';

export interface PersistenceOutcome {
  ok: boolean;
  status: number | null;
  retried: boolean;
  failureKind: PersistenceFailureKind | null;
  response: Response | null;
}

export function classifyPersistenceFailure(err: unknown): PersistenceFailureKind {
  if (err instanceof Response || (err && typeof err === 'object' && 'status' in err)) {
    const status = Number((err as { status?: unknown }).status);
    if (Number.isFinite(status) && status >= 500) return 'server';
    if (Number.isFinite(status) && status >= 400 && status < 500) return 'client';
    return 'unknown';
  }
  return 'network'; // fetch rejects on network failures
}

export function shouldRetryPersistence(kind: PersistenceFailureKind): boolean {
  return kind === 'network' || kind === 'server';
}

export interface PersistWithRetryOptions {
  /** Default 1 — never retry 4xx. */
  retries?: number;
}

/**
 * Execute a persistence request with the retry policy.
 * `fetchFn` returns the raw Response; throws are classified as network.
 */
export async function persistWithRetry(
  fetchFn: () => Promise<Response>,
  options: PersistWithRetryOptions = {},
): Promise<PersistenceOutcome> {
  const retries = options.retries ?? 1;
  let lastFailureKind: PersistenceFailureKind | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response | null = null;
    try {
      response = await fetchFn();
    } catch (err) {
      lastFailureKind = classifyPersistenceFailure(err);
      if (attempt < retries && shouldRetryPersistence(lastFailureKind)) continue;
      return { ok: false, status: null, retried: attempt > 0, failureKind: lastFailureKind, response: null };
    }

    lastResponse = response;
    if (response.ok) {
      return { ok: true, status: response.status, retried: attempt > 0, failureKind: null, response };
    }

    lastFailureKind =
      response.status >= 500 ? 'server' : response.status >= 400 ? 'client' : 'unknown';
    if (attempt < retries && shouldRetryPersistence(lastFailureKind)) continue;
    return { ok: false, status: response.status, retried: attempt > 0, failureKind: lastFailureKind, response };
  }

  return { ok: false, status: lastResponse?.status ?? null, retried: true, failureKind: lastFailureKind, response: lastResponse };
}
