// ============================================
// Self-Directed Practice — student scenario matrix (2026-10-10 stress test)
// ============================================
// Written from the student's side: what a P6 student actually types when they come
// from their workbook (Oxford Grammar Wonderland 6A/6B units such as "if … will",
// "Similes: as … as, be … like", "Infinitives with/without to", reported speech,
// "too + adjective + to-infinitive") into 自訂文法與詞彙練習, and what happens to
// every combination of question types they can tick.
//
// Each case below started as an observed failure (refusal / wrong category /
// dropped item) and is kept as a regression guard.
// ============================================

import { describe, expect, it, vi } from 'vitest';

// The AI facade is only needed for its exported constants and, in the delivery /
// verification cases, for the model calls that are stubbed per case.
const mocks = vi.hoisted(() => ({
  verifyAI: vi.fn(),
  gradeAI: vi.fn(),
  generateAI: vi.fn(),
  persistSet: vi.fn(),
}));

vi.mock('@/modules/ai', () => ({
  CUSTOM_PRACTICE_CATEGORIES: ['grammar', 'sentence_pattern', 'vocabulary'],
  CUSTOM_PRACTICE_DIFFICULTIES: ['basic', 'intermediate', 'advanced'],
  CUSTOM_PRACTICE_QUESTION_TYPES: ['mc', 'fill_blank', 'error_correction', 'transformation', 'sentence_production'],
  generateCustomPracticeWithAI: mocks.generateAI,
  verifyCustomPracticeWithAI: mocks.verifyAI,
  gradeCustomPracticeWithAI: mocks.gradeAI,
}));

vi.mock('@/modules/custom-practice/repositories/custom-practice-repo', () => ({
  persistGeneratedSet: mocks.persistSet,
  getOwnedSet: vi.fn(),
  getSubmissionWithResponses: vi.fn(),
  listOwnSets: vi.fn(),
  createSubmissionWithResponses: vi.fn(),
}));

import { inferCategory, normalizePracticeRequest } from '@/modules/custom-practice/services/request-normalizer';
import { validateGeneratedQuestions } from '@/modules/custom-practice/services/generation-service';
import { screenForDeterministicDefects } from '@/modules/custom-practice/services/verification-service';
import { toDeliveredSet } from '@/modules/custom-practice/services/delivery-service';
import { gradeObjectiveItem, normalizeFreeTextAnswer } from '@/modules/custom-practice/services/grading-service';
import type { PracticeCategory, PracticeSpec, PracticeQuestionType, ValidatedQuestion } from '@/modules/custom-practice/domain/types';

const spec = (
  category: PracticeCategory,
  exerciseTypes: PracticeQuestionType[],
  questionCount = 5
): PracticeSpec => ({
  requestText: 'test request',
  objective: `[${category}] test request`,
  category,
  difficulty: 'intermediate',
  questionCount,
  exerciseTypes,
  interpretation: null,
});

/** A model output item; every field can be overridden per case. */
function aiQuestion(overrides: Record<string, unknown> = {}) {
  return {
    orderIndex: 0,
    questionType: 'mc' as const,
    instructions: 'Choose the correct option.',
    prompt: 'Which is correct?  A) had started  B) started  C) starts  D) starting',
    answerKey: 'A',
    acceptedAnswers: [],
    rejectedAnswers: [],
    rubric: { marks: 1, criteria: ['uses the past perfect'] },
    targetRule: 'past perfect vs past simple',
    explanationZh: '過去完成式用於較早發生的事。',
    explanationEn: 'The past perfect marks the earlier action.',
    misconceptionTags: [],
    maxMarks: 1,
    ...overrides,
  };
}

function validated(overrides: Record<string, unknown> = {}): ValidatedQuestion {
  return {
    orderIndex: 0,
    questionType: 'mc',
    instructions: 'Choose the correct option.',
    prompt: 'Which is correct?  A) had started  B) started  C) starts  D) starting',
    answerKey: 'A',
    acceptedAnswers: [],
    rejectedAnswers: [],
    rubric: { marks: 1, criteria: ['uses the past perfect'] },
    targetRule: 'past perfect vs past simple',
    explanationZh: null,
    explanationEn: 'The past perfect marks the earlier action.',
    misconceptionTags: [],
    maxMarks: 1,
    ...overrides,
  } as ValidatedQuestion;
}

