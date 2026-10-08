// ============================================
// IELTS AI Generation Service — gate tests (2026-10-03 IV)
// ============================================
// The AI is fully mocked. These tests pin the guarantees that make AI-authored
// content safe to store:
//   * machine screen drops undeliverable items (never silently delivered)
//   * blind-solve verification must AGREE with the key (mismatch ⇒ dropped)
//   * unverified output is never persisted (fail-closed)
//   * persistence is QA_REQUIRED inside a DRAFT test — AI can never publish
//   * shortfall is reported honestly
//   * budget errors propagate untouched (routes map to 503)
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateIeltsQuestionSetWithAI: vi.fn(),
  verifyIeltsItemsWithAI: vi.fn(),
  generateIeltsWritingPromptWithAI: vi.fn(),
  verifyIeltsWritingPromptWithAI: vi.fn(),
  createTest: vi.fn(),
  createSection: vi.fn(),
  createQuestions: vi.fn(),
  createQuestion: vi.fn(),
  updateQuestionsStatusForTest: vi.fn(),
  listRecentQuestionPromptsBySkill: vi.fn(),
  listRecentSectionTextsBySkill: vi.fn(),
  listRecentWritingPrompts: vi.fn(),
}));

vi.mock('@/modules/ai', () => ({
  generateIeltsQuestionSetWithAI: mocks.generateIeltsQuestionSetWithAI,
  verifyIeltsItemsWithAI: mocks.verifyIeltsItemsWithAI,
  generateIeltsWritingPromptWithAI: mocks.generateIeltsWritingPromptWithAI,
  verifyIeltsWritingPromptWithAI: mocks.verifyIeltsWritingPromptWithAI,
}));

vi.mock('@/modules/ielts/repositories/ielts-repo', () => ({
  createTest: mocks.createTest,
  createSection: mocks.createSection,
  createQuestions: mocks.createQuestions,
  createQuestion: mocks.createQuestion,
  updateQuestionsStatusForTest: mocks.updateQuestionsStatusForTest,
  listRecentQuestionPromptsBySkill: mocks.listRecentQuestionPromptsBySkill,
  listRecentSectionTextsBySkill: mocks.listRecentSectionTextsBySkill,
  listRecentWritingPrompts: mocks.listRecentWritingPrompts,
}));

import {
  generateIeltsPracticeContent,
  generateIeltsWritingTask,
} from '../services/generation-service';

// ============================================
// Fixtures & builders
// ============================================

const PASSAGE =
  'The Riverside Community Workshop opens on Monday and closes at six in the evening. ' +
  'Membership costs fifteen pounds per year and includes all materials.';

const TRANSCRIPT =
  'Guide: The tour starts at ten in the morning. Visitor: Great, thank you.';

function aiOk<T>(data: T) {
  return { ok: true as const, data, provider: 'deepseek', durationMs: 7, promptVersion: 'v1', promptHash: 'h' };
}

function aiFail(failure = 'AI_PROVIDER_ERROR') {
  return { ok: false as const, failure, error: 'provider down', provider: null, durationMs: 7, promptVersion: 'v1', promptHash: 'h' };
}

function sampleReadingSet(firstPromptTag: string) {
  return {
    title: 'Riverside workshop',
    passage: PASSAGE,
    transcript: null,
    questions: [
      {
        // 2026-10-08：AI 提示詞使用**不帶技能前綴**的官方題型名稱
        // （見 ai/prompts/ielts/question-generation.ts）。此 fixture 代表 *AI 輸出*，
        // 必須照實使用該詞彙，否則測試會掩蓋「題型名稱對照缺失 ⇒ 全軍覆沒」的缺陷。
        questionType: 'true_false_not_given',
        prompt: `[${firstPromptTag}] The community workshop opens on Monday.`,
        options: null,
        answerKey: 'TRUE',
        acceptedAnswers: [],
        evidenceQuotes: ['The Riverside Community Workshop opens on Monday'],
        evidenceReasoning: 'The first sentence states the opening day.',
        explanation: 'Directly stated.',
        difficulty: 'EASY',
      },
      {
        questionType: 'sentence_completion',
        prompt: `[${firstPromptTag}] Membership costs £______ per year.`,
        options: null,
        answerKey: 'fifteen',
        acceptedAnswers: [],
        wordLimit: { maxWords: 1, allowsNumber: true, instruction: 'Choose ONE WORD AND/OR A NUMBER' },
        evidenceQuotes: ['fifteen'],
        evidenceReasoning: 'The cost is stated directly.',
        explanation: 'The text says fifteen pounds.',
        difficulty: 'EASY',
      },
      {
        questionType: 'multiple_choice',
        prompt: `[${firstPromptTag}] When does the workshop close?`,
        options: ['Six in the evening', 'Five in the morning', 'Seven at night', 'Four in the afternoon'],
        answerKey: 'A',
        acceptedAnswers: [],
        evidenceQuotes: ['closes at six in the evening'],
        evidenceReasoning: 'The closing time is stated.',
        explanation: 'The text states six in the evening.',
        difficulty: 'EASY',
      },
    ],
  };
}

