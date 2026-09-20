// ============================================
// 診斷伺服器評分 / 可驗證證據測試（D2b / D3，2026-09-20）
// ============================================
// 契約：
//   1. 只有「伺服器持有答案鍵」的題組（文法／閱讀）會經正典管道提交；
//      其餘（聆聽／詞彙／寫作）永不提交，維持自評。
//   2. 伺服器評分成功 → 該技能的顯示值／持久化值 = **伺服器分數**（authoritative）。
//   3. 伺服器無法評分 → 整組略過，回退自評，**永不製造假分數**。
//   4. 持久化：先清後寫；`-1`（未評估）原值保留，不 clamp 成 0。
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  submitPractice: vi.fn(),
  clearDiagnosticResults: vi.fn(),
  createDiagnosticResult: vi.fn(),
}));

vi.mock('@/modules/exercise/services/practice-submission-service', () => ({
  submitPractice: mocks.submitPractice,
}));

vi.mock('../repositories/diagnostic-repo', () => ({
  clearDiagnosticResults: mocks.clearDiagnosticResults,
  createDiagnosticResult: mocks.createDiagnosticResult,
}));

import { submitDiagnostic } from '../services/diagnostic-scoring-service';

const STUDENT = 'student-1';
const RUN = 'diag-run-1';

const baseResults = () => ([
  { skill: 'grammar', skillZh: '文法', accuracy: 50, weakAreas: ['grammar'] },
  { skill: 'reading', skillZh: '閱讀', accuracy: 0, weakAreas: ['reading'] },
  { skill: 'listening', skillZh: '聆聽', accuracy: 50, weakAreas: ['listening'] },
  { skill: 'writing', skillZh: '寫作', accuracy: -1, weakAreas: [] },
]);

const grammarAnswer = (overrides: Record<string, unknown> = {}) => ({
  questionIndex: 0,
  questionId: 'gq-1',
  studentAnswer: 'A',
  skill: 'tenses',
  skillZh: '文法',
  resultSkill: 'grammar',
  ...overrides,
});

const readingAnswer = (overrides: Record<string, unknown> = {}) => ({
  questionIndex: 2,
  questionId: 'rq-1',
  studentAnswer: 'B',
  skill: 'reading',
  skillZh: '閱讀',
  resultSkill: 'reading',
  dseType: 'multiple_choice',
  ...overrides,
});

const ok = (totalQuestions: number, correctCount: number) => ({
  ok: true as const,
  session: { id: 'sess-1', created: true },
  submissionClass: 'grammar' as const,
  totalQuestions,
  correctCount,
  masteryUpdated: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clearDiagnosticResults.mockResolvedValue({ count: 0 });
  mocks.createDiagnosticResult.mockResolvedValue({});
});

