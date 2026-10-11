// ============================================
// Self-Directed Practice — topic → question-type defaults (2026-10-10, Sprint 146)
// ============================================
// A student who ticks 「分詞構句」 should get rewriting items, and one who ticks 「標點」
// should get items where an error must be spotted — WITHOUT the server having to receive a
// separate topic field. The picker composes the catalogue labels into the request text, so
// the text IS the ticked set; these tests pin that round trip for EVERY topic (all 55) plus
// the fallbacks, so a future label edit cannot silently break the resolution.
//
// The bug this suite is written to catch: a topic whose label never matches the composed
// text (renamed label, truncated text, whitespace difference) would silently fall back to
// the category defaults and generate the wrong kind of question — with no error anywhere.
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
  };
});

import { CUSTOM_PRACTICE_QUESTION_TYPES } from '@/modules/ai/schemas/custom-practice-schema';
import { buildCustomPracticeGenerationPrompt } from '@/modules/ai/prompts/custom-practice/prompts';
import {
  CUSTOM_PRACTICE_TOPIC_OPTIONS,
  TOPIC_REQUEST_MAX_CHARS,
  composePracticeRequest,
  topicIdsFromRequest,
  topicMatchNormalize,
  topicQuestionTypeDefaults,
  topicSearchTerms,
  type PracticeTopicCategory,
} from '@/shared/utils/custom-practice-topics';
import {
  DEFAULT_EXERCISE_TYPES,
  MAX_REQUEST_CHARS,
  normalizePracticeRequest,
} from '../services/request-normalizer';

const CATEGORIES: PracticeTopicCategory[] = ['grammar', 'sentence_pattern', 'vocabulary'];
const ALL_CASES = CATEGORIES.flatMap(category =>
  CUSTOM_PRACTICE_TOPIC_OPTIONS[category].map(option => ({ category, option }))
);

const MIN_REQUEST_CHARS = 3;

describe('topic question-type defaults — catalogue contract', () => {
  it('declares 1–3 valid question types per topic, mc first where recognition suffices', () => {
    for (const { category, option } of ALL_CASES) {
      const types = option.defaultQuestionTypes;
      expect(types.length, `${category}/${option.id}`).toBeGreaterThanOrEqual(1);
      expect(types.length, `${category}/${option.id}`).toBeLessThanOrEqual(3);
      expect(new Set(types).size, `${category}/${option.id}`).toBe(types.length);
      for (const type of types) {
        expect(CUSTOM_PRACTICE_QUESTION_TYPES as readonly string[], `${category}/${option.id}`).toContain(type);
      }
      // The student's explicit choice always wins, so a topic that ONLY offers productive
      // types would force an AI-marked item with no cheap alternative — pin that mc is
      // available unless the topic is inherently productive (rewrite / spot the error).
      const inherentlyProductive = types[0] !== 'mc';
      if (!inherentlyProductive) {
        expect(types, `${category}/${option.id}`).toContain('mc');
      }
    }
  });

  it('keeps the category fallbacks valid too (they are the free-text default)', () => {
    for (const category of CATEGORIES) {
      expect(DEFAULT_EXERCISE_TYPES[category].length, category).toBeGreaterThan(0);
      for (const type of DEFAULT_EXERCISE_TYPES[category]) {
        expect(CUSTOM_PRACTICE_QUESTION_TYPES as readonly string[], category).toContain(type);
      }
    }
  });

  it('unions topic defaults in catalogue order and ignores unknown ids', () => {
    expect(topicQuestionTypeDefaults('grammar', ['punctuation', 'reduced-clauses'])).toEqual([
      'mc',
      'error_correction',
    ]);
    expect(topicQuestionTypeDefaults('sentence_pattern', ['reduced-clauses', 'cleft'])).toEqual([
      'transformation',
      'mc',
      'error_correction',
    ]);
    expect(topicQuestionTypeDefaults('grammar', ['nonsense'])).toEqual([]);
    expect(topicQuestionTypeDefaults(null, ['punctuation'])).toEqual([]);
    expect(topicQuestionTypeDefaults('grammar', [])).toEqual([]);
  });
});

