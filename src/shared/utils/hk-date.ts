// ============================================
// 香港時區日界線（HK Day Keys）— 單一 Owner
// ============================================
// 平台服務香港學校（UTC+8，無夏令時間）。所有「日」的判定 ——
// 連續天數、活躍日、每週界線、每日目標、今日 XP —— 一律以香港日為準。
//
// 2026-09-20 稽核（DB 實證）：舊碼散落使用 `toISOString().slice(0, 10)`（UTC 日），
// 香港早上 07:00 的活動被歸入前一日 UTC，令相鄰兩香港日塌縮成同一 UTC 日 →
// 產生假缺口：一名連續 6 天（香港日）練習的學生被顯示連續 1 天。
//
// 規則：業務程式碼**不得**再以 `toISOString().slice(0, 10)` 當作「日」使用，
// 一律經此模組取得香港日 key。
// ============================================

/** 香港與 UTC 的固定偏移（毫秒）。香港不實行夏令時間。 */
export const HK_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 一日毫秒數（日界線運算用；香港日無 DST，故此值恆定） */
export const DAY_MS = 24 * 60 * 60 * 1000;

function toMillis(at: Date | string | number): number {
  if (at instanceof Date) return at.getTime();
  if (typeof at === 'number') return at;
  return new Date(at).getTime();
}

/** 任一時間 → 香港日 key（`YYYY-MM-DD`） */
export function hkDayKey(at: Date | string | number): string {
  return new Date(toMillis(at) + HK_OFFSET_MS).toISOString().slice(0, 10);
}

/** 現在（或指定時刻）所屬的香港日 key */
export function hkToday(now: Date = new Date()): string {
  return hkDayKey(now);
}

/** n 日前的香港日 key（n = 0 即今日） */
export function hkDaysAgo(n: number, now: Date = new Date()): string {
  return hkDayKey(now.getTime() - n * DAY_MS);
}

/** 香港日 key → 該日 00:00（香港時間）對應的 UTC 時刻，供 DB 範圍查詢 */
export function hkDayStartUtc(dayKey: string): Date {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) - HK_OFFSET_MS);
}

/** 指定時刻所屬香港日的 00:00（回傳 UTC Date，可直接作 Prisma gte 條件） */
export function hkStartOfDay(now: Date = new Date()): Date {
  return hkDayStartUtc(hkDayKey(now));
}

/** 本週起點（香港日界線）：預設往前 6 日 = 7 日窗口，回傳 UTC Date */
export function hkWeekStartUtc(daysBack = 6, now: Date = new Date()): Date {
  return hkStartOfDay(new Date(now.getTime() - daysBack * DAY_MS));
}

/** 日 key 的前一日（純日期運算，與時區無關） */
export function previousDayKey(dayKey: string): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/** 現在（或指定時刻）所屬的香港月 key（`YYYY-MM`） */
export function hkMonthKey(now: Date = new Date()): string {
  return hkDayKey(now).slice(0, 7);
}

/** `YYYY-MM` → 下一個月 key（純字串運算，與時區無關） */
export function nextMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const next = month === 12 ? [year + 1, 1] : [year, month + 1];
  return `${next[0]}-${String(next[1]).padStart(2, '0')}`;
}

/** `YYYY-MM` → 上一個月 key（純字串運算，與時區無關） */
export function previousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const prev = month === 1 ? [year - 1, 12] : [year, month - 1];
  return `${prev[0]}-${String(prev[1]).padStart(2, '0')}`;
}

/** `YYYY-MM` → 該月 1 日香港 00:00 對應的 UTC 時刻（月範圍查詢起點） */
export function hkMonthStartUtc(monthKey: string): Date {
  return hkDayStartUtc(`${monthKey}-01`);
}

/** 香港日的星期（0 = 星期日 … 6 = 星期六）—— 取香港「日期」的星期，非該 UTC 時刻的星期 */
export function hkDayOfWeek(now: Date = new Date()): number {
  return new Date(`${hkDayKey(now)}T00:00:00Z`).getUTCDay();
}

/**
 * 本週（香港）週一 00:00，回傳 UTC Date。
 * 供每週快照的週界線使用 —— 舊碼用 `toISOString().slice(0,10)` 的 UTC 週一。
 */
export function hkWeekStartMondayUtc(now: Date = new Date()): Date {
  return new Date(hkStartOfDay(now).getTime() - ((hkDayOfWeek(now) + 6) % 7) * DAY_MS);
}
