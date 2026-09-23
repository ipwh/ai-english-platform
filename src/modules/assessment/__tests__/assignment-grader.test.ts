// ============================================
// R3.5: Assignment Item Grader — Per-Item Evidence Tests
// ============================================
import { describe, it, expect } from 'vitest';
import {
  gradeAssignmentItems,
  type AssignmentGraderQuestion,
  type AssignmentAnswerAnalyzer,
} from '../services/assignment-grader';

const q = (overrides: Partial<AssignmentGraderQuestion> = {}): AssignmentGraderQuestion => ({
  id: 'aq-1',
  questionType: 'mc',
  prompt: 'Choose the correct answer.',
  answer: 'B',
  orderIndex: 0,
  ...overrides,
});

const okAnalyzer: AssignmentAnswerAnalyzer = async input => ({
  isCorrect: input.studentAnswer.trim().toLowerCase() === input.correctAnswer.trim().toLowerCase(),
});

// ============================================
// MC server scoring
// ============================================

describe('MC server scoring (evaluator=server)', () => {
  it('correct MC answer → result=correct, awardedScore=1, maxScore=1, countsTowardScore=true, evaluator=server', async () => {
    const { items, totalScore } = await gradeAssignmentItems([q({ answer: 'B' })], { 'aq-1': 'B' }, okAnalyzer);
    expect(totalScore).toBe(1);
    expect(items[0]).toMatchObject({
      questionId: 'aq-1',
      response: 'B',
      result: 'correct',
      awardedScore: 1,
      maxScore: 1,
      countsTowardScore: true,
      evaluator: 'server',
      scoringMethod: 'assignment-mc-exact-match',
    });
  });

  it('incorrect MC answer → result=incorrect, awardedScore=0', async () => {
    const { items, totalScore } = await gradeAssignmentItems([q({ answer: 'B' })], { 'aq-1': 'C' }, okAnalyzer);
    expect(totalScore).toBe(0);
    expect(items[0]).toMatchObject({ result: 'incorrect', awardedScore: 0, maxScore: 1 });
  });

  it('MC comparison preserves existing route semantics (trim + case-insensitive)', async () => {
    const { items } = await gradeAssignmentItems([q({ answer: 'B' })], { 'aq-1': '  b  ' }, okAnalyzer);
    expect(items[0].result).toBe('correct');
  });
});

// ============================================
// Text AI scoring
// ============================================

describe('Text AI scoring (evaluator=ai)', () => {
  const aiAnalyzer: AssignmentAnswerAnalyzer = async input => ({
    isCorrect: input.studentAnswer.trim() === input.correctAnswer.trim(),
    feedbackZh: '批改回饋',
  });

  it('AI-graded text answer → evaluator=ai, method=assignment-ai-answer-analysis', async () => {
    const { items } = await gradeAssignmentItems(
      [q({ questionType: 'short-answer', answer: 'expected' })],
      { 'aq-1': 'expected' },
      aiAnalyzer,
    );
    expect(items[0]).toMatchObject({
      result: 'correct',
      evaluator: 'ai',
      scoringMethod: 'assignment-ai-answer-analysis',
      awardedScore: 1,
      maxScore: 1,
      countsTowardScore: true,
    });
    expect(items[0].aiFeedbackPart).toContain('Q1:');
  });

  it('AI-graded incorrect answer → awardedScore=0', async () => {
    const { items } = await gradeAssignmentItems(
      [q({ questionType: 'short-answer', answer: 'expected' })],
      { 'aq-1': 'wrong' },
      aiAnalyzer,
    );
    expect(items[0].result).toBe('incorrect');
    expect(items[0].awardedScore).toBe(0);
  });

  // 2026-09-23 稽核修正：AI 不可用時不再以逐字比對偽造判定（連答案完全相同
  // 也不得標記為 correct）；改為 ungradable 且不計分，交由老師批改。
  it('AI failure → ungradable, not counted (never a fabricated verdict)', async () => {
    const failingAnalyzer: AssignmentAnswerAnalyzer = async () => {
      throw new Error('AI down');
    };
    const { items, totalScore, ungradableCount, gradedQuestionCount } = await gradeAssignmentItems(
      [q({ questionType: 'short-answer', answer: 'expected' })],
      { 'aq-1': 'expected' },
      failingAnalyzer,
    );
    expect(items[0]).toMatchObject({
      result: 'ungradable',
      awardedScore: 0,
      countsTowardScore: false,
      evaluator: 'server',
      scoringMethod: 'assignment-ai-unavailable',
    });
    expect(totalScore).toBe(0);
    expect(ungradableCount).toBe(1);
    expect(gradedQuestionCount).toBe(0);
  });
});

