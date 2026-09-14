// ============================================
// 2026-09-14: /api/mistakes — 技能歸屬邊界測試
//
// 證明：
//   1. 正典題目定義永遠覆寫客戶端自報的技能（不可偽造）
//   2. 解析不到時才接受白名單內的自報值，並標記 skillSource
//   3. 空摘要錯題不再被 GET 過濾隱藏（舊版會整批消失）
//   4. GET 回傳技能／題型弱項聚合
// ============================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyApiAuth: vi.fn(),
  createMistakeIfAbsent: vi.fn(),
  findMistakeByQuestion: vi.fn(),
  listMistakes: vi.fn(),
  resolveReadingQuestionDefinitions: vi.fn(),
  resolveGrammarQuestionDefinitions: vi.fn(),
}));

vi.mock('@/shared/auth/api-auth', () => ({
  verifyApiAuth: mocks.verifyApiAuth,
}));

vi.mock('@/modules/repositories', () => ({
  MistakeRepo: {
    createMistakeIfAbsent: mocks.createMistakeIfAbsent,
    findMistakeByQuestion: mocks.findMistakeByQuestion,
    listMistakes: mocks.listMistakes,
  },
}));

vi.mock('@/modules/admin/services/admin-operations', () => ({
  adminDbQuery: vi.fn(),
}));

vi.mock('@/modules/reading/services/reading-question-service', () => ({
  resolveReadingQuestionDefinitions: mocks.resolveReadingQuestionDefinitions,
}));

vi.mock('@/modules/exercise/services/grammar-question-service', () => ({
  resolveGrammarQuestionDefinitions: mocks.resolveGrammarQuestionDefinitions,
}));

import * as mistakesRoute from '../mistakes/route';

const studentA = { authenticated: true, userId: 'student-A', role: 'student' };

function post(url: string, body: unknown): NextRequest {
  return new NextRequest(url, { method: 'POST', body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyApiAuth.mockResolvedValue(studentA);
  mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map());
  mocks.resolveGrammarQuestionDefinitions.mockResolvedValue(new Map());
  mocks.createMistakeIfAbsent.mockResolvedValue({ inserted: true });
  mocks.findMistakeByQuestion.mockResolvedValue({ id: 'm1' });
  mocks.listMistakes.mockResolvedValue([]);
});

describe('POST /api/mistakes — 技能歸屬', () => {
  it('正典閱讀題目覆寫客戶端自報的技能與題型', async () => {
    mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map([
      ['rq-1', {
        id: 'rq-1',
        questionType: 'reference',
        dseType: 'reference',
        questionText: 'What does "they" refer to?',
        choices: null,
        answer: 'the protesters',
        marks: 1,
        orderIndex: 0,
      }],
    ]));

    const res = await mistakesRoute.POST(post('http://localhost/api/mistakes', {
      studentId: 'student-A',
      questionId: 'rq-1',
      studentAnswer: 'B',
      correctAnswer: 'A',
      mistakeType: 'grammar',
      // 客戶端自報假技能 — 必須被忽略
      languageSkill: 'writing',
      questionType: 'inference',
    }));

    expect(res.status).toBe(201);
    expect(mocks.createMistakeIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      languageSkill: 'reading',
      questionType: 'reference',
      skillSource: 'canonical',
      questionSummary: 'What does "they" refer to?',
      mistakeType: 'comprehension',
    }));
  });

  it('無法解析時採用白名單自報值並標記 client-claimed', async () => {
    await mistakesRoute.POST(post('http://localhost/api/mistakes', {
      studentId: 'student-A',
      questionId: 'ai-1750000000000-0',
      studentAnswer: 'A',
      correctAnswer: 'B',
      mistakeType: 'comprehension',
      languageSkill: 'listening',
      questionType: 'detail',
      questionSummary: '  What time does the tour start?  ',
    }));

    expect(mocks.createMistakeIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      languageSkill: 'listening',
      questionType: 'detail',
      grammarItem: null,
      skillSource: 'client-claimed',
      questionSummary: 'What time does the tour start?',
    }));
  });

  it('自報值不在白名單 → 丟棄並標記 unresolved', async () => {
    await mistakesRoute.POST(post('http://localhost/api/mistakes', {
      studentId: 'student-A',
      questionId: 'ai-1750000000000-1',
      studentAnswer: 'A',
      correctAnswer: 'B',
      mistakeType: 'not-a-type',
      languageSkill: 'hacking',
      questionType: 'DROP TABLE',
    }));

    expect(mocks.createMistakeIfAbsent).toHaveBeenCalledWith(expect.objectContaining({
      languageSkill: null,
      questionType: null,
      skillSource: 'unresolved',
      mistakeType: 'grammar',
      questionSummary: '',
    }));
  });

  it('解析器發生錯誤時仍記錄錯題（fail-open）', async () => {
    mocks.resolveReadingQuestionDefinitions.mockRejectedValue(new Error('db down'));

    const res = await mistakesRoute.POST(post('http://localhost/api/mistakes', {
      studentId: 'student-A',
      questionId: 'q-err',
      studentAnswer: 'A',
      correctAnswer: 'B',
      mistakeType: 'grammar',
    }));

    expect(res.status).toBe(201);
    expect(mocks.createMistakeIfAbsent).toHaveBeenCalledTimes(1);
  });

  it('跨用戶新增仍被攔截', async () => {
    const res = await mistakesRoute.POST(post('http://localhost/api/mistakes', {
      studentId: 'student-B',
      questionId: 'q1',
      studentAnswer: 'A',
      correctAnswer: 'B',
    }));

    expect(res.status).toBe(403);
    expect(mocks.createMistakeIfAbsent).not.toHaveBeenCalled();
  });
});

