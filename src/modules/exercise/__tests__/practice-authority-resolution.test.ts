// ============================================
// 2026-09-21 稽核：練習提交的「伺服器解析權威」測試
// ============================================
// 病根：練習頁產生的閱讀題已持久化為 ReadingQuestion（有伺服器答案鍵），
// 但客戶端 payload 不含 dseType、source 固定 'ai-generated'
// → 舊分類判為 legacy-language-skill → 不計入準確率／掌握度／錯題本。
// 修正：以提交的 questionId 是否全部解析到同一正典家族決定權威；
// 解析不到時完全沿用舊的客戶端標記分類（對舊資料零行為改變）。
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveReadingQuestionDefinitions: vi.fn(),
  resolveGrammarQuestionDefinitions: vi.fn(),
}));

vi.mock('@/modules/reading/services/reading-question-service', () => ({
  resolveReadingQuestionDefinitions: mocks.resolveReadingQuestionDefinitions,
}));
vi.mock('@/modules/exercise/services/grammar-question-service', () => ({
  resolveGrammarQuestionDefinitions: mocks.resolveGrammarQuestionDefinitions,
}));

import { resolveSubmissionAuthorityClass } from '../services/practice-authority-resolution';

const answers = (...ids: string[]) => ids.map((questionId, i) => ({ questionId, questionIndex: i, studentAnswer: 'x' }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map());
  mocks.resolveGrammarQuestionDefinitions.mockResolvedValue(new Map());
});

describe('resolveSubmissionAuthorityClass', () => {
  it('resolves reading when every id is a persisted ReadingQuestion', async () => {
    mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map([['r1', {}], ['r2', {}]]));

    const result = await resolveSubmissionAuthorityClass(answers('r1', 'r2'));

    expect(result.authorityClass).toBe('reading');
    expect(result.reason).toBe('all-reading');
    expect(result.resolvedIds).toBe(2);
  });

  it('resolves grammar when every id is a persisted GrammarQuestion', async () => {
    mocks.resolveGrammarQuestionDefinitions.mockResolvedValue(new Map([['g1', {}]]));

    const result = await resolveSubmissionAuthorityClass(answers('g1'));

    expect(result.authorityClass).toBe('grammar');
    expect(result.reason).toBe('all-grammar');
  });

  it('falls back (null) when only some ids resolve — never partial authority', async () => {
    mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map([['r1', {}]]));

    const result = await resolveSubmissionAuthorityClass(answers('r1', 'legacy-2'));

    expect(result.authorityClass).toBeNull();
    expect(result.reason).toBe('partial');
    expect(result.resolvedIds).toBe(1);
    expect(result.totalIds).toBe(2);
  });

  it('falls back (null) on a mixed grammar+reading submission', async () => {
    mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map([['r1', {}]]));
    mocks.resolveGrammarQuestionDefinitions.mockResolvedValue(new Map([['g1', {}]]));

    const result = await resolveSubmissionAuthorityClass(answers('r1', 'g1'));

    expect(result.authorityClass).toBeNull();
    expect(result.reason).toBe('mixed');
  });

  it('falls back (null) when nothing resolves (true legacy data)', async () => {
    const result = await resolveSubmissionAuthorityClass(answers('ai-123-0', 'ai-123-1'));

    expect(result.authorityClass).toBeNull();
    expect(result.reason).toBe('partial');
  });

  it('falls back (null) when no answer carries an id', async () => {
    const result = await resolveSubmissionAuthorityClass([{ questionIndex: 0, studentAnswer: 'x' }]);

    expect(result.authorityClass).toBeNull();
    expect(result.reason).toBe('no-ids');
    expect(mocks.resolveReadingQuestionDefinitions).not.toHaveBeenCalled();
  });

  it('deduplicates ids before resolving', async () => {
    mocks.resolveReadingQuestionDefinitions.mockResolvedValue(new Map([['r1', {}]]));

    const result = await resolveSubmissionAuthorityClass(answers('r1', 'r1', 'r1'));

    expect(result.authorityClass).toBe('reading');
    expect(result.totalIds).toBe(1);
    expect(mocks.resolveReadingQuestionDefinitions).toHaveBeenCalledWith(['r1']);
  });

  it('never throws when a resolver fails (caller keeps legacy behaviour)', async () => {
    mocks.resolveReadingQuestionDefinitions.mockRejectedValue(new Error('db down'));

    const result = await resolveSubmissionAuthorityClass(answers('r1'));

    expect(result.authorityClass).toBeNull();
  });

  it('tolerates malformed answers payloads', async () => {
    await expect(resolveSubmissionAuthorityClass(undefined)).resolves.toMatchObject({ authorityClass: null, reason: 'no-ids' });
    await expect(resolveSubmissionAuthorityClass('not-an-array')).resolves.toMatchObject({ authorityClass: null, reason: 'no-ids' });
    await expect(resolveSubmissionAuthorityClass([null, 42])).resolves.toMatchObject({ authorityClass: null, reason: 'no-ids' });
  });
});