function verification(answers: Record<string, string>, soundness: 'ok' | 'ambiguous' | 'flawed' = 'ok') {
  return aiOk({
    items: Object.entries(answers).map(([questionId, answer]) => ({
      questionId,
      answer,
      soundness,
      note: '',
    })),
  });
}

function baseInput() {
  return {
    userId: 'teacher-1',
    skill: 'READING' as const,
    testType: 'ACADEMIC' as const,
    count: 3,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listRecentQuestionPromptsBySkill.mockResolvedValue([]);
  mocks.listRecentSectionTextsBySkill.mockResolvedValue([]);
  mocks.listRecentWritingPrompts.mockResolvedValue([]);
  mocks.createTest.mockResolvedValue({ id: 'test-1' });
  mocks.createSection.mockResolvedValue({ id: 'sec-1' });
  mocks.createQuestions.mockResolvedValue({ count: 3 });
  mocks.createQuestion.mockResolvedValue({ id: 'q-1' });
  mocks.updateQuestionsStatusForTest.mockResolvedValue({ count: 3 });
});

// ============================================
// Objective generation
// ============================================

describe('generateIeltsPracticeContent — guarded persistence', () => {
  it('persists verified items at QA_REQUIRED inside a DRAFT test (never PUBLISHED)', async () => {
    mocks.generateIeltsQuestionSetWithAI.mockResolvedValue(aiOk(sampleReadingSet('A')));
    mocks.verifyIeltsItemsWithAI.mockResolvedValue(verification({ q1: 'TRUE', q2: 'fifteen', q3: 'A' }));

    const outcome = await generateIeltsPracticeContent(baseInput());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.deliveredCount).toBe(3);
    expect(outcome.requestedCount).toBe(3);
    expect(outcome.shortfall).toBe(0);
    expect(outcome.testStatus).toBe('DRAFT');

    expect(mocks.createTest).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DRAFT', skill: 'READING', testType: 'ACADEMIC' }),
    );
    const rows = mocks.createQuestions.mock.calls[0][0] as Array<{ validationStatus: string }>;
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.validationStatus).toBe('QA_REQUIRED');
    expect(JSON.stringify(mocks.createQuestions.mock.calls)).not.toContain('"PUBLISHED"');
    expect(mocks.updateQuestionsStatusForTest).toHaveBeenCalledWith(
      'test-1',
      'QA_REQUIRED',
      expect.any(String),
    );
  });

  it('persists INSTANT self-study sets owner-scoped — still DRAFT + QA_REQUIRED (2026-10-03 VII)', async () => {
    mocks.generateIeltsQuestionSetWithAI.mockResolvedValue(aiOk(sampleReadingSet('S1')));
    mocks.verifyIeltsItemsWithAI.mockResolvedValue(verification({ q1: 'TRUE', q2: 'fifteen', q3: 'A' }));

    const outcome = await generateIeltsPracticeContent({
      ...baseInput(),
      userId: 'student-9',
      deliveryMode: 'INSTANT',
    });

    expect(outcome.ok).toBe(true);
    // Instant delivery is NOT publication: the persisted state is unchanged.
    expect(mocks.createTest).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DRAFT', origin: 'INSTANT', ownerUserId: 'student-9' }),
    );
    const rows = mocks.createQuestions.mock.calls[0][0] as Array<{ validationStatus: string }>;
    for (const row of rows) expect(row.validationStatus).toBe('QA_REQUIRED');
  });

  it('defaults generation to CATALOGUE origin with no owner (unchanged authoring path)', async () => {
    mocks.generateIeltsQuestionSetWithAI.mockResolvedValue(aiOk(sampleReadingSet('S2')));
    mocks.verifyIeltsItemsWithAI.mockResolvedValue(verification({ q1: 'TRUE', q2: 'fifteen', q3: 'A' }));

    const outcome = await generateIeltsPracticeContent(baseInput());

    expect(outcome.ok).toBe(true);
    expect(mocks.createTest).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'CATALOGUE', ownerUserId: null }),
    );
  });

  it('maps TARGET_BAND authoring labels to difficulty buckets (no band-difficulty claim)', async () => {
    mocks.generateIeltsQuestionSetWithAI.mockResolvedValue(aiOk(sampleReadingSet('TB')));
    mocks.verifyIeltsItemsWithAI.mockResolvedValue(verification({ q1: 'TRUE', q2: 'fifteen', q3: 'A' }));

    const outcome = await generateIeltsPracticeContent({ ...baseInput(), targetBand: 'TARGET_BAND_8' });

    expect(outcome.ok).toBe(true);
    const aiCall = mocks.generateIeltsQuestionSetWithAI.mock.calls[0][0] as { difficulty?: string };
    expect(aiCall.difficulty).toBe('HARD');
  });

  it('rejects an unknown TARGET_BAND label without calling the AI (INVALID_INPUT)', async () => {
    const outcome = await generateIeltsPracticeContent({
      ...baseInput(),
      targetBand: 'TARGET_BAND_11' as never,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('INVALID_INPUT');
    expect(mocks.generateIeltsQuestionSetWithAI).not.toHaveBeenCalled();
  });

  it('records the requested test type on persistence (no cross-mode relabelling)', async () => {
    mocks.generateIeltsQuestionSetWithAI.mockResolvedValue(aiOk(sampleReadingSet('GT1')));
    mocks.verifyIeltsItemsWithAI.mockResolvedValue(verification({ q1: 'TRUE', q2: 'fifteen', q3: 'A' }));

    const outcome = await generateIeltsPracticeContent({ ...baseInput(), testType: 'GENERAL_TRAINING' });

    expect(outcome.ok).toBe(true);
    expect(mocks.createTest).toHaveBeenCalledWith(
      expect.objectContaining({ testType: 'GENERAL_TRAINING', origin: 'CATALOGUE' }),
    );
    const aiCall = mocks.generateIeltsQuestionSetWithAI.mock.calls[0][0] as { testType?: string };
    expect(aiCall.testType).toBe('GENERAL_TRAINING');
  });

  it('drops a completion item whose answer is not in the passage (machine screen)', async () => {
    const set = sampleReadingSet('B');
    set.questions[1].answerKey = 'twelve'; // not in the passage
    set.questions[1].evidenceQuotes = ['fifteen'];
    mocks.generateIeltsQuestionSetWithAI.mockResolvedValue(aiOk(set));
    mocks.verifyIeltsItemsWithAI.mockResolvedValue(verification({ q1: 'TRUE', q3: 'A' }));

    const outcome = await generateIeltsPracticeContent(baseInput());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.deliveredCount).toBe(2);
    expect(outcome.shortfall).toBe(1);
    expect(outcome.drops.some((d) => d.reason === 'VALIDATOR_REJECT:READING_ANSWER_NOT_LOCATABLE')).toBe(true);
  });

  it('drops a multi-answer item (official numbering: one answer per question)', async () => {
    const set = sampleReadingSet('C');
    (set.questions[2] as { answerKey: unknown }).answerKey = ['A', 'C'];
    mocks.generateIeltsQuestionSetWithAI.mockResolvedValue(aiOk(set));
    mocks.verifyIeltsItemsWithAI.mockResolvedValue(verification({ q1: 'TRUE', q2: 'fifteen' }));

    const outcome = await generateIeltsPracticeContent(baseInput());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.deliveredCount).toBe(2);
    expect(outcome.drops.some((d) => d.reason === 'MULTI_ANSWER_NOT_OFFICIAL')).toBe(true);
  });

  it('retries once with rejection notes when the blind solve disagrees, then delivers', async () => {
    mocks.generateIeltsQuestionSetWithAI
      .mockResolvedValueOnce(aiOk(sampleReadingSet('D1')))
      .mockResolvedValueOnce(aiOk(sampleReadingSet('D2')));
    mocks.verifyIeltsItemsWithAI
      .mockResolvedValueOnce(verification({ q1: 'FALSE', q2: 'twelve', q3: 'B' }))
      .mockResolvedValueOnce(verification({ q1: 'TRUE', q2: 'fifteen', q3: 'A' }));

    const outcome = await generateIeltsPracticeContent(baseInput());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.deliveredCount).toBe(3);
    expect(mocks.generateIeltsQuestionSetWithAI).toHaveBeenCalledTimes(2);
    const secondCall = mocks.generateIeltsQuestionSetWithAI.mock.calls[1][0] as { rejectionNotes?: string[] };
    expect(secondCall.rejectionNotes?.join(' ')).toContain('VERIFY_ANSWER_MISMATCH');
    expect(outcome.drops.some((d) => d.reason === 'VERIFY_ANSWER_MISMATCH')).toBe(true);
  });

  it('persists NOTHING when verification is unavailable (fail-closed)', async () => {
    mocks.generateIeltsQuestionSetWithAI.mockResolvedValue(aiOk(sampleReadingSet('E')));
    mocks.verifyIeltsItemsWithAI.mockResolvedValue(aiFail('AI_INVALID_JSON'));

    const outcome = await generateIeltsPracticeContent(baseInput());

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('GENERATION_EMPTY');
    expect(mocks.createTest).not.toHaveBeenCalled();
    expect(mocks.createQuestions).not.toHaveBeenCalled();
  });

  it('accepts a listening multiple-choice item whose option text is in the transcript', async () => {
    mocks.generateIeltsQuestionSetWithAI.mockResolvedValue(
      aiOk({
        title: 'Library tour',
        passage: null,
        transcript: TRANSCRIPT,
        questions: [
          {
            // 同上：AI 輸出使用不帶技能前綴的名稱
            questionType: 'multiple_choice',
            prompt: 'When does the tour start?',
            options: ['Ten in the morning', 'Nine in the morning', 'Eleven in the morning'],
            answerKey: 'A',
            acceptedAnswers: [],
            expectedAnswer: 'Ten in the morning',
            transcriptQuote: 'The tour starts at ten in the morning',
            explanation: 'The guide states ten in the morning.',
            difficulty: 'EASY',
          },
        ],
      }),
    );
    mocks.verifyIeltsItemsWithAI.mockResolvedValue(verification({ q1: 'A' }));

    const outcome = await generateIeltsPracticeContent({
      userId: 'teacher-1',
      skill: 'LISTENING',
      testType: 'ACADEMIC',
      count: 3,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.deliveredCount).toBe(1);
    expect(outcome.shortfall).toBe(2);
  });

  it('rejects an out-of-range count (400-class INVALID_INPUT)', async () => {
    const outcome = await generateIeltsPracticeContent({ ...baseInput(), count: 2 });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('INVALID_INPUT');
    expect(mocks.generateIeltsQuestionSetWithAI).not.toHaveBeenCalled();
  });

  it('propagates budget exhaustion untouched (route maps to 503)', async () => {
    mocks.generateIeltsQuestionSetWithAI.mockRejectedValue(new Error('AI daily budget exhausted'));
    await expect(generateIeltsPracticeContent(baseInput())).rejects.toThrow('budget');
    expect(mocks.createTest).not.toHaveBeenCalled();
  });
});