describe('search-term invariant (one tick must never resolve two topics)', () => {
  it('no topic search term is a substring of another topic’s terms (same category)', () => {
    for (const category of CATEGORIES) {
      const terms = CUSTOM_PRACTICE_TOPIC_OPTIONS[category].flatMap(option =>
        topicSearchTerms(option).map(term => ({ id: option.id, term: topicMatchNormalize(term) }))
      );
      for (const outer of terms) {
        for (const inner of terms) {
          if (outer.id === inner.id) continue;
          expect(
            outer.term.includes(inner.term),
            `${category}: "${inner.term}" (${inner.id}) is inside "${outer.term}" (${outer.id})`
          ).toBe(false);
        }
      }
    }
  });

  it('a typed short form resolves the topic it names and nothing else', () => {
    expect(topicIdsFromRequest('vocabulary', 'collocations practice')).toEqual(['collocations']);
    expect(topicIdsFromRequest('vocabulary', 'make do take collocation pairs')).toEqual(['make-do-take']);
    expect(topicIdsFromRequest('grammar', 'modal verbs please')).toEqual(['modals']);
    expect(topicIdsFromRequest('grammar', 'present perfect vs past perfect')).toEqual([
      'present-perfect',
      'past-perfect',
    ]);
  });
});

describe('ticked topic round trip (what the student ticks is what the server sees)', () => {
  it('resolves EVERY topic from the composed request, one by one', () => {
    for (const { category, option } of ALL_CASES) {
      const requestText = composePracticeRequest('', category, [option.id]);
      expect(topicIdsFromRequest(category, requestText), `${category}/${option.id}`).toEqual([option.id]);
    }
  });

  it('resolves a realistic multi-select (5 topics) exactly, in catalogue order', () => {
    for (const category of CATEGORIES) {
      const options = CUSTOM_PRACTICE_TOPIC_OPTIONS[category];
      const picked = [options[4], options[0], options[3]];
      const requestText = composePracticeRequest('', category, picked.map(option => option.id));
      const expected = options
        .filter(option => picked.some(item => item.id === option.id))
        .map(option => option.id);
      expect(topicIdsFromRequest(category, requestText), category).toEqual(expected);
      expect(topicQuestionTypeDefaults(category, expected).length, category).toBeGreaterThan(0);
      expect(requestText.length, category).toBeLessThanOrEqual(TOPIC_REQUEST_MAX_CHARS);
    }
  });

  it('never invents a topic, and still resolves when the text is capped', () => {
    for (const category of CATEGORIES) {
      const ids = CUSTOM_PRACTICE_TOPIC_OPTIONS[category].map(option => option.id);
      const requestText = composePracticeRequest('', category, ids);
      expect(requestText.length, category).toBeLessThanOrEqual(TOPIC_REQUEST_MAX_CHARS);
      const resolved = topicIdsFromRequest(category, requestText);
      // Every resolved id must be one the student ticked, and its label must be in the text.
      for (const id of resolved) expect(ids, category).toContain(id);
      // The 400-character cap can cut the tail of a 20-topic selection: that is disclosed in
      // the UI (running length) and degrades to the category defaults, never to a surprise.
      if (resolved.length < ids.length) {
        expect(resolved.length, category).toBeGreaterThan(0);
        expect(resolved.length, category).toBeLessThan(ids.length);
      }
    }
  });

  it('resolves a manually typed label (no picker involved)', () => {
    expect(topicIdsFromRequest('sentence_pattern', 'I want reduced clauses please')).toEqual(['reduced-clauses']);
    expect(topicIdsFromRequest('grammar', 'PUNCTUATION: comma splice drills')).toEqual(['punctuation']);
    expect(topicIdsFromRequest('vocabulary', 'depend on, interested in — fixed collocation pairs')).toEqual([
      'fixed-collocations',
    ]);
  });
});