// ---------------------------------------------------------------------------
// 1. Category inference — what happens when the student leaves it on 由系統判斷
// ---------------------------------------------------------------------------

describe('category inference for workbook-topic requests', () => {
  it.each<[string, PracticeCategory]>([
    ['should and could', 'grammar'],
    ['present perfect tense', 'grammar'],
    ['reported speech', 'sentence_pattern'],
    ['reported speech (ask / tell / say)', 'sentence_pattern'],
    ['too and enough', 'vocabulary'],
    ['too + adjective + to-infinitive', 'vocabulary'],
    ['phrasal verbs', 'vocabulary'],
  ])('infers %s', (requestText, expected) => {
    expect(inferCategory(requestText).category).toBe(expected);
  });

  it('accepts the plural form of every keyword family (a student copies the unit title)', () => {
    // 6B Unit 15 is literally "Infinitives with/without to" — the singular-only
    // keyword list refused the unit title itself.
    expect(inferCategory('Infinitives with or without to').category).toBe('grammar');
    expect(inferCategory('gerunds and participles').category).toBe('grammar');
    expect(inferCategory('reflexive pronouns').category).toBe('grammar');
    expect(inferCategory('comparatives and superlatives').category).toBe('sentence_pattern');
    expect(inferCategory('relative clauses').category).toBe('sentence_pattern');
    expect(inferCategory('connectives and conjunctions').category).toBe('sentence_pattern');
    expect(inferCategory('synonyms and antonyms').category).toBe('vocabulary');
    expect(inferCategory('idioms and phrases').category).toBe('vocabulary');
  });

  it('accepts a workbook unit title verbatim (6B Unit 1: similes)', () => {
    expect(inferCategory('Similes: as ... as, be ... like').category).toBe('sentence_pattern');
    // The same unit written the way a student abbreviates it.
    expect(inferCategory('as...as and be like').category).toBe('sentence_pattern');
  });

  it('does not let the descriptive word "future" contradict a named structure', () => {
    // 6A Unit 1 describes itself as "using conditional sentences with 'if' to talk
    // about the possible future" — the generic word "future" used to make this an
    // unresolvable tie (grammar vs sentence_pattern) and the request was refused.
    expect(inferCategory("if...will conditional sentences about the possible future")).toEqual({
      category: 'sentence_pattern',
      ambiguous: false,
    });
    expect(inferCategory('future tense').category).toBe('grammar');
    expect(inferCategory('the future').category).toBe('grammar');
  });

  it('does not read a politeness modal as a topic (2026-10-10 review)', () => {
    // "would" / "can" / "could" here are ordinary politeness frames, not the topic.
    // These requests name no known topic, so the platform must ask, not silently
    // choose grammar — the weak fallback used to fire on every such request.
    expect(inferCategory('I would like to practise spelling')).toEqual({ category: null, ambiguous: false });
    expect(inferCategory('Can I practise spelling?')).toEqual({ category: null, ambiguous: false });
    expect(inferCategory('Could you help me with spelling?')).toEqual({ category: null, ambiguous: false });
    // …while a modal the student actually names still works, even inside that frame.
    expect(inferCategory('I would like to practise should and could').category).toBe('grammar');
  });

  it('understands a request written in Chinese (the platform is bilingual)', () => {
    expect(inferCategory('我想練習條件句').category).toBe('sentence_pattern');
    expect(inferCategory('現在完成式').category).toBe('grammar');
    expect(inferCategory('我想練習詞彙').category).toBe('vocabulary');
    expect(inferCategory('想練片語同慣用語').category).toBe('vocabulary');
    // …but Chinese wording with no topic at all is still refused, not guessed.
    expect(inferCategory('我想練習').category).toBeNull();
  });

  it('still refuses a genuinely contradictory request (never guesses)', () => {
    expect(inferCategory('conditionals and prepositions')).toEqual({ category: null, ambiguous: true });
    expect(inferCategory('past tense and reported speech').ambiguous).toBe(true);
  });

  it('lets an explicit choice win over the wording of the request', () => {
    const result = normalizePracticeRequest({ requestText: 'conditionals and prepositions', category: 'grammar' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.category).toBe('grammar');
    expect(result.spec.interpretation).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Question-type combinations
// ---------------------------------------------------------------------------

const ALL_TYPES: PracticeQuestionType[] = ['mc', 'fill_blank', 'error_correction', 'transformation', 'sentence_production'];

describe('question-type combinations', () => {
  it.each<[PracticeQuestionType]>([['mc'], ['fill_blank'], ['error_correction'], ['transformation'], ['sentence_production']])(
    'keeps a single-type exercise of %s intact',
    type => {
      const generated = [1, 2].map(index =>
        aiQuestion({
          questionType: type,
          orderIndex: index,
          // Only mc carries lettered options (and a single-letter key).
          prompt: type === 'mc' ? `Question ${index}? A) a B) b C) c D) d` : `Question ${index} for ${type}`,
          ...(type === 'mc' ? {} : { answerKey: `answer ${index}` }),
        })
      );
      const result = validateGeneratedQuestions(generated, spec('grammar', [type]));
      expect(result.valid.map(item => item.questionType)).toEqual([type, type]);
      expect(result.dropped).toEqual([]);
    }
  );

  it('keeps every requested type when all five are ticked', () => {
    const generated = ALL_TYPES.map((type, index) =>
      aiQuestion({
        questionType: type,
        orderIndex: index,
        ...(type === 'mc'
          ? { prompt: `Question ${index}? A) a B) b C) c D) d` }
          : { prompt: `Question ${index} for ${type}`, answerKey: `answer ${index}` }),
      })
    );
    const result = validateGeneratedQuestions(generated, spec('grammar', ALL_TYPES, 5));
    expect(result.valid.map(item => item.questionType)).toEqual(ALL_TYPES);
    expect(result.dropped).toEqual([]);
  });

  it('drops an item whose type the student did not ask for', () => {
    const result = validateGeneratedQuestions(
      [aiQuestion({ questionType: 'transformation', prompt: 'Rewrite the sentence.', answerKey: 'He had left.' })],
      spec('grammar', ['mc'])
    );
    expect(result.valid).toEqual([]);
    expect(result.dropped[0].reason).toContain('not requested');
  });

  it('drops an mc item that does not present exactly four lettered options', () => {
    const result = validateGeneratedQuestions(
      [aiQuestion({ prompt: 'Which is correct? A) started B) starts C) starting' })],
      spec('grammar', ['mc'])
    );
    expect(result.valid).toEqual([]);
    expect(result.dropped[0].reason).toContain('four lettered options');
  });

  it('never delivers more items than the student asked for', () => {
    const generated = Array.from({ length: 6 }, (_, index) =>
      aiQuestion({ orderIndex: index, prompt: `Q${index}? A) a B) b C) c D) d`, targetRule: `rule ${index}` })
    );
    const result = validateGeneratedQuestions(generated, spec('grammar', ['mc'], 3));
    expect(result.valid).toHaveLength(3);
    expect(result.dropped.filter(item => item.reason.includes('exceeds'))).toHaveLength(3);
  });

  it('drops a repeated tested point and a rubric/mark mismatch', () => {
    const result = validateGeneratedQuestions(
      [
        aiQuestion({ prompt: 'Same? A) a B) b C) c D) d' }),
        aiQuestion({ orderIndex: 1, prompt: '  SAME?   A) a B) b C) c D) d ' }),
        aiQuestion({ orderIndex: 2, prompt: 'Other? A) a B) b C) c D) d', rubric: { marks: 2, criteria: ['x'] } }),
      ],
      spec('grammar', ['mc'], 5)
    );
    expect(result.valid).toHaveLength(1);
    expect(result.dropped.map(item => item.reason)).toEqual([
      'duplicate tested point (identical prompt)',
      'rubric marks (2) do not match maxMarks (1)',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3. Blind verification screen (runs before any model call)
// ---------------------------------------------------------------------------

describe('deterministic verification screen', () => {
  it('rejects an mc item that asks for more than one answer but is keyed as single-answer', () => {
    const rejections = screenForDeterministicDefects([
      validated({ instructions: 'Choose two correct options.' }),
    ]);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].reason).toContain('more than one answer');
  });

  it('rejects a rubric that never references the target rule', () => {
    const rejections = screenForDeterministicDefects([
      validated({ targetRule: 'reported speech', rubric: { marks: 1, criteria: ['spelling is correct'] } }),
    ]);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].reason).toContain('do not reference the stated target rule');
  });

  it('rejects an explanation that admits the item is defective', () => {
    const rejections = screenForDeterministicDefects([
      validated({ explanationEn: 'The correct answer is ambiguous here.' }),
    ]);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].reason).toContain('itself states the item is defective');
  });

  it('keeps an item whose explanation merely says a DISTRACTOR is wrong', () => {
    // Real teaching text. These items are sound; the old pattern rejected anything
    // containing "is incorrect/wrong/ambiguous" and silently dropped them
    // (observed live on two of ten generated sets, 2026-10-10).
    const rejections = screenForDeterministicDefects([
      validated({ explanationEn: "The error is 'will call' in the if-clause, so 'will call' is incorrect here." }),
      validated({ explanationEn: 'Option A is wrong because the if-clause never takes will.' }),
      validated({ explanationEn: "The past simple is incorrect; the action happened earlier." }),
    ]);
    expect(rejections).toEqual([]);
  });

  it('passes a clean item', () => {
    expect(screenForDeterministicDefects([validated()])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Disclosure — what the student may see before submitting
// ---------------------------------------------------------------------------

describe('pre-submission disclosure', () => {
  it('never leaks the key, accepted variants, rubric or explanations', () => {
    // A row exactly as Prisma returns it: every server-only column is present at
    // runtime, which is precisely why the mapper must not spread the row.
    const questionRow = {
      id: 'q1',
      orderIndex: 0,
      questionType: 'mc',
      instructions: 'Choose the correct option.',
      prompt: 'Which is correct? A) had started B) started C) starts D) starting',
      targetRule: 'past perfect',
      maxMarks: 1,
      answerKey: 'A',
      acceptedAnswers: '["A"]',
      rejectedAnswers: '[{"answer":"B","why":"wrong tense"}]',
      rubric: '{"marks":1,"criteria":["past perfect"]}',
      explanationEn: 'Because the action finished earlier.',
      explanationZh: '因為動作較早完成。',
      misconceptionTags: '["past simple"]',
    };
    const delivered = toDeliveredSet(
      {
        id: 'set-1',
        objective: '[grammar] past perfect',
        category: 'grammar',
        difficulty: 'intermediate',
        interpretation: null,
        createdAt: new Date('2026-10-10T00:00:00.000Z'),
        questions: [questionRow],
      } as unknown as Parameters<typeof toDeliveredSet>[0],
      false
    );

    expect(Object.keys(delivered).sort()).toEqual(
      ['category', 'createdAt', 'difficulty', 'id', 'interpretation', 'objective', 'questionCount', 'questions', 'submitted'].sort()
    );
    expect(Object.keys(delivered.questions[0]).sort()).toEqual(
      ['id', 'instructions', 'maxMarks', 'orderIndex', 'prompt', 'questionType', 'targetRule'].sort()
    );
    expect(JSON.stringify(delivered)).not.toMatch(/answerKey|acceptedAnswers|rubric|explanation|misconception/i);
  });
});

// ---------------------------------------------------------------------------
// 5. Marking a multiple-choice answer (the deterministic path)
// ---------------------------------------------------------------------------

describe('multiple-choice marking as a student experiences it', () => {
  const base = { questionId: 'q1', answerKey: 'B', acceptedAnswers: [], maxMarks: 1 };

  it('accepts the letter however the student types it', () => {
    for (const answerText of ['B', 'b', ' B ', 'B.', 'b)']) {
      expect(gradeObjectiveItem({ ...base, answerText }).verdict, answerText).toBe('correct');
    }
  });

  it('accepts a listed alternative spelling of the key', () => {
    expect(gradeObjectiveItem({ ...base, answerText: 'had started', answerKey: 'had start', acceptedAnswers: ['had started'] }).verdict).toBe('correct');
  });

  it('marks an unanswered question wrong without inventing a review flag', () => {
    const graded = gradeObjectiveItem({ ...base, answerText: '   ' });
    expect(graded.verdict).toBe('incorrect');
    expect(graded.awardedMarks).toBe(0);
    expect(graded.needsReview).toBe(false);
    expect(graded.rationaleZh).toBeTruthy();
  });

  it('never marks a wrong letter as correct', () => {
    expect(gradeObjectiveItem({ ...base, answerText: 'C' }).verdict).toBe('incorrect');
  });

  it('normalizes curly apostrophes so a copied answer still matches', () => {
    expect(normalizeFreeTextAnswer('I can\u2019t go.')).toBe(normalizeFreeTextAnswer("I can't go"));
  });
});
