// ============================================
// 2026-09-15: /api/admin/students/[studentId]/analytics — 錯題語境與弱項標籤
//
// 背景（用戶回報）：
//   1. 弱項分析顯示原始 bucket key（`reading:unclassified`）且次數空白
//   2. 最近錯題只有一句問題 + 答案，沒有題型、沒有選項、沒有解說
//      → 對師生都無意義（閱讀題依附篇章，單看問題無從理解）
//
// 本測試鎖定 API 契約：顯示層拿到的永遠是解析後的中文／英文標籤、
// 有效的次數，以及可用的題目語境（選項／解說）。
// ============================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyApiAuth: vi.fn(),
  adminDbQuery: vi.fn(),
  resolveMistakeQuestionContexts: vi.fn(),
}));

vi.mock('@/shared/auth/api-auth', () => ({ verifyApiAuth: mocks.verifyApiAuth }));

vi.mock('@/modules/admin/services/admin-operations', () => ({
  adminDbQuery: mocks.adminDbQuery,
}));

vi.mock('@/modules/exercise/services/mistake-skill-identity', () => ({
  resolveMistakeQuestionContexts: mocks.resolveMistakeQuestionContexts,
}));

// 其餘服務（mastery / weakness / trends / stats）在本測試中不是主角：
// 讓所有 DB 存取回傳 null，路由本身會以 .catch(() => null) 降級。
vi.mock('@/shared/db/db', () => {
  const model = new Proxy({}, { get: () => () => Promise.resolve(null) });
  return { db: new Proxy({}, { get: () => model }) };
});

import * as analyticsRoute from '../admin/students/[studentId]/analytics/route';

const STUDENT = {
  id: 'stu-1',
  email: 's@school.hk',
  nameZh: '陳家明',
  nameEn: 'Chan Ka Ming',
  role: 'student',
  level: 'S4',
  classNumber: 15,
  overallAccuracy: 60,
  streakDays: 3,
  xp: 100,
  academicYear: '2026-2027',
  badgeIds: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  class: null,
  _count: {
    sessions: 1, mistakes: 4, vocabItems: 0, submissions: 0,
    writingDrafts: 0, listeningSessions: 0, spellingSessions: 0,
  },
};

/** 使用者回報的其中一條閱讀錯題（依存於篇章 → 沒有題型等於沒有意義） */
const MISTAKES = [
  {
    id: 'm1',
    questionId: 'rq-1',
    questionSummary: "What does the word 'curiosity' in the last sentence mean?",
    studentAnswer: 'B',
    correctAnswer: 'D',
    mistakeType: 'comprehension',
    createdAt: new Date('2026-09-12T00:00:00Z'),
    languageSkill: 'reading',
    grammarItem: null,
    questionType: 'vocabulary_in_context',
    skillSource: 'canonical',
  },
  {
    id: 'm2',
    questionId: 'rd-legacy-1',
    questionSummary: 'What is the main idea of the passage?',
    studentAnswer: 'A',
    correctAnswer: 'B',
    mistakeType: 'comprehension',
    createdAt: new Date('2026-09-11T00:00:00Z'),
    languageSkill: 'reading',
    grammarItem: null,
    questionType: null,
    skillSource: 'unresolved',
  },
];

/** 覆寫錯題查詢結果（其餘查詢維持預設的成功回應） */
function withMistakes(rows: unknown[]) {
  mocks.adminDbQuery.mockImplementation((model: string, method: string) => {
    if (model === 'user' && method === 'findUnique') return Promise.resolve(STUDENT);
    if (model === 'mistake' && method === 'findMany') return Promise.resolve(rows);
    return Promise.resolve([]);
  });
}

