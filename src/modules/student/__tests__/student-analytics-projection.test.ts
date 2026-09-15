// ============================================
// 2026-09-15: 教師端逐題檢視 — 答案投影回歸測試
//
// 背景：R3.10-C 把 getStudentAnalytics().sessions[].answers 的 select 收窄成
// 「只有驗證欄位」（questionId/result/scores/authority），但
// `teacher/students/[studentId]` 仍直接讀 a.questionPrompt →
// 展開任何一筆練習紀錄都會令整頁被 error boundary 接住：
//   Cannot read properties of undefined (reading 'substring')
//
// 本測試鎖定投影同時帶「驗證證據」與「顯示資料」，兩者不得互相取代。
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({
  practiceSessionFindMany: vi.fn(),
  mistakeFindMany: vi.fn(),
  vocabItemCount: vi.fn(),
  writingDraftFindMany: vi.fn(),
  xpTransactionFindMany: vi.fn(),
  weeklySnapshotFindMany: vi.fn(),
  submissionFindMany: vi.fn(),
}));

vi.mock('@/shared/db/db', () => ({
  db: {
    practiceSession: { findMany: mocks.practiceSessionFindMany },
    mistake: { findMany: mocks.mistakeFindMany },
    vocabItem: { count: mocks.vocabItemCount },
    writingDraft: { findMany: mocks.writingDraftFindMany },
    xpTransaction: { findMany: mocks.xpTransactionFindMany },
    weeklySnapshot: { findMany: mocks.weeklySnapshotFindMany },
    submission: { findMany: mocks.submissionFindMany },
  },
}));

import { getStudentAnalytics } from '../repositories/user-repo';

/** 取第一次 practiceSession.findMany 的 select.answers.select */
async function answerSelect() {
  mocks.practiceSessionFindMany.mockResolvedValue([]);
  await getStudentAnalytics('s1');
  const args = mocks.practiceSessionFindMany.mock.calls[0][0] as {
    select: { answers: { select: Record<string, boolean>; orderBy?: unknown } };
  };
  return args.select.answers;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mistakeFindMany.mockResolvedValue([]);
  mocks.vocabItemCount.mockResolvedValue(0);
  mocks.writingDraftFindMany.mockResolvedValue([]);
  mocks.xpTransactionFindMany.mockResolvedValue([]);
  mocks.weeklySnapshotFindMany.mockResolvedValue([]);
  mocks.submissionFindMany.mockResolvedValue([]);
});

describe('getStudentAnalytics — 逐題答案投影', () => {
  it('包含教師逐題檢視所需的顯示欄位', async () => {
    const { select } = await answerSelect();

    expect(select).toMatchObject({
      questionIndex: true,
      questionType: true,
      questionPrompt: true,
      correctAnswer: true,
      studentAnswer: true,
      isCorrect: true,
      timeSpent: true,
    });
  });

  it('保留全部 canonical 驗證證據欄位（顯示需求不得取代權威）', async () => {
    const { select } = await answerSelect();

    expect(select).toMatchObject({
      questionId: true,
      result: true,
      awardedScore: true,
      maxScore: true,
      countsTowardScore: true,
      scoredBy: true,
      scoringMethod: true,
    });
  });

  it('逐題答案依 questionIndex 排序（題號穩定，與畫面 Q1..Qn 一致）', async () => {
    const { orderBy } = await answerSelect();

    expect(orderBy).toEqual({ questionIndex: 'asc' });
  });
});

describe('教師逐題檢視頁面 — 不得對可能缺漏的欄位呼叫 String 方法', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../../../app/teacher/students/[studentId]/page.tsx'),
    'utf-8',
  );
  /** 註解會刻意提到舊寫法，比對時只看程式碼行 */
  const page = source
    .split('\n')
    .filter(line => !/^\s*(\*|\/\/)/.test(line))
    .join('\n');

  it('不再對 questionPrompt 呼叫 substring', () => {
    expect(page).not.toMatch(/questionPrompt\.substring/);
    expect(page).not.toMatch(/questionPrompt\.length/);
  });

  it('改用 fail-safe 的 displayPrompt 助手', () => {
    expect(page).toContain('function displayPrompt');
    expect(page).toContain('displayPrompt(');
  });

  it('題號與答案缺漏時有明確後備值', () => {
    expect(page).toContain("typeof a.questionIndex === 'number'");
    expect(page).toContain("(a.studentAnswer ?? '').trim()");
    expect(page).toContain("(a.correctAnswer ?? '').trim()");
  });

  it('開放式題目（ungradable）不顯示「回答錯誤」', () => {
    expect(page).toContain("a.result === 'ungradable'");
    expect(page).toContain("不自動評分");
  });
});
