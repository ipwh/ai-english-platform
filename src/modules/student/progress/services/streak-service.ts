// ============================================
// Streak Service — 香港日界線的連續練習天數
// ============================================
// 口徑（Sprint 133 起）：一個「活躍日」＝ 當日至少完成一次練習。
// 只登入、零練習不加成（避免加成無限上漲）；`streakBonus` 亦只隨練習日遞增。
//
// 2026-09-20 稽核修正（兩項，皆為 DB 實證）：
// 1. **日界線改香港日**（`shared/utils/hk-date.ts`）。舊碼以 `toISOString().slice(0,10)`
//    當「今日／昨日」（UTC 日）→ 香港早上 07:00 的練習被算成前一日 UTC，
//    相鄰兩香港日塌縮成同一 UTC 日 → 假缺口：一名連續 6 天（香港日）練習的
//    學生被顯示為連續 1 天。
// 2. **移除 `take: 90` 截斷**。舊碼只讀最新 90 場練習，爆量學生（45–98 場／日）
//    的視窗只覆蓋 1–2 個日曆日 → 連續天數被壓成 1–2，且練習量越大數字越小
//    （用戶回報「一日比一日少」）。改為日期界線查詢（`STREAK_LOOKBACK_DAYS` 日）。
//
// 註：`LoginLog` 在生產環境**從未被寫入**（2026-09-20 實測全庫 0 列；唯一
// writer `/api/admin/login-logs` POST 無前端呼叫者），故此服務只以練習訊號
// 為準；`User.streakDays` 因此語意為「連續練習天數」。
// ============================================

import { ProgressRepo, StudentRepo } from '@/modules/repositories';
import { hkDayKey, hkDaysAgo, hkDayStartUtc, hkToday, previousDayKey } from '@/shared/utils/hk-date';

/** 連續天數回溯上限（日）—— 日期界線，取代舊有的「最新 N 筆」截斷。 */
export const STREAK_LOOKBACK_DAYS = 400;

/**
 * 由「活躍日 key 清單」計算連續天數（純函式，方便測試）。
 * - 連續天數必須包含今日或昨日，否則視為已中斷（0）。
 * - 只接受嚴格相鄰的日 key（`YYYY-MM-DD`，無時分秒歧義，無 DST 問題）。
 */
export function countStreak(dayKeys: Iterable<string>, todayKey: string): number {
  const unique = Array.from(new Set(dayKeys)).sort().reverse();
  if (unique.length === 0) return 0;
  if (unique[0] !== todayKey && unique[0] !== previousDayKey(todayKey)) return 0;

  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    if (unique[i] !== previousDayKey(unique[i - 1])) break;
    streak++;
  }
  return streak;
}

/** 回溯期內的練習活躍日（香港日 key；未排序、未去重） */
async function getPracticeDayKeys(studentId: string, now: Date): Promise<string[]> {
  const since = hkDayStartUtc(hkDaysAgo(STREAK_LOOKBACK_DAYS, now));
  const sessions = await ProgressRepo.listPracticeStartedAtSince(studentId, since);
  return sessions.map((s) => hkDayKey(s.startedAt));
}

/**
 * 連續練習天數 + 最後活躍日（`lastActiveDate` 為香港日 key）。
 * 與 `calculatePracticeStreak` 同源，避免兩套口徑漂移。
 */
export async function calculateStudentStreak(studentId: string): Promise<{
  streakDays: number;
  lastActiveDate: string | null;
}> {
  const dayKeys = await getPracticeDayKeys(studentId, new Date());
  const latest = Array.from(new Set(dayKeys)).sort().reverse()[0] ?? null;
  return { streakDays: countStreak(dayKeys, hkToday()), lastActiveDate: latest };
}

/**
 * Update the user's streakDays field in DB.
 * Called after login or practice session completion.
 */
export async function syncUserStreak(studentId: string): Promise<number> {
  const { streakDays } = await calculateStudentStreak(studentId);
  await StudentRepo.updateUserStreak(studentId, streakDays);
  return streakDays;
}

/**
 * 練習連續天數 — 只計有練習的日子（Sprint 133），日界線為香港日。
 * `now` 可注入以便測試；與 `calculateStudentStreak` 共用 `countStreak` 口徑。
 */
export async function calculatePracticeStreak(studentId: string, now: Date = new Date()): Promise<number> {
  return countStreak(await getPracticeDayKeys(studentId, now), hkToday(now));
}