// ============================================
// Mixed evaluator provenance
// ============================================

describe('Mixed evaluator provenance (per item)', () => {
  it('MC + text assignment records per-item evaluators independently', async () => {
    const questions = [
      q({ id: 'aq-mc', questionType: 'mc', answer: 'A', orderIndex: 0 }),
      q({ id: 'aq-txt', questionType: 'short-answer', answer: 'yes', orderIndex: 1 }),
    ];
    const { items } = await gradeAssignmentItems(questions, { 'aq-mc': 'A', 'aq-txt': 'yes' }, okAnalyzer);
    expect(items[0].evaluator).toBe('server');
    expect(items[1].evaluator).toBe('ai');
    expect(items[0].scoringMethod).not.toBe(items[1].scoringMethod);
  });
});

// ============================================
// Identity + question authority
// ============================================

describe('Canonical identity + question authority', () => {
  it('questionId is always the server-owned AssignmentQuestion.id', async () => {
    const { items } = await gradeAssignmentItems(
      [q({ id: 'assignment-question-77' })],
      { 'assignment-question-77': 'B' },
      okAnalyzer,
    );
    expect(items[0].questionId).toBe('assignment-question-77');
  });

  it('a forged answer key is impossible — the answers map cannot alter q.answer', async () => {
    // Server-owned key: q.answer='B'. Client sends 'A' plus extra junk keys.
    const { items } = await gradeAssignmentItems(
      [q({ answer: 'B' })],
      { 'aq-1': 'A', __answer: 'A', score: '999', isCorrect: 'true' } as Record<string, string>,
      okAnalyzer,
    );
    expect(items).toHaveLength(1); // only real question ids produce items
    expect(items[0].result).toBe('incorrect'); // key 'B' vs submitted 'A'
  });

  it('client-supplied scoring fields are ignored — only the answers map is consumed', async () => {
    const answers = { 'aq-1': 'C' } as Record<string, string>;
    (answers as unknown as Record<string, unknown>)['awardedScore'] = 999;
    (answers as unknown as Record<string, unknown>)['result'] = 'correct';
    const { items } = await gradeAssignmentItems([q({ answer: 'B' })], answers, okAnalyzer);
    expect(items[0].result).toBe('incorrect');
    expect(items[0].awardedScore).toBe(0);
  });
});

// ============================================
// No aggregate-to-item reconstruction
// ============================================

describe('No aggregate-to-item reconstruction', () => {
  it('same totalScore but different per-item evidence remains distinct', async () => {
    const questions = [q({ id: 'q1', answer: 'A' }), q({ id: 'q2', answer: 'B', orderIndex: 1 })];
    const attempt1 = await gradeAssignmentItems(questions, { q1: 'A', q2: 'C' }, okAnalyzer);
    const attempt2 = await gradeAssignmentItems(questions, { q1: 'C', q2: 'B' }, okAnalyzer);

    expect(attempt1.totalScore).toBe(1);
    expect(attempt2.totalScore).toBe(1); // same aggregate...
    expect(attempt1.items[0].result).toBe('correct');
    expect(attempt2.items[0].result).toBe('incorrect'); // ...but items differ
    expect(attempt1.items[1].result).toBe('incorrect');
    expect(attempt2.items[1].result).toBe('correct');
  });

  it('does not mutate its inputs', async () => {
    const questions = [q()];
    const answers = { 'aq-1': 'B' };
    const qSnapshot = JSON.stringify(questions);
    const aSnapshot = JSON.stringify(answers);
    await gradeAssignmentItems(questions, answers, okAnalyzer);
    expect(JSON.stringify(questions)).toBe(qSnapshot);
    expect(JSON.stringify(answers)).toBe(aSnapshot);
  });
});

