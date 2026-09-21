// Sprint 133: Behavior-based monitoring data access.
// Architecture contract: API routes must not import Prisma/db or repositories
// directly — this service is the single access point for activity signals.
//
// 2026-09-21 稽核修正（三項）：
// 1. **活動訊號覆蓋**：舊碼只取 `max(LoginLog.loginAt, PracticeSession.startedAt)`
//    → 只寫作或只交作業的學生會被誤標「失聯」。現納入
//    `WritingDraft.updatedAt` 與 `Submission.submittedAt`。
// 2. **效能**：`getShortWritingCounts()` 舊碼每次請求都把**所有學生的全部草稿
//    全文**（`select: { draft: true }`）拉進 Node 記憶體，只為了數「極短」篇數。
//    現改為 DB 端計數（SQL），回傳值與 `countShortWritings()` 完全同規則。
// 3. **單一門檻 owner**：活躍／低活躍／失聯的天數門檻集中在這裡，
//    由伺服器計算 `daysInactive`，UI 不再各自寫一套（避免兩頁不一致）。
import { db } from '@/shared/db/db';
import { Prisma } from '@prisma/client';
import { hkDayKey, hkToday } from '@/shared/utils/hk-date';
import { logger } from '@/shared/logger/logger';

/** 活躍狀態門檻（單一 owner）。 */
export const ACTIVITY_LOW_DAYS = 7;
export const ACTIVITY_INACTIVE_DAYS = 14;

export type ActivityStatus = 'never-started' | 'inactive' | 'low' | 'active';

/** 以香港日界線計算「相差幾日」（避免 UTC 邊界令凌晨活動少算一日）。 */
export function daysSinceHk(past: Date, now: Date = new Date()): number {
  const pastKey = hkDayKey(past);
  const nowKey = hkToday(now);
  const diffMs = Date.parse(`${nowKey}T00:00:00Z`) - Date.parse(`${pastKey}T00:00:00Z`);
  return Math.max(0, Math.round(diffMs / 86_400_000));
}

/**
 * 最後活動時間 → 狀態。
 * `never-started`（從未有任何訊號）與 `inactive`（用過但已長期未活動）
 * **必須可區分**：兩者的教學處理完全不同（前者是導入問題，後者是流失問題）。
 */
export function classifyActivityStatus(
  lastActiveAt: Date | null | undefined,
  now: Date = new Date(),
): { status: ActivityStatus; daysInactive: number | null } {
  if (!lastActiveAt) return { status: 'never-started', daysInactive: null };
  const days = daysSinceHk(lastActiveAt, now);
  if (days >= ACTIVITY_INACTIVE_DAYS) return { status: 'inactive', daysInactive: days };
  if (days >= ACTIVITY_LOW_DAYS) return { status: 'low', daysInactive: days };
  return { status: 'active', daysInactive: days };
}

/**
 * Latest activity timestamp per student = max(last login, last practice,
 * last writing-draft update, last assignment submission).
 * Only students present in the result have activity evidence.
 */
export async function getLastActivityMap(studentIds: string[]): Promise<Map<string, Date>> {
  if (studentIds.length === 0) return new Map();
  const [loginAgg, practiceAgg, draftAgg, submissionAgg] = await Promise.all([
    db.loginLog.groupBy({ by: ['userId'], _max: { loginAt: true }, where: { userId: { in: studentIds } } }),
    db.practiceSession.groupBy({ by: ['studentId'], _max: { startedAt: true }, where: { studentId: { in: studentIds } } }),
    // 2026-09-21：寫作草稿更新也是真實使用訊號（只寫作、不練練習的學生）
    db.writingDraft.groupBy({ by: ['studentId'], _max: { updatedAt: true }, where: { studentId: { in: studentIds } } }),
    // 2026-09-21：作業提交同樣是使用訊號
    db.submission.groupBy({
      by: ['studentId'],
      _max: { submittedAt: true },
      where: { studentId: { in: studentIds }, submittedAt: { not: null } },
    }),
  ]);

  const map = new Map<string, Date>();
  const keepLatest = (studentId: string | null | undefined, at: Date | null | undefined) => {
    if (!studentId || !at) return;
    const existing = map.get(studentId);
    if (!existing || at.getTime() > existing.getTime()) map.set(studentId, at);
  };

  for (const row of loginAgg) keepLatest(row.userId, row._max.loginAt);
  for (const row of practiceAgg) keepLatest(row.studentId, row._max.startedAt);
  for (const row of draftAgg) keepLatest(row.studentId, row._max.updatedAt);
  for (const row of submissionAgg) keepLatest(row.studentId, row._max.submittedAt);

  return map;
}