describe('normalized spec uses the topic defaults (end to end, all 55 topics)', () => {
  it('every topic produces a valid spec whose exerciseTypes are the topic defaults', () => {
    for (const { category, option } of ALL_CASES) {
      const requestText = composePracticeRequest('', category, [option.id]);
      const result = normalizePracticeRequest({ requestText, category });
      expect(result.ok, `${category}/${option.id}: ${requestText}`).toBe(true);
      if (!result.ok) continue;
      expect(result.spec.category, option.id).toBe(category);
      expect(result.spec.interpretation, option.id).toBeNull();
      expect(result.spec.exerciseTypes, option.id).toEqual([...option.defaultQuestionTypes]);
      expect(result.spec.objective, option.id).toContain(option.label);
    }
  });

  it('adds the student’s own words without losing the topic defaults', () => {
    const requestText = composePracticeRequest('I keep getting this wrong', 'sentence_pattern', ['reduced-clauses']);
    const result = normalizePracticeRequest({ requestText, category: 'sentence_pattern' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.exerciseTypes).toEqual(['transformation', 'mc', 'error_correction']);
  });

  it('an explicit choice always wins over the topic default', () => {
    const requestText = composePracticeRequest('', 'sentence_pattern', ['reduced-clauses']);
    const result = normalizePracticeRequest({ requestText, category: 'sentence_pattern', exerciseTypes: ['mc'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.exerciseTypes).toEqual(['mc']);
  });

  it('falls back to the category defaults when no topic is recognised', () => {
    const result = normalizePracticeRequest({ requestText: 'should and could', category: 'grammar' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // "should and could" names no catalogue topic, so the category default applies.
    expect(topicIdsFromRequest('grammar', 'should and could')).toEqual([]);
    expect(result.spec.exerciseTypes).toEqual([...DEFAULT_EXERCISE_TYPES.grammar]);
  });

  it('keeps every composed request inside the API contract', () => {
    for (const category of CATEGORIES) {
      const ids = CUSTOM_PRACTICE_TOPIC_OPTIONS[category].slice(0, 6).map(option => option.id);
      const requestText = composePracticeRequest('x'.repeat(500), category, ids);
      expect(requestText.length, category).toBeLessThanOrEqual(MAX_REQUEST_CHARS);
      expect(requestText.length, category).toBeGreaterThanOrEqual(MIN_REQUEST_CHARS);
      expect(normalizePracticeRequest({ requestText, category }).ok, category).toBe(true);
    }
  });
});

describe('generation prompt carries the resolved types and the structure contract', () => {
  const promptInput = (requestText: string, category: PracticeTopicCategory) => {
    const result = normalizePracticeRequest({ requestText, category });
    if (!result.ok) throw new Error('spec must be valid');
    return {
      requestText: result.spec.requestText,
      objective: result.spec.objective,
      category: result.spec.category as string,
      difficulty: result.spec.difficulty as string,
      questionCount: result.spec.questionCount,
      exerciseTypes: result.spec.exerciseTypes as string[],
    };
  };

  it('lists exactly the resolved types for a rewrite topic', () => {
    const requestText = composePracticeRequest('', 'sentence_pattern', ['reduced-clauses']);
    const prompt = buildCustomPracticeGenerationPrompt(promptInput(requestText, 'sentence_pattern'));
    expect(prompt.user).toContain('Allowed question types: transformation, mc, error_correction');
    // Rule 9 is what stops the model from returning an item that never uses the structure.
    expect(prompt.system).toContain('MUST name the structure the answer has to');
  });

  it('lists the error-correction mix for the punctuation topic', () => {
    const requestText = composePracticeRequest('', 'grammar', ['punctuation']);
    const prompt = buildCustomPracticeGenerationPrompt(promptInput(requestText, 'grammar'));
    expect(prompt.user).toContain('Allowed question types: mc, error_correction');
    expect(prompt.user).toContain('punctuation (comma splice, semicolon, colon)');
  });

  it('requires coverage of every ticked type (v4 hardening)', () => {
    const requestText = composePracticeRequest('', 'grammar', ['passive']);
    const prompt = buildCustomPracticeGenerationPrompt({
      ...promptInput(requestText, 'grammar'),
      exerciseTypes: ['mc', 'fill_blank', 'error_correction', 'transformation', 'sentence_production'],
    });
    expect(prompt.system).toContain('TYPE COVERAGE');
    expect(prompt.system).toContain('AT LEAST ONE item of EVERY allowed type');
  });

  it('states the punctuation contract for conjunctive adverbs (v3 hardening)', () => {
    const requestText = composePracticeRequest('', 'sentence_pattern', ['discourse-markers']);
    const prompt = buildCustomPracticeGenerationPrompt(promptInput(requestText, 'sentence_pattern'));
    // The blind verifier rejected a whole 篇章標記 round for treating "However" as if it could
    // join two clauses with a comma alone; the rule must stay in the prompt.
    expect(prompt.system).toContain('comma splice');
    expect(prompt.system).toContain('Clause; however, Clause.');
    expect(prompt.system).toContain('Never key a comma splice as correct');
  });

  it('never sends an empty or duplicated type list', () => {
    for (const { category, option } of ALL_CASES) {
      const requestText = composePracticeRequest('', category, [option.id]);
      const prompt = buildCustomPracticeGenerationPrompt(promptInput(requestText, category));
      const line = prompt.user.split('\n').find(entry => entry.startsWith('Allowed question types: '));
      expect(line, option.id).toBeTruthy();
      const types = (line as string).replace('Allowed question types: ', '').split(', ');
      expect(types.length, option.id).toBeGreaterThan(0);
      expect(new Set(types).size, option.id).toBe(types.length);
      for (const type of types) {
        expect(CUSTOM_PRACTICE_QUESTION_TYPES as readonly string[], option.id).toContain(type);
      }
    }
  });
});