// ============================================
// No invented provenance
// ============================================

describe('No invented provenance', () => {
  it('items contain no evaluatorVersion field', async () => {
    const { items } = await gradeAssignmentItems([q()], { 'aq-1': 'B' }, okAnalyzer);
    expect('evaluatorVersion' in items[0]).toBe(false);
    expect(Object.keys(items[0]).sort()).toEqual([
      'awardedScore', 'countsTowardScore', 'evaluator', 'feedback',
      'maxScore', 'questionId', 'response', 'result', 'scoringMethod',
    ]);
  });

  it('evaluator only ever takes frozen enum values', async () => {
    const questions = [
      q({ id: 'q1', questionType: 'mc', answer: 'A' }),
      q({ id: 'q2', questionType: 'short-answer', answer: 'x', orderIndex: 1 }),
    ];
    const { items } = await gradeAssignmentItems(questions, { q1: 'A', q2: 'x' }, okAnalyzer);
    for (const item of items) {
      expect(['server', 'ai']).toContain(item.evaluator);
    }
  });
});

// ============================================
// R3.5 hardening: falsy answers + deterministic ordering
// ============================================

describe('R3.5 hardening: falsy answers + ordering', () => {
  it('genuinely missing answer → empty response, graded incorrect (semantics unchanged)', async () => {
    const { items } = await gradeAssignmentItems([q({ answer: 'B' })], {}, okAnalyzer);
    expect(items[0].response).toBe('');
    expect(items[0].result).toBe('incorrect');
  });

  it('answer "0" is preserved, not converted to empty string', async () => {
    const { items } = await gradeAssignmentItems([q({ answer: 'B' })], { 'aq-1': '0' }, okAnalyzer);
    expect(items[0].response).toBe('0');
    expect(items[0].result).toBe('incorrect');
  });

  it('numeric 0 answer is preserved as "0"', async () => {
    const answers = { 'aq-1': 0 } as unknown as Record<string, string>;
    const { items } = await gradeAssignmentItems([q({ answer: 'B' })], answers, okAnalyzer);
    expect(items[0].response).toBe('0');
  });

  it('null answer treated as missing (empty response)', async () => {
    const answers = { 'aq-1': null } as unknown as Record<string, string>;
    const { items } = await gradeAssignmentItems([q({ answer: 'B' })], answers, okAnalyzer);
    expect(items[0].response).toBe('');
  });

  it('items preserve the server-provided (orderIndex-ordered) question sequence', async () => {
    const questions = [
      q({ id: 'q2', orderIndex: 2, answer: 'B' }),
      q({ id: 'q1', orderIndex: 1, answer: 'A' }),
    ];
    const { items } = await gradeAssignmentItems(questions, { q1: 'A', q2: 'C' }, okAnalyzer);
    expect(items.map(i => i.questionId)).toEqual(['q2', 'q1']);
  });

  it('one item per question — no duplicates even with repeated answer keys', async () => {
    // Simulates the JSON parser deduplicating repeated object keys:
    const deduped = JSON.parse('{"aq-1":"B","aq-1":"C"}') as Record<string, string>;
    const { items } = await gradeAssignmentItems([q({ id: 'aq-1', answer: 'B' })], deduped, okAnalyzer);
    expect(items).toHaveLength(1);
    expect(items[0].questionId).toBe('aq-1');
  });
});
