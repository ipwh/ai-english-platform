// ============================================
// class-stats-service 測試 — 教師主頁班級練習數據聚合
// ============================================
// 契約重點（2026-10-01 用戶回報修正）：
// - 全校所有班別（不再由 UI 端 `slice(0, 8)`）
// - 名單＝User.classId ∪ StudentClass（去重）；排除 Demo 由查詢負責
// - 累積走正典 `aggregateVerifiedTotalsForStudents`（單一 SQL、每生一列）
// - 「無資料 ≠ 0」：無已驗證證據 ⇒ accuracy = null；空名單 ⇒ participationRate = null
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({
  classFindMany: vi.fn(),
  userFindMany: vi.fn(),
  studentClassFindMany: vi.fn(),
  aggregateVerifiedTotalsForStudents: vi.fn(),
}));

vi.mock('@/shared/db/db', () => ({
  db: {
    class: { findMany: mocks.classFindMany },
    user: { findMany: mocks.userFindMany },
    studentClass: { findMany: mocks.studentClassFindMany },
  },
}));

vi.mock('@/modules/exercise/services/practice-history-service', () => ({
  aggregateVerifiedTotalsForStudents: mocks.aggregateVerifiedTotalsForStudents,
}));

import { getClassPracticeStats } from '../services/class-stats-service';

/** 簡化版的 StudentCumulativeTotals（單元測試只關心這幾個欄位） */
function totals(sessionsCount: number, verifiedTotalQuestions: number, verifiedCorrectCount: number) {
  return { sessionsCount, verifiedTotalQuestions, verifiedCorrectCount };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.classFindMany.mockResolvedValue([]);
  mocks.userFindMany.mockResolvedValue([]);
  mocks.studentClassFindMany.mockResolvedValue([]);
  mocks.aggregateVerifiedTotalsForStudents.mockResolvedValue(new Map());
});

describe('getClassPracticeStats', () => {
  it('沒有任何班別時直接回傳空陣列（不查學生）', async () => {
    const result = await getClassPracticeStats();
    expect(result).toEqual([]);
    expect(mocks.userFindMany).not.toHaveBeenCalled();
    expect(mocks.aggregateVerifiedTotalsForStudents).not.toHaveBeenCalled();
  });

  it('彙總每班名單（主班級 ∪ 混合上課）、參與人數、完成次數、參與率與已驗證正確率', async () => {
    mocks.classFindMany.mockResolvedValue([
      { id: 'c1', name: '1A', gradeLevel: 'S1' },
      { id: 'c2', name: '2B', gradeLevel: 'S2' },
      { id: 'c3', name: '3C', gradeLevel: 'S3' },
    ]);
    mocks.userFindMany.mockResolvedValue([
      { id: 's1', classId: 'c1' },
      { id: 's2', classId: 'c1' },
      { id: 's3', classId: 'c2' },
    ]);
    // s1 同時經 StudentClass 出現於 c1（模擬混合上課）→ 必須去重；
    // s4 只經 StudentClass 加入 c1
    mocks.studentClassFindMany.mockResolvedValue([
      { studentId: 's1', classId: 'c1' },
      { studentId: 's4', classId: 'c1' },
    ]);
    mocks.aggregateVerifiedTotalsForStudents.mockResolvedValue(new Map([
      ['s1', totals(3, 10, 8)], // 80%
      // s2 無任何場次 → 不參與
      ['s3', totals(1, 2, 1)],  // 50%
    ]));

    const result = await getClassPracticeStats();

    // 每班一列（含沒有學生的 c3），供 UI 呈現「全校所有班別」
    expect(result).toHaveLength(3);
    expect(result).toEqual([
      {
        classId: 'c1', className: '1A', gradeLevel: 'S1',
        studentCount: 3, participantCount: 1, participationRate: 33,
        sessionsCount: 3, accuracy: 80,
      },
      {
        classId: 'c2', className: '2B', gradeLevel: 'S2',
        studentCount: 1, participantCount: 1, participationRate: 100,
        sessionsCount: 1, accuracy: 50,
      },
      {
        // 名單為空 ⇒ 參與率／正確率一律 null（顯示「—」），不得顯示 0%
        classId: 'c3', className: '3C', gradeLevel: 'S3',
        studentCount: 0, participantCount: 0, participationRate: null,
        sessionsCount: 0, accuracy: null,
      },
    ]);

    // 正典批次投影：只搬「每名學生一列」，且學生 id 去重
    expect(mocks.aggregateVerifiedTotalsForStudents).toHaveBeenCalledTimes(1);
    const passedIds = mocks.aggregateVerifiedTotalsForStudents.mock.calls[0][0] as string[];
    expect([...passedIds].sort()).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('無可驗證證據時 accuracy = null（「無資料 ≠ 0%」），參與與場次照常計算', async () => {
    mocks.classFindMany.mockResolvedValue([{ id: 'c1', name: '1A', gradeLevel: 'S1' }]);
    mocks.userFindMany.mockResolvedValue([{ id: 's1', classId: 'c1' }]);
    mocks.studentClassFindMany.mockResolvedValue([]);
    // 有 4 場練習但全部是不可驗證舊列（verified = 0）→ 不得顯示 0%
    mocks.aggregateVerifiedTotalsForStudents.mockResolvedValue(new Map([
      ['s1', totals(4, 0, 0)],
    ]));

    const [stats] = await getClassPracticeStats();
    expect(stats.participantCount).toBe(1);
    expect(stats.sessionsCount).toBe(4);
    expect(stats.accuracy).toBeNull();
    expect(stats.participationRate).toBe(100);
  });

  it('排序：年級（S1→S6）→ 同級按班名', async () => {
    mocks.classFindMany.mockResolvedValue([
      { id: 'c2', name: '2B', gradeLevel: 'S2' },
      { id: 'c1b', name: '1B', gradeLevel: 'S1' },
      { id: 'c1a', name: '1A', gradeLevel: 'S1' },
      { id: 'cx', name: 'X1', gradeLevel: 'Other' },
    ]);

    const result = await getClassPracticeStats();
    expect(result.map(row => row.className)).toEqual(['1A', '1B', '2B', 'X1']);
  });
});

// ============================================
// 教師主頁「各班級練習總覽」顯示契約（source scan）
// ============================================
// 2026-10-07 用戶回報：「各班級練習總覽沒有練習次數的標示，只有正確率」。
// 練習次數（`sessionsCount`）必須同時出現在長條圖與明細表 —— 圖表不得只留比率。
describe('teacher dashboard — class practice overview shows the practice count', () => {
  const page = readFileSync(
    resolve(import.meta.dirname, '../../../../../src/app/teacher/dashboard/page.tsx'),
    'utf-8',
  );

  it('長條圖畫出練習次數，並使用獨立的右軸（單位是「次」而非百分比）', () => {
    expect(page).toContain('dataKey="sessionsCount"');
    expect(page).toContain("name={t('teacher.classStats.completions')}");
    // 0-100% 的軸會把次數壓平 → 必須另設右軸
    expect(page).toMatch(/<YAxis yAxisId="count" orientation="right"/);
    // 使用 yAxisId 後每個 YAxis／Bar 都必須指定軸，否則 Recharts 不渲染
    expect(page).toContain('yAxisId="rate"');
  });

  it('明細表保留「完成次數」欄', () => {
    expect(page).toContain("{t('teacher.classStats.completions')}</th>");
    expect(page).toContain('{c.sessionsCount}');
  });
});