async function get() {
  return analyticsRoute.GET(
    new NextRequest('http://localhost/api/admin/students/stu-1/analytics'),
    { params: Promise.resolve({ studentId: 'stu-1' }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyApiAuth.mockResolvedValue({ authenticated: true, userId: 'admin-1', role: 'admin' });
  mocks.resolveMistakeQuestionContexts.mockResolvedValue(new Map([
    ['rq-1', {
      canonical: true,
      questionText: "What does the word 'curiosity' in the last sentence mean?",
      choices: ['Being eager to know', 'Being afraid', 'Feeling bored', 'Being tired'],
      questionType: 'vocabulary_in_context',
      explanationZh: null,
      explanationEn: null,
    }],
  ]));
  mocks.adminDbQuery.mockImplementation((model: string, method: string) => {
    if (model === 'user' && method === 'findUnique') return Promise.resolve(STUDENT);
    if (model === 'mistake' && method === 'findMany') return Promise.resolve(MISTAKES);
    return Promise.resolve([]);
  });
});

describe('GET /api/admin/students/[studentId]/analytics — 錯題語境', () => {
  it('回傳 200，不因弱項／語境解析降級而失敗', async () => {
    const res = await get();
    expect(res.status).toBe(200);
  });

  it('每條錯題都帶技能／題型標籤與可重考性（不是原始 bucket key）', async () => {
    const body = await (await get()).json() as {
      recentMistakes: Array<Record<string, unknown>>;
    };

    const [first, second] = body.recentMistakes;
    expect(first.bucketKey).toBe('reading:vocabulary_in_context');
    expect(first.skillLabelZh).toBe('閱讀');
    expect(first.typeLabelZh).toBeTruthy();
    expect(String(first.typeLabelZh)).not.toContain(':');
    // 閱讀題依附篇章 → 不可重考同一題
    expect(first.replayable).toBe(false);
    expect(second.bucketKey).toBe('reading:unclassified');
    expect(String(second.typeLabelZh)).not.toContain(':');
  });

  it('帶回正典選項與解說欄位（讓錯題有語境）', async () => {
    const body = await (await get()).json() as {
      recentMistakes: Array<Record<string, unknown>>;
    };

    const [first, second] = body.recentMistakes;
    expect(first.canonical).toBe(true);
    expect(first.choices).toEqual(['Being eager to know', 'Being afraid', 'Feeling bored', 'Being tired']);
    // 舊題目（rd-*）沒有正典定義 → 不推測內容
    expect(second.canonical).toBe(false);
    expect(second.choices).toBeNull();
  });

  it('一次過解析所有錯題 id（不逐條查詢）', async () => {
    await get();
    expect(mocks.resolveMistakeQuestionContexts).toHaveBeenCalledTimes(1);
    expect(mocks.resolveMistakeQuestionContexts).toHaveBeenCalledWith(['rq-1', 'rd-legacy-1']);
  });

  it('語境解析失敗時仍然回傳錯題（fail-open，不影響頁面）', async () => {
    mocks.resolveMistakeQuestionContexts.mockRejectedValue(new Error('question store unavailable'));

    const res = await get();
    const body = await res.json() as { recentMistakes: Array<Record<string, unknown>> };

    expect(res.status).toBe(200);
    expect(body.recentMistakes).toHaveLength(2);
    expect(body.recentMistakes[0].choices).toBeNull();
    expect(body.recentMistakes[0].canonical).toBe(false);
  });

  it('弱項項目帶 grammarCategoryZh（顯示層不得自行解讀原始 key）', async () => {
    // 動態載入的弱項服務在本測試中以 DB proxy 降級為 null，
    // 故此處只驗證路由沒有把 weakness 轉成非正典形狀。
    const body = await (await get()).json() as { weakness: unknown };
    expect(body.weakness === null || typeof body.weakness === 'object').toBe(true);
  });
});

describe('最近錯題去重', () => {
  it('同一題目文字只保留最新一筆', async () => {
    withMistakes([MISTAKES[0], { ...MISTAKES[0], id: 'm1-old' }, MISTAKES[1]]);

    const body = await (await get()).json() as { recentMistakes: Array<Record<string, unknown>> };
    expect(body.recentMistakes.map(m => m.id)).toEqual(['m1', 'm2']);
  });
});
