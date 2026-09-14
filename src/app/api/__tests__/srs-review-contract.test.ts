// ============================================
// 2026-09-14: 錯題 SRS 排程 + /api/srs/review 契約
//
// 修復前：nextReviewDate 從不更新（每日同一批卡片）、卡片正面顯示錯答案、
// 逐卡提交因 payload 形狀不符一律 400（複習結果從未寫入）。
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { nextMistakeReviewState } from '@/modules/mistake/db/services/mistake-tracker';

const mocks = vi.hoisted(() => ({
  verifyApiAuth: vi.fn(),
  listDueMistakesForReview: vi.fn(),
  findMistakeById: vi.fn(),
  updateMistake: vi.fn(),
  getStudentWords: vi.fn(),
  getWordById: vi.fn(),
  updateVocab: vi.fn(),
}));

// verifyApiAuth is mocked; verifyStudentSelfAccess re-implements the real
// student self-access rule so ownership behaviour is actually exercised.
// (importOriginal would drag next-auth → 'next/server' into the test graph.)
vi.mock('@/shared/auth/api-auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    verifyApiAuth: mocks.verifyApiAuth,
    verifyStudentSelfAccess: (auth: { role?: string; userId?: string }, studentId: string) =>
      auth.role === 'student' && auth.userId !== studentId
        ? NextResponse.json({ error: '只能查看自己的資料' }, { status: 403 })
        : null,
  };
});

vi.mock('@/modules/student', () => ({
  listDueMistakesForReview: mocks.listDueMistakesForReview,
  findMistakeById: mocks.findMistakeById,
  updateMistake: mocks.updateMistake,
  updateVocab: mocks.updateVocab,
}));

vi.mock('@/modules/vocabulary/services/vocabulary-service', () => ({
  getStudentWords: mocks.getStudentWords,
  getWordById: mocks.getWordById,
}));

import * as srsRoute from '../srs/review/route';

const studentA = { authenticated: true, userId: 'student-A', role: 'student' };

function post(url: string, body: unknown): NextRequest {
  return new NextRequest(url, { method: 'POST', body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyApiAuth.mockResolvedValue(studentA);
  mocks.getStudentWords.mockResolvedValue([]);
  mocks.listDueMistakesForReview.mockResolvedValue([]);
  mocks.findMistakeById.mockResolvedValue(null);
  mocks.updateMistake.mockResolvedValue({});
});

describe('nextMistakeReviewState — SM-2 排程', () => {
  const now = new Date('2026-09-14T09:00:00Z');

  it('首次複習（interval 0）→ 1 天後', () => {
    const state = nextMistakeReviewState({ reviewInterval: 0, easeFactor: 2.5 }, 4, now);
    expect(state.reviewInterval).toBe(1);
    expect(state.nextReviewDate.toISOString()).toBe('2026-09-15T09:00:00.000Z');
    expect(state.lastReviewedAt).toBe(now);
  });

  it('第二次複習（interval 1）→ 3 天後', () => {
    const state = nextMistakeReviewState({ reviewInterval: 1, easeFactor: 2.5 }, 4, now);
    expect(state.reviewInterval).toBe(3);
  });

  it('答錯（quality 1）→ 重置為 1 天並降低 ease factor', () => {
    const state = nextMistakeReviewState({ reviewInterval: 10, easeFactor: 2.5 }, 1, now);
    expect(state.reviewInterval).toBe(1);
    expect(state.easeFactor).toBeLessThan(2.5);
  });

  it('缺少既有 SRS 狀態時使用預設值（不拋錯）', () => {
    const state = nextMistakeReviewState({ reviewInterval: null, easeFactor: null }, 5, now);
    expect(state.reviewInterval).toBe(1);
    expect(state.easeFactor).toBeGreaterThan(2.5);
  });

  it('ease factor 不會低於 1.3', () => {
    let ef = 2.5;
    for (let i = 0; i < 10; i++) {
      ef = nextMistakeReviewState({ reviewInterval: 1, easeFactor: ef }, 0, now).easeFactor;
    }
    expect(ef).toBeGreaterThanOrEqual(1.3);
  });
});

describe('GET /api/srs/review — 錯題卡片', () => {
  it('只取到期且可重考的錯題', async () => {
    await srsRoute.GET(new NextRequest('http://localhost/api/srs/review?studentId=student-A&type=mistakes'));
    expect(mocks.listDueMistakesForReview).toHaveBeenCalledWith('student-A', 50);
  });

  it('卡片回傳題目文字（正面不再顯示錯答案）', async () => {
    mocks.listDueMistakesForReview.mockResolvedValue([{
      id: 'm1',
      questionId: 'q1',
      questionSummary: 'She ___ to school every day.',
      studentAnswer: 'go',
      correctAnswer: 'goes',
      mistakeType: 'grammar',
      languageSkill: null,
      questionType: 'mc',
      aiExplanation: null,
    }]);

    const res = await srsRoute.GET(new NextRequest('http://localhost/api/srs/review?studentId=student-A&type=mistakes'));
    const json = await res.json();

    expect(json.reviewCards.mistakes[0]).toMatchObject({
      id: 'm1',
      questionSummary: 'She ___ to school every day.',
      correctAnswer: 'goes',
    });
  });
});

describe('POST /api/srs/review — payload 契約', () => {
  it('正典形狀 { results: [...] } 會被處理', async () => {
    mocks.findMistakeById.mockResolvedValue({ id: 'm1', studentId: 'student-A', reviewInterval: 0, easeFactor: 2.5 });

    const res = await srsRoute.POST(post('http://localhost/api/srs/review', {
      studentId: 'student-A',
      results: [{ type: 'mistake', id: 'm1', quality: 4 }],
    }));

    expect(res.status).toBe(200);
    expect(mocks.updateMistake).toHaveBeenCalledTimes(1);
  });

  it('SRSReviewFlow 的單卡形狀 { type, id, quality } 同樣被接受', async () => {
    mocks.findMistakeById.mockResolvedValue({ id: 'm1', studentId: 'student-A', reviewInterval: 0, easeFactor: 2.5 });

    const res = await srsRoute.POST(post('http://localhost/api/srs/review', {
      studentId: 'student-A',
      type: 'mistake',
      id: 'm1',
      quality: 5,
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBe(1);
    expect(mocks.updateMistake).toHaveBeenCalledWith('m1', expect.objectContaining({ reviewed: true }));
  });

  it('缺少 id / results → 400', async () => {
    const res = await srsRoute.POST(post('http://localhost/api/srs/review', { studentId: 'student-A' }));
    expect(res.status).toBe(400);
  });

  it('別人的錯題 id 不會被更新', async () => {
    mocks.findMistakeById.mockResolvedValue({ id: 'm9', studentId: 'student-B', reviewInterval: 0, easeFactor: 2.5 });

    await srsRoute.POST(post('http://localhost/api/srs/review', {
      studentId: 'student-A',
      results: [{ type: 'mistake', id: 'm9', quality: 5 }],
    }));

    expect(mocks.updateMistake).not.toHaveBeenCalled();
  });
});