describe('GET /api/mistakes — 列表與弱項聚合', () => {
  it('空摘要錯題仍然回傳（不再被去重過濾隱藏）', async () => {
    mocks.listMistakes.mockResolvedValue([
      {
        id: 'm1', studentId: 'student-A', questionId: 'q1', questionSummary: '',
        studentAnswer: 'A', correctAnswer: 'B', mistakeType: 'grammar',
        languageSkill: null, grammarItem: null, questionType: null, skillSource: 'unresolved',
        reviewed: false, inReviewList: false, aiExplanation: null,
        createdAt: new Date('2026-09-10T00:00:00Z'),
      },
    ]);

    const res = await mistakesRoute.GET(new NextRequest('http://localhost/api/mistakes?studentId=student-A'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.mistakes).toHaveLength(1);
    expect(json.mistakes[0].date).toBe('2026-09-10T00:00:00.000Z');
  });

  it('回傳技能／題型弱項聚合與策略卡', async () => {
    mocks.listMistakes.mockResolvedValue([
      {
        id: 'm1', studentId: 'student-A', questionId: 'rq-1', questionSummary: 'Q1',
        studentAnswer: 'A', correctAnswer: 'B', mistakeType: 'comprehension',
        languageSkill: 'reading', grammarItem: null, questionType: 'inference', skillSource: 'canonical',
        reviewed: false, inReviewList: false, aiExplanation: null,
        createdAt: new Date('2026-09-10T00:00:00Z'),
      },
      {
        id: 'm2', studentId: 'student-A', questionId: 'rq-2', questionSummary: 'Q2',
        studentAnswer: 'A', correctAnswer: 'B', mistakeType: 'comprehension',
        languageSkill: 'reading', grammarItem: null, questionType: 'inference', skillSource: 'canonical',
        reviewed: true, inReviewList: false, aiExplanation: null,
        createdAt: new Date('2026-09-12T00:00:00Z'),
      },
    ]);

    const res = await mistakesRoute.GET(new NextRequest('http://localhost/api/mistakes?studentId=student-A'));
    const json = await res.json();

    expect(json.breakdown).toHaveLength(1);
    expect(json.breakdown[0]).toMatchObject({
      key: 'reading:inference',
      count: 2,
      unreviewed: 1,
      replayable: false,
    });
    expect(json.breakdown[0].strategy.key).toBe('reading.inference');
  });

  it('跨用戶讀取仍被攔截', async () => {
    const res = await mistakesRoute.GET(new NextRequest('http://localhost/api/mistakes?studentId=student-B'));
    expect(res.status).toBe(403);
  });
});
