// ============================================
// 練習歷史顯示格式化測試（2026-10-01）
// ============================================
// 學生「我的進度」與教師「學生詳情」共用此模組。主要契約：
//   1. 月／日標籤以香港日 key 解析、固定 UTC 顯示 —— 不得因瀏覽器時區位移一天；
//   2. 場次時間一律以香港時區顯示（執行環境時區不影響結果）。
import { describe, it, expect } from 'vitest';
import { formatHistoryMonthLabel, formatHistoryDayLabel, formatHistoryTime } from '../practice-history-format';

describe('practice-history-format — 月／日標籤', () => {
  it('月標籤：英文與中文皆可讀', () => {
    expect(formatHistoryMonthLabel('2026-10', 'en')).toContain('October 2026');
    expect(formatHistoryMonthLabel('2026-10', 'zh')).toContain('2026');
  });

  it('日標籤固定以 UTC 解析 HK 日 key（不會位移一天）', () => {
    // 2026-10-01 是香港日 key；若以本地時區解析，西半球時區會顯示 9 月 30 日
    expect(formatHistoryDayLabel('2026-10-01', 'en')).toContain('Oct 1');
    expect(formatHistoryDayLabel('2026-10-01', 'zh')).toContain('10月1日');
  });
});

describe('practice-history-format — 場次時間（香港時區）', () => {
  it('UTC 16:30 = 香港 00:30（不隨執行環境時區改變）', () => {
    // CI（UTC）若少了 timeZone 選項會得到 16:30；香港環境則一直正確 ——
    // 兩種時區下都必須是香港 00:30（12 小時制為 上午12:30）。
    expect(formatHistoryTime('2026-09-30T16:30:00.000Z')).toMatch(/(00|12):30/);
  });
});
