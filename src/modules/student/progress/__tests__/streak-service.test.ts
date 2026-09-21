// ============================================
// Migration regression tests — 連續天數（2026-09-20 稽核）
// ============================================
// 兩個已修缺陷的回歸守門：
//   A. 日界線用 UTC → 香港早上練習被算前一日，連續 6 天可顯示為 1。
//   B. 只讀最新 90 場 → 爆量學生（45–98 場／日）的視窗只覆蓋 1–2 日，
//      連續天數被壓成 1–2，且練習量越大數字越小（「一日比一日少」）。
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listPracticeStartedAtSince: vi.fn(),
  listPracticeStartedAtSinceForStudents: vi.fn(),
  updateUserStreak: vi.fn(),
}));

vi.mock('@/modules/repositories', () => ({
  ProgressRepo: {
    listPracticeStartedAtSince: mocks.listPracticeStartedAtSince,
    listPracticeStartedAtSinceForStudents: mocks.listPracticeStartedAtSinceForStudents,
  },
  StudentRepo: { updateUserStreak: mocks.updateUserStreak },
}));

import {
  countStreak,
  calculatePracticeStreak,
  calculateStudentStreak,
  syncUserStreak,
  getPracticeStreaksForStudents,
  STREAK_LOOKBACK_DAYS,
} from '../services/streak-service';
import { hkDayKey, hkDaysAgo, hkDayStartUtc } from '@/shared/utils/hk-date';

const STUDENT = 's1';
const session = (iso: string) => ({ startedAt: new Date(iso) });

/** now = 2026-09-19T23:33Z = 香港 2026-09-20 07:33 */
const NOW = new Date('2026-09-19T23:33:00Z');

/** 舊演算法（UTC 日 + 最新 90 場）—— 只用於證明回歸，不在生產使用。 */
function legacyStreakUtc(timestamps: readonly { startedAt: Date }[], now: Date): number {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const today = day(now);
  const yesterday = day(new Date(now.getTime() - 86400000));
  const dates = Array.from(new Set(timestamps.slice(0, 90).map((t) => day(t.startedAt)))).sort().reverse();
  if (dates.length === 0) return 0;
  if (dates[0] !== today && dates[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) / 86400000;
    if (diff <= 1.5) streak++;
    else break;
  }
  return streak;
}

describe('countStreak — 純函式口徑', () => {
  it('今日起連續 3 日 → 3', () => {
    expect(countStreak(['2026-09-20', '2026-09-19', '2026-09-18'], '2026-09-20')).toBe(3);
  });

  it('最後活躍為昨日仍算在內（未中斷）', () => {
    expect(countStreak(['2026-09-19', '2026-09-18'], '2026-09-20')).toBe(2);
  });

  it('最後活躍早於昨日 → 0', () => {
    expect(countStreak(['2026-09-17', '2026-09-16'], '2026-09-20')).toBe(0);
  });

  it('無資料 → 0；重複日 key 不重複計算', () => {
    expect(countStreak([], '2026-09-20')).toBe(0);
    expect(countStreak(['2026-09-20', '2026-09-20', '2026-09-19'], '2026-09-20')).toBe(2);
  });

  it('中間缺一日即中斷', () => {
    expect(countStreak(['2026-09-20', '2026-09-19', '2026-09-17'], '2026-09-20')).toBe(2);
  });
});

describe('A. 日界線：香港連續日不得因 UTC 分組而被誤判中斷', () => {
  beforeEach(() => vi.clearAllMocks());

  it('香港連續 6 日（含早上 07:00 練習）→ 6，而舊 UTC 演算法只給 1', async () => {
    // 香港日：09-14 20:00 / 09-15 / 09-16 / 09-17 20:00 / 09-18 07:00 / 09-19 20:00
    const timestamps = [
      '2026-09-19T12:00:00Z', // HK 09-19 20:00
      '2026-09-17T23:00:00Z', // HK 09-18 07:00 ← 舊碼算成 UTC 09-17（與下一筆塌縮）
      '2026-09-17T12:00:00Z', // HK 09-17 20:00
      '2026-09-16T12:00:00Z', // HK 09-16 20:00
      '2026-09-15T12:00:00Z', // HK 09-15 20:00
      '2026-09-14T12:00:00Z', // HK 09-14 20:00
    ].map(session);

    // 舊行為（回歸證據）：UTC 日 = 14,15,16,17,19（缺 09-18）→ 1
    expect(legacyStreakUtc(timestamps, NOW)).toBe(1);

    mocks.listPracticeStartedAtSince.mockResolvedValue(timestamps);
    await expect(calculatePracticeStreak(STUDENT, NOW)).resolves.toBe(6);
  });

  it('查詢使用香港日界線的回溯起點，且無任何 take 截斷', async () => {
    mocks.listPracticeStartedAtSince.mockResolvedValue([]);
    await calculatePracticeStreak(STUDENT, NOW);
    expect(mocks.listPracticeStartedAtSince).toHaveBeenCalledTimes(1);
    const [studentId, since] = mocks.listPracticeStartedAtSince.mock.calls[0] as [string, Date];
    expect(studentId).toBe(STUDENT);
    expect(since.toISOString()).toBe(hkDayStartUtc(hkDaysAgo(STREAK_LOOKBACK_DAYS, NOW)).toISOString());
  });
});