/**
 * Most-practised difficulty per student ("remedial" | "core" | "challenge").
 * Exposes high-accuracy-but-too-easy patterns at a glance.
 */
export async function getDominantDifficultyMap(studentIds: string[]): Promise<Map<string, string>> {
  if (studentIds.length === 0) return new Map();
  const agg = await db.practiceSession.groupBy({
    by: ['studentId', 'difficulty'],
    _count: { _all: true },
    where: { studentId: { in: studentIds } },
  });
  const counts = new Map<string, Map<string, number>>();
  for (const row of agg) {
    if (!counts.has(row.studentId)) counts.set(row.studentId, new Map());
    counts.get(row.studentId)!.set(row.difficulty, row._count._all);
  }
  const result = new Map<string, string>();
  for (const [studentId, diffMap] of counts) {
    if (diffMap.size > 0) {
      result.set(studentId, [...diffMap.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    }
  }
  return result;
}

// ============================================
// 極短寫作偵測（Sprint 133）— 暴露「只交極短」的遊戲化寫作
// ============================================

/** 字數低於此門檻的寫作視為「極短」（DSE Part B 為 400 字） */
export const SHORT_WRITING_THRESHOLD_WORDS = 100;

/**
 * 純函數：計算每名學生極短寫作篇數（**規則的參考實作**，可單元測試）。
 *
 * 規則（`getShortWritingCounts()` 的 SQL 版本必須完全一致）：
 * - 只計非空白草稿（`draft.trim() !== ''`）
 * - 以 `/\s+/` 切詞，`0 < 字數 < SHORT_WRITING_THRESHOLD_WORDS`
 */
export function countShortWritings(drafts: Array<{ studentId: string; draft: string }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of drafts) {
    const words = d.draft.trim().split(/\s+/).filter(Boolean).length;
    if (words > 0 && words < SHORT_WRITING_THRESHOLD_WORDS) {
      map.set(d.studentId, (map.get(d.studentId) ?? 0) + 1);
    }
  }
  return map;
}

/**
 * 每名學生極短寫作篇數（非空白草稿）。
 *
 * 2026-09-21 稽核：改在資料庫端計數，只回傳 (studentId, count)。
 * 舊碼把每個學生的每一份草稿**全文**載入 Node，令教師頁面每次載入都傳輸
 * 數 MB 的作文內容（且僅為了一個計數）。切詞規則與 `countShortWritings()`
 * 相同（空白切分、排除空白草稿、嚴格小於門檻）。
 */
export async function getShortWritingCounts(studentIds: string[]): Promise<Map<string, number>> {
  if (studentIds.length === 0) return new Map();
  try {
    const rows = await db.$queryRaw<Array<{ studentId: string; count: number }>>`
      SELECT "studentId", COUNT(*)::int AS count
      FROM "WritingDraft"
      WHERE "studentId" IN (${Prisma.join(studentIds)})
        AND btrim("draft") <> ''
        AND array_length(regexp_split_to_array(btrim("draft"), '\\s+'), 1) < ${SHORT_WRITING_THRESHOLD_WORDS}
      GROUP BY "studentId"
    `;
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.studentId, Number(row.count));
    }
    return map;
  } catch (err) {
    // Fail-open：DB 端計數失敗（例如正規表達式函式不可用）時，退回參考實作。
    // 代價是重新載入草稿全文，但**不會**令教師頁面整體失敗，也不會改變計數語意。
    logger.warn(
      { module: 'activity-service', error: err instanceof Error ? err.message : String(err), students: studentIds.length },
      'DB-side short-writing count failed — falling back to in-memory reference implementation',
    );
    const drafts = await db.writingDraft.findMany({
      where: { studentId: { in: studentIds }, draft: { not: '' } },
      select: { studentId: true, draft: true },
    });
    return countShortWritings(drafts);
  }
}
