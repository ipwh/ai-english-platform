// ============================================
// Self-Directed Practice — 造句 (sentence_production) contract (2026-10-10, Sprint 146)
// ============================================
// `sentence_production` is the only question type the server CANNOT mark itself: it is never
// in OBJECTIVE_QUESTION_TYPES, so it always reaches the AI marker and falls back to
// 待覆核 (needs_review) when the marker is unsure. That makes two things contract-worthy:
//
//   1. WHICH topics may default to it (production must be the point of the topic, not a
//      way to avoid writing a keyed item), and
//   2. what an unmarked item may look like: needs_review never invents marks and never
//      turns into "incorrect" — a student must never lose credit for an answer nobody
//      marked, and must never be told they were wrong when nobody decided.
//
// The live needs_review rate is measured separately by
// `CP_LIVE_SIM=1 npx tsx scripts/measure-sentence-production.ts` — a rate can only be
// measured against a provider, so it is not asserted here.
// ============================================

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/ai', async () => {
  const schema = await vi.importActual<typeof import('@/modules/ai/schemas/custom-practice-schema')>(
    '@/modules/ai/schemas/custom-practice-schema'
  );
  return {
    CUSTOM_PRACTICE_CATEGORIES: schema.CUSTOM_PRACTICE_CATEGORIES,
    CUSTOM_PRACTICE_DIFFICULTIES: schema.CUSTOM_PRACTICE_DIFFICULTIES,
    CUSTOM_PRACTICE_QUESTION_TYPES: schema.CUSTOM_PRACTICE_QUESTION_TYPES,
    gradeCustomPracticeWithAI: vi.fn(() => {
      throw new Error('the contract under test must not need the AI marker');
    }),
  };
});

import { CUSTOM_PRACTICE_TOPIC_OPTIONS, composePracticeRequest, type PracticeTopicCategory } from '@/shared/utils/custom-practice-topics';
import { isObjectiveQuestionType } from '../domain/types';
import { normalizePracticeRequest } from '../services/request-normalizer';
import { gradeCustomPracticeAnswers } from '../services/grading-service';

const CATEGORIES: PracticeTopicCategory[] = ['grammar', 'sentence_pattern', 'vocabulary'];

const PRODUCTION_TOPICS = CATEGORIES.flatMap(category =>
  CUSTOM_PRACTICE_TOPIC_OPTIONS[category]
    .filter(option => option.defaultQuestionTypes.includes('sentence_production'))
    .map(option => `${category}/${option.id}`)
);

describe('造句 is only a default where production IS the skill', () => {
  it('pins the exact set of production topics (a new one needs a deliberate decision)', () => {
    expect(PRODUCTION_TOPICS.sort()).toEqual(
      [
        'sentence_pattern/discourse-markers',
        'sentence_pattern/similes',
        'vocabulary/expressions',
        'vocabulary/idioms',
        'vocabulary/topic-vocabulary',
      ].sort()
    );
  });

  it('never recommends production as the FIRST type for a topic that can be keyed', () => {
    for (const topic of PRODUCTION_TOPICS) {
      const [category, id] = topic.split('/') as [PracticeTopicCategory, string];
      const option = CUSTOM_PRACTICE_TOPIC_OPTIONS[category].find(item => item.id === id);
      expect(option, topic).toBeTruthy();
      // mc or fill_blank first: a student who leaves 題型 blank still gets markable items.
      expect(['mc', 'fill_blank'], topic).toContain(option?.defaultQuestionTypes[0]);
    }
  });

  it('a production topic still resolves and keeps sentence_production in its mix', () => {
    for (const topic of PRODUCTION_TOPICS) {
      const [category, id] = topic.split('/') as [PracticeTopicCategory, string];
      const result = normalizePracticeRequest({ requestText: composePracticeRequest('', category, [id]), category });
      expect(result.ok, topic).toBe(true);
      if (!result.ok) continue;
      expect(result.spec.exerciseTypes, topic).toContain('sentence_production');
    }
  });
});

describe('the student’s own type choice is never second-guessed', () => {
  it('accepts 造句 for a topic that does not recommend it', () => {
    const requestText = composePracticeRequest('', 'grammar', ['punctuation']);
    const result = normalizePracticeRequest({ requestText, category: 'grammar', exerciseTypes: ['sentence_production'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.exerciseTypes).toEqual(['sentence_production']);
  });

  it('unions a production topic with a keyed topic in catalogue order', () => {
    const result = normalizePracticeRequest({
      requestText: composePracticeRequest('', 'vocabulary', ['fixed-collocations', 'idioms']),
      category: 'vocabulary',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // fixed-collocations first (catalogue order) → fill_blank, mc, error_correction,
    // then idioms adds sentence_production.
    expect(result.spec.exerciseTypes).toEqual(['fill_blank', 'mc', 'error_correction', 'sentence_production']);
  });
});

describe('an unmarked item is never wrong and never credited', () => {
  it('造句 is not an objective type (it always needs the marker)', () => {
    expect(isObjectiveQuestionType('sentence_production')).toBe(false);
    expect(isObjectiveQuestionType('mc')).toBe(true);
  });

  it('an unanswered 造句 item becomes needs_review with zero marks, without calling the AI', async () => {
    const graded = await gradeCustomPracticeAnswers({
      spec: { category: 'vocabulary', difficulty: 'intermediate' },
      objective: [],
      questions: [
        {
          questionId: 'sp-1',
          questionType: 'sentence_production',
          instructions: 'Write one sentence using a discourse marker.',
          prompt: 'Write a sentence that links two contrasting ideas.',
          targetRule: 'discourse markers (However / Therefore / In addition)',
          rubric: JSON.stringify({ marks: 1, criteria: ['uses a contrastive discourse marker'] }),
          maxMarks: 1,
          answerKey: 'However, the plan was too expensive.',
          acceptedAnswers: [],
          rejectedAnswers: [],
          explanationEn: '',
          answerText: '',
        },
      ],
    });

    expect(graded.items).toHaveLength(1);
    expect(graded.items[0].verdict).toBe('needs_review');
    expect(graded.items[0].awardedMarks).toBe(0);
    expect(graded.items[0].needsReview).toBe(true);
    expect(graded.degraded).toBe(true);
    // The whole point: nothing was marked, so nothing may claim the student was wrong.
    expect(graded.items[0].rationale.toLowerCase()).not.toContain('incorrect');
  });
});
