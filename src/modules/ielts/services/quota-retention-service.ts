// ============================================
// IELTS generation-quota retention (2026-10-08, Sprint 132)
// ============================================
// `IeltsGenerationQuota` holds one row per (student, Hong Kong day, bucket).
// Nothing ever reads a PAST day: every consumer
// (`reserveInstantQuota` / `releaseInstantQuota` / `readInstantQuotaUsed`)
// scopes to the current Hong Kong day, and the quota is a fairness counter, not
// an accounting ledger (unlike `AiDailyUsage`, which IS the spend ledger and is
// deliberately never pruned here).
//
// Without retention the table grows without bound:
//   ~2 rows/student/day (buckets `set` + `full_component`)
//   ≈ 850 students × 2 = 1 700 rows/day  →  ≈ 51 000/month  →  ≈ 620 000/year
//
// Policy: keep `IELTS_QUOTA_RETENTION_DAYS` (default 30) Hong Kong days.
//   * 30 days is far beyond any UTC/HKT day-boundary skew, so a live counter can
//     never be deleted mid-day
//   * it keeps a month of usage auditable for support questions
//   * deletion is BATCHED (bounded query + bounded delete per round) and capped
//     by `IELTS_QUOTA_RETENTION_MAX_BATCHES`, so it is safe to run on a schedule
//     AND safe to call repeatedly — a partially drained backlog simply drains
//     over subsequent runs.
// Never replace this with one unbounded `deleteMany`.
// ============================================

import { hkDayKey, hkDaysAgo } from '@/shared/utils/hk-date';
import * as ieltsRepo from '../repositories/ielts-repo';

/** Hong Kong days of quota history retained. */
export const IELTS_QUOTA_RETENTION_DAYS = 30;
/** Rows removed per batch (bounded delete). */
export const IELTS_QUOTA_RETENTION_BATCH_SIZE = 500;
/** Safety cap on batches per invocation (bounds one scheduled run). */
export const IELTS_QUOTA_RETENTION_MAX_BATCHES = 200;

export interface IeltsQuotaRetentionResult {
  /** Hong Kong day key the cleanup used as its cutoff (rows strictly before it). */
  cutoffDayKey: string;
  /** Rows actually deleted. */
  deletedRows: number;
  /** Batch rounds executed. */
  batches: number;
  /** true when the batch cap was reached — more work remains. */
  moreRemaining: boolean;
  dryRun: boolean;
  /** Stale-row count when `dryRun` (a dry run never deletes). */
  wouldDelete: number;
}

export interface IeltsQuotaRetentionDeps {
  /** Injected for tests; defaults to the batched repository delete. */
  deleteBatch?: (cutoffDayKey: string, batchSize: number) => Promise<number>;
  /** Injected for tests; defaults to the repository count. */
  countStale?: (cutoffDayKey: string) => Promise<number>;
  now?: () => Date;
}

/**
 * Batched retention for the IELTS on-demand generation quota.
 *
 * `dryRun` only COUNTS — an operator can inspect the backlog before enabling the
 * schedule, and a dry run can never delete anything.
 */
export async function runIeltsQuotaRetention(
  options: { dryRun?: boolean } = {},
  deps: IeltsQuotaRetentionDeps = {},
): Promise<IeltsQuotaRetentionResult> {
  const deleteBatch = deps.deleteBatch ?? ieltsRepo.deleteInstantQuotaRowsOlderThan;
  const countStale = deps.countStale ?? ieltsRepo.countInstantQuotaRowsOlderThan;
  const now = deps.now ?? (() => new Date());

  const cutoffDayKey = hkDaysAgo(IELTS_QUOTA_RETENTION_DAYS, now());

  if (options.dryRun) {
    const wouldDelete = await countStale(cutoffDayKey);
    return {
      cutoffDayKey,
      deletedRows: 0,
      batches: 0,
      moreRemaining: wouldDelete > 0,
      dryRun: true,
      wouldDelete,
    };
  }

  let deletedRows = 0;
  let batches = 0;

  for (let round = 0; round < IELTS_QUOTA_RETENTION_MAX_BATCHES; round++) {
    const removed = await deleteBatch(cutoffDayKey, IELTS_QUOTA_RETENTION_BATCH_SIZE);
    batches += 1;
    deletedRows += removed;
    // A short batch means the backlog is drained (or was already empty).
    if (removed < IELTS_QUOTA_RETENTION_BATCH_SIZE) {
      return { cutoffDayKey, deletedRows, batches, moreRemaining: false, dryRun: false, wouldDelete: 0 };
    }
    if (round === IELTS_QUOTA_RETENTION_MAX_BATCHES - 1) {
      // Cap reached with a full batch: rows remain and the next run continues.
      return { cutoffDayKey, deletedRows, batches, moreRemaining: true, dryRun: false, wouldDelete: 0 };
    }
  }

  return { cutoffDayKey, deletedRows, batches, moreRemaining: false, dryRun: false, wouldDelete: 0 };
}

/** Observability: today's Hong Kong day key (never a UTC day). */
export function currentQuotaDayKey(now: Date = new Date()): string {
  return hkDayKey(now);
}