describe('B. 視窗截斷：練習量再高都不得壓縮連續天數', () => {
  beforeEach(() => vi.clearAllMocks());

  it('香港單日 200 場 + 之前 4 日各 1 場 → 5（舊碼只看最新 90 場 → 1）', async () => {
    const todayBurst = Array.from({ length: 200 }, (_, i) =>
      session(`2026-09-19T${String(16 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`),
    ); // HK 09-20 00:00–07:59（全部同一香港日）
    const timestamps = [
      ...todayBurst,
      session('2026-09-19T10:00:00Z'), // HK 09-19
      session('2026-09-18T10:00:00Z'), // HK 09-18
      session('2026-09-17T10:00:00Z'), // HK 09-17
      session('2026-09-16T10:00:00Z'), // HK 09-16
    ];

    // 舊行為（回歸證據）：最新 90 場全部落在同一 UTC 日 → 1
    expect(legacyStreakUtc(timestamps, NOW)).toBe(1);

    mocks.listPracticeStartedAtSince.mockResolvedValue(timestamps);
    await expect(calculatePracticeStreak(STUDENT, NOW)).resolves.toBe(5);
  });

  it('calculateStudentStreak 與 calculatePracticeStreak 同源，lastActiveDate 為香港日 key', async () => {
    mocks.listPracticeStartedAtSince.mockResolvedValue([
      session(new Date().toISOString()),
      session(new Date(Date.now() - 86400000).toISOString()),
    ]);
    const result = await calculateStudentStreak(STUDENT);
    expect(result.streakDays).toBe(await calculatePracticeStreak(STUDENT));
    expect(result.lastActiveDate).toBe(hkDayKey(new Date()));
  });

  it('syncUserStreak 把同源結果寫入 DB', async () => {
    mocks.listPracticeStartedAtSince.mockResolvedValue([session(new Date().toISOString())]);
    mocks.updateUserStreak.mockResolvedValue(undefined);
    await expect(syncUserStreak(STUDENT)).resolves.toBe(1);
    expect(mocks.updateUserStreak).toHaveBeenCalledWith(STUDENT, 1);
  });

  it('無練習 → 0，lastActiveDate = null', async () => {
    mocks.listPracticeStartedAtSince.mockResolvedValue([]);
    await expect(calculateStudentStreak(STUDENT)).resolves.toEqual({ streakDays: 0, lastActiveDate: null });
  });
});

// ============================================
// 2026-09-21: 批次連續天數（教師／行政報表用）
// ============================================
// 病根：報表平均 `User.streakDays` 快取（只在學生載入 dashboard 時寫入）
// → 未載入者為 0、數值可能過期。批次版必須與學生端**同一個** countStreak
// 口徑（香港日界線、400 日回溯、嚴格相鄰）。
describe('getPracticeStreaksForStudents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('以單一查詢取得所有學生，並逐名套用同一個 countStreak', async () => {
    mocks.listPracticeStartedAtSinceForStudents.mockResolvedValue([
      { studentId: 's1', startedAt: new Date('2026-09-19T16:00:00Z') }, // HK 09-20
      { studentId: 's1', startedAt: new Date('2026-09-18T16:00:00Z') }, // HK 09-19
      { studentId: 's2', startedAt: new Date('2026-09-18T16:00:00Z') }, // HK 09-19（昨日 → 仍算連續）
      { studentId: 's3', startedAt: new Date('2026-09-01T16:00:00Z') }, // 已中斷
    ]);

    const result = await getPracticeStreaksForStudents(['s1', 's2', 's3'], NOW);

    expect(mocks.listPracticeStartedAtSinceForStudents).toHaveBeenCalledTimes(1);
    const [, since] = mocks.listPracticeStartedAtSinceForStudents.mock.calls[0] as [string[], Date];
    expect(since.toISOString()).toBe(hkDayStartUtc(hkDaysAgo(STREAK_LOOKBACK_DAYS, NOW)).toISOString());
    expect(result.get('s1')).toBe(2);
    expect(result.get('s2')).toBe(1);
    expect(result.get('s3')).toBe(0);
  });

  it('完全沒有練習記錄的學生不會出現在 map（呼叫端顯示 0 天）', async () => {
    mocks.listPracticeStartedAtSinceForStudents.mockResolvedValue([]);

    const result = await getPracticeStreaksForStudents(['s1'], NOW);

    expect(result.has('s1')).toBe(false);
  });

  it('空學生清單不查詢 DB', async () => {
    const result = await getPracticeStreaksForStudents([], NOW);
    expect(result.size).toBe(0);
    expect(mocks.listPracticeStartedAtSinceForStudents).not.toHaveBeenCalled();
  });

  it('與逐名 calculatePracticeStreak 的結果一致（同一口徑）', async () => {
    const rows = [
      { studentId: 's1', startedAt: new Date('2026-09-19T16:00:00Z') },
      { studentId: 's1', startedAt: new Date('2026-09-18T16:00:00Z') },
      { studentId: 's1', startedAt: new Date('2026-09-17T16:00:00Z') },
    ];
    mocks.listPracticeStartedAtSinceForStudents.mockResolvedValue(rows);
    mocks.listPracticeStartedAtSince.mockResolvedValue(rows.map(r => ({ startedAt: r.startedAt })));

    const bulk = await getPracticeStreaksForStudents(['s1'], NOW);
    const single = await calculatePracticeStreak('s1', NOW);

    expect(bulk.get('s1')).toBe(single);
  });
});