// ============================================
// Answer-key form contract (2026-10-08)
// ============================================
// The generation prompt asks for "the correct option"; the model reliably answers with the
// option TEXT while the canonical contract (validator MC_KEY_NOT_IN_OPTIONS, scorer
// MC_LETTER_MATCH) requires the option CODE. Measured on the real path: 11 of 13 listening
// MC items were rejected by MC_KEY_NOT_IN_OPTIONS. The screen owns the single conversion.
describe('answer-key form — AI option text ↔ canonical option code', () => {
  it('converts a listening MC answer key given as the option TEXT into its code', async () => {
    mocks.generateIeltsQuestionSetWithAI.mockResolvedValue(
      aiOk({
        title: 'Library tour',
        passage: null,
        transcript: TRANSCRIPT,
        questions: [
          {
            questionType: 'multiple_choice',
            prompt: 'When does the tour start?',
            options: ['Ten in the morning', 'Nine in the morning', 'Eleven in the morning'],
            // Real AI shape: the option text, not the letter.
            answerKey: 'Ten in the morning',
            acceptedAnswers: [],
            evidenceReasoning: 'The guide states the start time.',
            explanation: 'The guide states ten in the morning.',
            difficulty: 'EASY',
          },
        ],
      }),
    );
    mocks.verifyIeltsItemsWithAI.mockResolvedValue(verification({ q1: 'A' }));

    const outcome = await generateIeltsPracticeContent({
      userId: 'teacher-1',
      skill: 'LISTENING',
      testType: 'ACADEMIC',
      count: 3,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.deliveredCount).toBe(1);
    expect(outcome.drops).toHaveLength(0);
    // The canonical code is what gets persisted (and what the validator/scorer require).
    const rows = mocks.createQuestions.mock.calls[0][0] as Array<{ answerKey: string }>;
    expect(rows[0].answerKey).toBe('"A"');
  });

  it('leaves a text key that matches no option untouched (validator rejects, fail-closed)', async () => {
    mocks.generateIeltsQuestionSetWithAI.mockResolvedValue(
      aiOk({
        title: 'Library tour',
        passage: null,
        transcript: TRANSCRIPT,
        questions: [
          {
            questionType: 'multiple_choice',
            prompt: 'When does the tour start?',
            options: ['Ten in the morning', 'Nine in the morning', 'Eleven in the morning'],
            answerKey: 'At noon',
            acceptedAnswers: [],
            explanation: 'No such option exists.',
            difficulty: 'EASY',
          },
        ],
      }),
    );
    mocks.verifyIeltsItemsWithAI.mockResolvedValue(verification({ q1: 'A' }));

    const outcome = await generateIeltsPracticeContent({
      userId: 'teacher-1',
      skill: 'LISTENING',
      testType: 'ACADEMIC',
      count: 3,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // Nothing survived the gates ⇒ the documented fail-closed outcome (422 GENERATION_EMPTY).
    expect(outcome.code).toBe('GENERATION_EMPTY');
    expect(outcome.message).toContain('MC_KEY_NOT_IN_OPTIONS');
    expect(mocks.createQuestions).not.toHaveBeenCalled();
  });

  it('never rewrites a free-text completion key that happens to equal an option text', async () => {
    const set = sampleReadingSet('K');
    set.questions[1].answerKey = 'Six in the evening';
    set.questions[1].wordLimit = { maxWords: 4, allowsNumber: true, instruction: 'Write NO MORE THAN FOUR WORDS' };
    mocks.generateIeltsQuestionSetWithAI.mockResolvedValue(aiOk(set));
    mocks.verifyIeltsItemsWithAI.mockResolvedValue(verification({ q1: 'TRUE', q2: 'Six in the evening', q3: 'A' }));

    const outcome = await generateIeltsPracticeContent(baseInput());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.deliveredCount).toBe(3);
    const rows = mocks.createQuestions.mock.calls[0][0] as Array<{ questionType: string; answerKey: string }>;
    const completion = rows.find((r) => r.questionType === 'reading_sentence_completion');
    expect(completion?.answerKey).toBe('"Six in the evening"');
    const mc = rows.find((r) => r.questionType === 'reading_multiple_choice');
    expect(mc?.answerKey).toBe('"A"');
  });
});

// ============================================
// Writing task generation
// ============================================

const WRITING_PROMPT_OK =
  'You should spend about 40 minutes on this task.\n\n' +
  'Write about the following topic:\n\n' +
  'Some people believe that public libraries are no longer needed because information is free online. ' +
  'To what extent do you agree or disagree?\n\n' +
  'Give reasons for your answer and include any relevant examples from your own knowledge or experience.\n\n' +
  'Write at least 250 words.';

describe('generateIeltsWritingTask — conformance-gated persistence', () => {
  it('persists a conforming task as QA_REQUIRED in a DRAFT test', async () => {
    mocks.generateIeltsWritingPromptWithAI.mockResolvedValue(
      aiOk({ title: 'Public libraries task', promptText: WRITING_PROMPT_OK }),
    );
    mocks.verifyIeltsWritingPromptWithAI.mockResolvedValue(aiOk({ conforms: true, issues: [] }));

    const outcome = await generateIeltsWritingTask({
      userId: 'teacher-1',
      testType: 'ACADEMIC',
      writingTaskType: 'academic_task2',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.testStatus).toBe('DRAFT');
    expect(mocks.createTest).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DRAFT', skill: 'WRITING', testType: 'ACADEMIC' }),
    );
    expect(mocks.createSection).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'academic_task2' }),
    );
    expect(mocks.createQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ validationStatus: 'QA_REQUIRED', skill: 'WRITING' }),
    );
    expect(JSON.stringify(mocks.createQuestion.mock.calls)).not.toContain('"PUBLISHED"');
  });

  it('retries a non-conforming task once, then fails typed without persisting', async () => {
    mocks.generateIeltsWritingPromptWithAI.mockResolvedValue(
      aiOk({ title: 'Bad task', promptText: WRITING_PROMPT_OK }),
    );
    mocks.verifyIeltsWritingPromptWithAI.mockResolvedValue(
      aiOk({ conforms: false, issues: ['missing three bullet points'] }),
    );

    const outcome = await generateIeltsWritingTask({
      userId: 'teacher-1',
      testType: 'ACADEMIC',
      writingTaskType: 'academic_task2',
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('WRITING_PROMPT_NOT_CONFORMING');
      expect(outcome.issues).toContain('missing three bullet points');
    }
    expect(mocks.generateIeltsWritingPromptWithAI).toHaveBeenCalledTimes(2);
    expect(mocks.createTest).not.toHaveBeenCalled();
  });

  it('rejects a task type from the wrong variant (INVALID_INPUT)', async () => {
    const outcome = await generateIeltsWritingTask({
      userId: 'teacher-1',
      testType: 'GENERAL_TRAINING',
      writingTaskType: 'academic_task2',
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('INVALID_INPUT');
    expect(mocks.generateIeltsWritingPromptWithAI).not.toHaveBeenCalled();
  });

  // 2026-10-04: student on-demand self-study — same gates, but the persisted
  // test is INSTANT + owner-scoped so it can never be listed for others.
  it('marks an INSTANT delivery as origin INSTANT, owner-scoped and still QA_REQUIRED', async () => {
    mocks.generateIeltsWritingPromptWithAI.mockResolvedValue(
      aiOk({ title: 'Public libraries task', promptText: WRITING_PROMPT_OK }),
    );
    mocks.verifyIeltsWritingPromptWithAI.mockResolvedValue(aiOk({ conforms: true, issues: [] }));

    const outcome = await generateIeltsWritingTask({
      userId: 'student-1',
      testType: 'ACADEMIC',
      writingTaskType: 'academic_task2',
      deliveryMode: 'INSTANT',
    });

    expect(outcome.ok).toBe(true);
    expect(mocks.createTest).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'DRAFT',
        skill: 'WRITING',
        origin: 'INSTANT',
        ownerUserId: 'student-1',
      }),
    );
    expect(mocks.createQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ validationStatus: 'QA_REQUIRED' }),
    );
    expect(JSON.stringify(mocks.createTest.mock.calls)).not.toContain('"PUBLISHED"');
  });

  it('keeps the catalogue default for teacher authoring (no owner, CATALOGUE)', async () => {
    mocks.generateIeltsWritingPromptWithAI.mockResolvedValue(
      aiOk({ title: 'Public libraries task', promptText: WRITING_PROMPT_OK }),
    );
    mocks.verifyIeltsWritingPromptWithAI.mockResolvedValue(aiOk({ conforms: true, issues: [] }));

    await generateIeltsWritingTask({
      userId: 'teacher-1',
      testType: 'ACADEMIC',
      writingTaskType: 'academic_task2',
    });

    expect(mocks.createTest).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'CATALOGUE', ownerUserId: null }),
    );
  });
});
