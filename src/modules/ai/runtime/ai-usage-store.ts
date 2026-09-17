// ============================================
// AiUsageStore — where AI usage is COUNTED.
//
// budget-policy.ts owns the LIMITS (how much is
// allowed); this module owns the COUNTERS (how
// much has been used) and, crucially, WHERE they
// live.
//
// 2026-09-18: before this file the counters were module-level variables, i.e.
// per-process state. Cloud Run runs minScale 0 / maxScale 20, so on the same
// day one instance could report "budget exhausted" (503 for every AI call)
// while a sibling instance was still fresh, and a cold start silently reset the
// daily cap. The Prisma implementation makes the ledger shared by every
// instance; the memory implementation keeps unit tests and DB-less runs working.
// ============================================

import { logger } from '@/shared/logger/logger';

// ── Types ──

export interface AiDailyUsage {
  /** 'YYYY-MM-DD' (UTC) */
  dayKey: string;
  /** Estimated tokens consumed during that day */
  tokens: number;
  /** Estimated USD spent during that day (budget accounting only, never billing) */
  costUsd: number;
}

export interface AiUsageStore {
  /** Usage accumulated for one UTC day. Days with no row yet read as zeroes. */
  readDay(dayKey: string): Promise<AiDailyUsage>;
  /** Total estimated USD for a calendar month ('YYYY-MM'). */
  readMonthCost(monthKey: string): Promise<number>;
  /**
   * Add usage to a day, creating the row on first write.
   * Must be atomic — several Cloud Run instances write concurrently.
   */
  addUsage(dayKey: string, tokens: number, costUsd: number): Promise<void>;
}

// ── In-memory implementation (tests, DB-less runs, degraded fallback) ──

export class MemoryAiUsageStore implements AiUsageStore {
  private days = new Map<string, AiDailyUsage>();

  async readDay(dayKey: string): Promise<AiDailyUsage> {
    const row = this.days.get(dayKey);
    return row ? { ...row } : { dayKey, tokens: 0, costUsd: 0 };
  }

  async readMonthCost(monthKey: string): Promise<number> {
    let total = 0;
    for (const row of this.days.values()) {
      if (row.dayKey.startsWith(monthKey)) total += row.costUsd;
    }
    return total;
  }

  async addUsage(dayKey: string, tokens: number, costUsd: number): Promise<void> {
    const row = this.days.get(dayKey) ?? { dayKey, tokens: 0, costUsd: 0 };
    row.tokens += tokens;
    row.costUsd += costUsd;
    this.days.set(dayKey, row);
  }

  /** Test helper — drop every recorded day. */
  clear(): void {
    this.days.clear();
  }
}

// ── Prisma implementation (production) ──

/**
 * Durable ledger backed by the `AiDailyUsage` table, so the daily budget is
 * global across instances and survives cold starts.
 *
 * A ledger outage must never take the AI features down: every method degrades
 * to an in-process mirror instead of throwing, and the degradation is logged
 * (first failure at error level, repeats at debug to avoid log flooding).
 * `addUsage` always mirrors locally, so a failure mid-day still leaves the
 * process with a usable — if not global — counter.
 */
export class PrismaAiUsageStore implements AiUsageStore {
  private mirror = new MemoryAiUsageStore();
  private degradedLogged = false;

  async readDay(dayKey: string): Promise<AiDailyUsage> {
    try {
      const db = await loadDb();
      const row = await db.aiDailyUsage.findUnique({ where: { dayKey } });
      if (!row) return { dayKey, tokens: 0, costUsd: 0 };
      this.recovered();
      return { dayKey: row.dayKey, tokens: row.tokens, costUsd: row.costUsd };
    } catch (err) {
      this.degrade('readDay', err);
      return this.mirror.readDay(dayKey);
    }
  }

  async readMonthCost(monthKey: string): Promise<number> {
    try {
      const db = await loadDb();
      const agg = await db.aiDailyUsage.aggregate({
        _sum: { costUsd: true },
        where: { dayKey: { startsWith: monthKey } },
      });
      this.recovered();
      return agg._sum.costUsd ?? 0;
    } catch (err) {
      this.degrade('readMonthCost', err);
      return this.mirror.readMonthCost(monthKey);
    }
  }

  async addUsage(dayKey: string, tokens: number, costUsd: number): Promise<void> {
    await this.mirror.addUsage(dayKey, tokens, costUsd);
    try {
      const db = await loadDb();
      // upsert + atomic `increment` → safe under concurrent instances.
      await db.aiDailyUsage.upsert({
        where: { dayKey },
        create: { dayKey, tokens, costUsd },
        update: { tokens: { increment: tokens }, costUsd: { increment: costUsd } },
      });
      this.recovered();
    } catch (err) {
      this.degrade('addUsage', err);
    }
  }

  private degrade(op: string, err: unknown): void {
    const meta = {
      module: 'ai-usage-store',
      op,
      error: err instanceof Error ? err.message : String(err),
    };
    if (this.degradedLogged) {
      logger.debug(meta, 'AI usage ledger still degraded — using in-process counters');
      return;
    }
    this.degradedLogged = true;
    logger.error(
      meta,
      'AI usage ledger unavailable — falling back to in-process counters, so the daily budget is now per-instance',
    );
  }

  private recovered(): void {
    if (!this.degradedLogged) return;
    this.degradedLogged = false;
    logger.info({ module: 'ai-usage-store' }, 'AI usage ledger recovered');
  }
}

// ── Lazy Prisma access ──
//
// Imported dynamically so the store never pulls the Prisma client into module
// graphs that do not need it (unit tests, scripts, DB-less environments).

async function loadDb() {
  const { db } = await import('@/shared/db/db');
  return db;
}

// ── Store resolution ──

let store: AiUsageStore | null = null;

/**
 * The active ledger. Tests never touch a real database: unless a store is
 * injected they get {@link MemoryAiUsageStore}.
 */
export function getAiUsageStore(): AiUsageStore {
  if (!store) {
    store = isTestRuntime() ? new MemoryAiUsageStore() : new PrismaAiUsageStore();
  }
  return store;
}

/** Inject a store (tests, or an alternative backend). Pass null to re-resolve. */
export function setAiUsageStore(next: AiUsageStore | null): void {
  store = next;
}

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}
