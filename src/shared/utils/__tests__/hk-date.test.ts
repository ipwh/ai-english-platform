// ============================================
// 香港日界線工具測試（2026-09-20 稽核：UTC 日界線令連續天數失真）
// ============================================
import { describe, it, expect } from 'vitest';
import {
  HK_OFFSET_MS,
  DAY_MS,
  hkDayKey,
  hkToday,
  hkDaysAgo,
  hkDayStartUtc,
  hkStartOfDay,
  hkWeekStartUtc,
  hkDayOfWeek,
  hkWeekStartMondayUtc,
  previousDayKey,
} from '../hk-date';

describe('hkDayKey — UTC → 香港日', () => {
  it('香港 07:33（UTC 前一日 23:33）屬於香港當日，非前一日', () => {
    // 2026-09-20 07:33 HKT === 2026-09-19T23:33Z
    expect(hkDayKey('2026-09-19T23:33:00Z')).toBe('2026-09-20');
  });

  it('UTC 16:00 起跨入下一個香港日', () => {
    expect(hkDayKey('2026-09-19T15:59:59Z')).toBe('2026-09-19');
    expect(hkDayKey('2026-09-19T16:00:00Z')).toBe('2026-09-20');
  });

  it('香港 00:00–07:59 的活動不會被歸入前一日', () => {
    expect(hkDayKey('2026-09-19T16:00:00Z')).toBe('2026-09-20'); // HK 00:00
    expect(hkDayKey('2026-09-19T23:59:00Z')).toBe('2026-09-20'); // HK 07:59
    expect(hkDayKey('2026-09-20T00:00:00Z')).toBe('2026-09-20'); // HK 08:00
  });

  it('接受 Date / number / string', () => {
    const date = new Date('2026-09-19T23:33:00Z');
    expect(hkDayKey(date)).toBe('2026-09-20');
    expect(hkDayKey(date.getTime())).toBe('2026-09-20');
    expect(hkDayKey('2026-09-19T23:33:00Z')).toBe('2026-09-20');
  });
});

describe('hkDayStartUtc / hkStartOfDay — 供 DB 範圍查詢', () => {
  it('香港日的 00:00 等於前一日 UTC 16:00', () => {
    expect(hkDayStartUtc('2026-09-20').toISOString()).toBe('2026-09-19T16:00:00.000Z');
  });

  it('hkStartOfDay 回傳當日香港 00:00（UTC 表達）', () => {
    const now = new Date('2026-09-19T23:33:00Z'); // HK 09-20 07:33
    expect(hkStartOfDay(now).toISOString()).toBe('2026-09-19T16:00:00.000Z');
  });

  it('hkToday / hkDaysAgo 以香港日為準', () => {
    const now = new Date('2026-09-19T23:33:00Z');
    expect(hkToday(now)).toBe('2026-09-20');
    expect(hkDaysAgo(6, now)).toBe('2026-09-14');
  });

  it('hkWeekStartUtc(6) = 6 日前香港日的 00:00', () => {
    const now = new Date('2026-09-19T23:33:00Z');
    expect(hkWeekStartUtc(6, now).toISOString()).toBe('2026-09-13T16:00:00.000Z'); // HK 09-14 00:00
  });
});

describe('previousDayKey — 日 key 算術（無時區/DST 影響）', () => {
  it('跨月與跨年邊界', () => {
    expect(previousDayKey('2026-09-01')).toBe('2026-08-31');
    expect(previousDayKey('2026-01-01')).toBe('2025-12-31');
    expect(previousDayKey('2026-03-01')).toBe('2026-02-28');
  });

  it('常數自洽', () => {
    expect(HK_OFFSET_MS).toBe(8 * 60 * 60 * 1000);
    expect(DAY_MS).toBe(86_400_000);
  });
});

describe('hkWeekStartMondayUtc — 每週快照的香港週一界線', () => {
  it('香港週一 00:00 回傳為 UTC（星期日 16:00Z）', () => {
    // 2026-09-19T23:33Z = 香港 2026-09-20（星期日）07:33
    const now = new Date('2026-09-19T23:33:00Z');
    expect(hkDayOfWeek(now)).toBe(0); // 星期日
    expect(hkWeekStartMondayUtc(now).toISOString()).toBe('2026-09-13T16:00:00.000Z'); // 香港 09-14（週一）00:00
  });

  it('週一當日不倒退（週界線為當日 00:00）', () => {
    // 香港 2026-09-14（週一）09:00 = 2026-09-14T01:00Z
    const monday = new Date('2026-09-14T01:00:00Z');
    expect(hkDayOfWeek(monday)).toBe(1);
    expect(hkWeekStartMondayUtc(monday).toISOString()).toBe('2026-09-13T16:00:00.000Z');
  });

  it('香港日界線決定週歸屬：UTC 週日晚上仍是香港週一早上', () => {
    // 2026-09-13T18:00Z = 香港 09-14（週一）02:00 → 屬新一週
    const hkMondayEarly = new Date('2026-09-13T18:00:00Z');
    expect(hkDayKey(hkMondayEarly)).toBe('2026-09-14');
    expect(hkWeekStartMondayUtc(hkMondayEarly).toISOString()).toBe('2026-09-13T16:00:00.000Z');
  });
});