describe('D2b/D3 submitDiagnostic — 權威題組經正典管道評分', () => {
  it('文法與閱讀分組提交；以伺服器分數覆寫自評值並標示 authoritative', async () => {
    mocks.submitPractice
      .mockResolvedValueOnce(ok(2, 1)) // grammar: 50%
      .mockResolvedValueOnce(ok(2, 2)); // reading: 100%

    const outcome = await submitDiagnostic({
      studentId: STUDENT,
      runId: RUN,
      results: baseResults(),
      answers: [grammarAnswer(), grammarAnswer({ questionIndex: 1, questionId: 'gq-2' }), readingAnswer()],
    });

    expect(mocks.submitPractice).toHaveBeenCalledTimes(2);
    const [grammarCall, readingCall] = mocks.submitPractice.mock.calls;
    expect(grammarCall[0]).toMatchObject({
      studentId: STUDENT,
      skill: 'tenses',
      source: 'diagnostic',
      clientSubmissionId: `${RUN}-grammar`,
    });
    expect(readingCall[0]).toMatchObject({
      studentId: STUDENT,
      skill: 'reading',
      source: 'dse-reading',
      clientSubmissionId: `${RUN}-reading`,
    });

    const grammarResult = outcome.results.find(r => r.skill === 'grammar')!;
    expect(grammarResult).toMatchObject({ accuracy: 50, authoritative: true });
    const readingResult = outcome.results.find(r => r.skill === 'reading')!;
    expect(readingResult).toMatchObject({ accuracy: 100, authoritative: true, weakAreas: [] });
    // mastery/弱項依伺服器分數重算
    const listening = outcome.results.find(r => r.skill === 'listening')!;
    expect(listening.authoritative).toBe(false);
    expect(outcome.authoritative.map(a => a.skill).sort()).toEqual(['grammar', 'reading']);
  });

  it('聆聽／詞彙／寫作永不提交（無權威評分法）', async () => {
    await submitDiagnostic({
      studentId: STUDENT,
      runId: RUN,
      results: baseResults(),
      answers: [
        { questionIndex: 4, questionId: 'lq-1', studentAnswer: 'A', skill: 'listening', skillZh: '聆聽' },
        { questionIndex: 5, questionId: 'vq-1', studentAnswer: 'x', skill: 'vocabulary', skillZh: '詞彙' },
        { questionIndex: 6, questionId: 'wq-1', studentAnswer: 'essay', skill: 'writing', skillZh: '寫作' },
      ],
    });

    expect(mocks.submitPractice).not.toHaveBeenCalled();
  });

  it('伺服器無法評分（ok:false）→ 整組略過並回退自評，不製造假分數', async () => {
    mocks.submitPractice.mockResolvedValueOnce({ ok: false, status: 400, error: 'NOT_PROJECTABLE' });

    const outcome = await submitDiagnostic({
      studentId: STUDENT,
      runId: RUN,
      results: baseResults(),
      answers: [grammarAnswer()],
    });

    expect(outcome.authoritative).toEqual([]);
    expect(outcome.results.find(r => r.skill === 'grammar')!.accuracy).toBe(50); // 原自評值
    expect(outcome.results.every(r => !r.authoritative)).toBe(true);
  });

  it('提交拋錯 → 不影響持久化（fail-open 回退自評）', async () => {
    mocks.submitPractice.mockRejectedValueOnce(new Error('db down'));

    const outcome = await submitDiagnostic({
      studentId: STUDENT,
      runId: RUN,
      results: baseResults(),
      answers: [grammarAnswer()],
    });

    expect(outcome.results.find(r => r.skill === 'grammar')!.accuracy).toBe(50);
    expect(mocks.clearDiagnosticResults).toHaveBeenCalledWith(STUDENT);
    expect(mocks.createDiagnosticResult).toHaveBeenCalledTimes(4);
  });

  it('題目數為 0（全部不計分）→ 不列為 authoritative', async () => {
    mocks.submitPractice.mockResolvedValueOnce(ok(0, 0));

    const outcome = await submitDiagnostic({
      studentId: STUDENT,
      runId: RUN,
      results: baseResults(),
      answers: [grammarAnswer()],
    });

    expect(outcome.authoritative).toEqual([]);
    expect(outcome.results.find(r => r.skill === 'grammar')!.authoritative).toBe(false);
  });

  it('持久化：先清後寫，-1（未評估）保留、非法值不寫入', async () => {
    await submitDiagnostic({
      studentId: STUDENT,
      runId: RUN,
      results: [
        { skill: 'writing', skillZh: '寫作', accuracy: -1 },
        { skill: 'grammar', skillZh: '文法', accuracy: 999 },
      ],
    });

    expect(mocks.clearDiagnosticResults).toHaveBeenCalledWith(STUDENT);
    const written = mocks.createDiagnosticResult.mock.calls.map(c => c[0]);
    expect(written.find(w => w.skill === 'writing')!.accuracy).toBe(-1);
    expect(written.find(w => w.skill === 'grammar')!.accuracy).toBe(100); // clamp 上限
  });

  it('結構不完整的答案列（缺 id／重複／負 index）一律忽略', async () => {
    mocks.submitPractice.mockResolvedValue(ok(1, 1));

    await submitDiagnostic({
      studentId: STUDENT,
      runId: RUN,
      results: baseResults(),
      answers: [
        { questionIndex: 0, studentAnswer: 'A', skill: 'tenses' },                        // 缺 questionId
        { questionIndex: -1, questionId: 'gq-x', studentAnswer: 'A', skill: 'tenses' },    // 負 index
        grammarAnswer(),
        grammarAnswer({ questionIndex: 9 }),                                              // 重複 id
      ],
    });

    expect(mocks.submitPractice).toHaveBeenCalledTimes(1);
    const answers = mocks.submitPractice.mock.calls[0][0].answers;
    expect(answers).toHaveLength(1);
  });
});
