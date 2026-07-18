// Sprint 14: Query Optimizer — N+1 detection, query batching, optimization helpers

interface QueryLog {
  model: string;
  operation: string;
  timestamp: number;
  stack?: string;
}

const queryLogs: QueryLog[] = [];
let loggingEnabled = false;

// ============================================
// N+1 Detection
// ============================================

/** Start logging database queries for N+1 analysis */
export function startQueryLogging(): void {
  queryLogs.length = 0;
  loggingEnabled = true;
}

/** Stop query logging and return the log */
export function stopQueryLogging(): QueryLog[] {
  loggingEnabled = false;
  return [...queryLogs];
}

/** Log a query (call this from a Prisma middleware or manually) */
export function logQuery(model: string, operation: string): void {
  if (!loggingEnabled) return;
  queryLogs.push({ model, operation, timestamp: Date.now() });
}

/** Analyze query logs for N+1 patterns */
export interface NPlusOneReport {
  hasIssues: boolean;
  issues: NPlusOneIssue[];
  totalQueries: number;
  uniqueModels: number;
  estimatedSavings: string;
}

export interface NPlusOneIssue {
  model: string;
  operation: string;
  count: number;
  /** If the same query is repeated within a short window, it's likely N+1 */
  isNPlusOne: boolean;
  suggestion: string;
}

export function detectNPlusOne(logs: QueryLog[]): NPlusOneReport {
  const issues: NPlusOneIssue[] = [];
  const modelOps = new Map<string, QueryLog[]>();

  for (const log of logs) {
    const key = `${log.model}:${log.operation}`;
    if (!modelOps.has(key)) modelOps.set(key, []);
    modelOps.get(key)!.push(log);
  }

  for (const [key, entries] of modelOps) {
    if (entries.length <= 1) continue;
    const [model, operation] = key.split(':');

    // Check if queries are clustered in time (N+1 pattern)
    let clusterCount = 1;
    let maxCluster = 1;
    for (let i = 1; i < entries.length; i++) {
      const gap = entries[i].timestamp - entries[i - 1].timestamp;
      if (gap < 50) { // Same tight loop
        clusterCount++;
        maxCluster = Math.max(maxCluster, clusterCount);
      } else {
        clusterCount = 1;
      }
    }

    const isNPlusOne = maxCluster >= 3;

    issues.push({
      model,
      operation,
      count: entries.length,
      isNPlusOne,
      suggestion: isNPlusOne
        ? `Use ${model}.${operation}Many with where: { id: { in: ids } } instead of looping`
        : `Consider batching ${entries.length} ${model} queries into a single query`,
    });
  }

  const nPlusOneCount = issues.filter(i => i.isNPlusOne).length;
  const avgPerModel = issues.length > 0 ? Math.round(queryLogs.length / issues.length) : 0;

  return {
    hasIssues: nPlusOneCount > 0,
    issues: issues.sort((a, b) => b.count - a.count),
    totalQueries: logs.length,
    uniqueModels: modelOps.size,
    estimatedSavings: nPlusOneCount > 0
      ? `~${nPlusOneCount * avgPerModel} queries could be eliminated by batching`
      : 'No N+1 issues detected',
  };
}

// ============================================
// Query Batching
// ============================================

/** Batch multiple independent queries into a single Promise.all */
export async function batchQueries<T extends Record<string, Promise<unknown>>>(
  queries: T
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const keys = Object.keys(queries);
  const values = Object.values(queries);
  const results = await Promise.all(values);
  return Object.fromEntries(keys.map((k, i) => [k, results[i]])) as any;
}

/** Debounced batching — collect IDs and query in one batch after a delay */
export function createIdBatcher<T>(
  fetchFn: (ids: string[]) => Promise<Map<string, T>>,
  delayMs = 50
): {
  queue: (id: string) => Promise<T>;
  flush: () => void;
} {
  const pending: Array<{ id: string; resolve: (v: T) => void; reject: (e: Error) => void }> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (pending.length === 0) return;
    const batch = [...pending];
    pending.length = 0;
    const ids = batch.map(b => b.id);

    fetchFn(ids).then(results => {
      for (const b of batch) {
        const result = results.get(b.id);
        if (result !== undefined) b.resolve(result);
        else b.reject(new Error(`Not found: ${b.id}`));
      }
    }).catch(err => {
      for (const b of batch) b.reject(err);
    });
  }

  return {
    queue(id: string): Promise<T> {
      return new Promise((resolve, reject) => {
        pending.push({ id, resolve, reject });
        if (!timer) timer = setTimeout(() => { timer = null; flush(); }, delayMs);
      });
    },
    flush,
  };
}

/** Estimate query count from a Prisma include chain */
export function estimateQueryDepth(include: Record<string, boolean | object>): number {
  let depth = 0;
  for (const value of Object.values(include)) {
    depth++;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      depth += estimateQueryDepth(value as Record<string, boolean | object>);
    }
  }
  return depth;
}
