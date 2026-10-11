// ============================================
// Self-Directed Practice — topic catalogue & request composition (2026-10-10)
// ============================================
// The topic picker exists to lower the barrier: a student who cannot name a structure
// can tick one. Three things must therefore hold, and all are pinned here:
//   1. every catalogue label is a request the platform can categorise on its own
//      (so a ticked topic behaves exactly like a typed one),
//   2. the catalogue stays inside the API's contract (3–400 characters) and never
//      silently loses the student's own words without saying so in the UI,
//   3. the catalogue actually covers the syllabus the teacher listed (2026-10-10:
//      clause structures, moods, emphasis, modal perfects, collocations…), so a
//      future edit cannot quietly drop a topic family again.
// ============================================

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/ai', () => ({
  CUSTOM_PRACTICE_CATEGORIES: ['grammar', 'sentence_pattern', 'vocabulary'],
  CUSTOM_PRACTICE_DIFFICULTIES: ['basic', 'intermediate', 'advanced'],
  CUSTOM_PRACTICE_QUESTION_TYPES: ['mc', 'fill_blank', 'error_correction', 'transformation', 'sentence_production'],
}));

import {
  CUSTOM_PRACTICE_TOPIC_GROUPS,
  CUSTOM_PRACTICE_TOPIC_OPTIONS,
  TOPIC_REQUEST_MAX_CHARS,
  composePracticeRequest,
  composePracticeRequestPlan,
  topicLabelsFor,
  type PracticeTopicCategory,
} from '@/shared/utils/custom-practice-topics';
import { inferCategory, MAX_REQUEST_CHARS, MIN_REQUEST_CHARS, normalizePracticeRequest } from '@/modules/custom-practice/services/request-normalizer';

const CATEGORIES: PracticeTopicCategory[] = ['grammar', 'sentence_pattern', 'vocabulary'];

describe('topic catalogue', () => {
  it('stays inside the API request limit (the constant is a copy, so pin it)', () => {
    expect(TOPIC_REQUEST_MAX_CHARS).toBe(MAX_REQUEST_CHARS);
    expect(MIN_REQUEST_CHARS).toBeLessThan(TOPIC_REQUEST_MAX_CHARS);
  });

  it('offers grouped topics for every category, with unique ids and bilingual labels', () => {
    const allIds = new Set<string>();
    const MINIMUM_PER_CATEGORY: Record<PracticeTopicCategory, number> = {
      grammar: 20,
      sentence_pattern: 18,
      vocabulary: 10,
    };
    for (const category of CATEGORIES) {
      const groups = CUSTOM_PRACTICE_TOPIC_GROUPS[category];
      expect(groups.length, category).toBeGreaterThanOrEqual(2);
      for (const group of groups) {
        expect(group.labelZh.trim().length, `${category}/${group.id}`).toBeGreaterThan(1);
        expect(group.labelEn.trim().length, `${category}/${group.id}`).toBeGreaterThan(2);
        expect(group.options.length, `${category}/${group.id}`).toBeGreaterThanOrEqual(2);
        for (const option of group.options) {
          expect(allIds.has(option.id), `duplicate id "${option.id}"`).toBe(false);
          allIds.add(option.id);
          expect(option.label.trim().length, `${category}/${option.id}`).toBeGreaterThan(2);
          expect(option.labelZh.trim().length, `${category}/${option.id}`).toBeGreaterThan(1);
        }
      }
      // The flat catalogue is the groups flattened, in group order (label lookup relies on it).
      expect(CUSTOM_PRACTICE_TOPIC_OPTIONS[category].map(option => option.id), category).toEqual(
        groups.flatMap(group => group.options.map(option => option.id))
      );
      expect(CUSTOM_PRACTICE_TOPIC_OPTIONS[category].length, category).toBeGreaterThanOrEqual(
        MINIMUM_PER_CATEGORY[category]
      );
    }
    // 2026-10-10 expansion: 23 grammar + 21 sentence-pattern + 11 vocabulary.
    expect(allIds.size).toBeGreaterThanOrEqual(50);
  });

  it('covers the syllabus families the teacher listed', () => {
    const ids = (category: PracticeTopicCategory) => CUSTOM_PRACTICE_TOPIC_OPTIONS[category].map(o => o.id);
    // Tenses, verb/voice work, parts of speech, sentence mechanics.
    expect(ids('grammar')).toEqual(
      expect.arrayContaining([
        'present-simple', 'present-continuous', 'present-perfect',
        'past-simple', 'past-continuous', 'past-perfect', 'future',
        'modal-perfects', 'used-to', 'verb-gerund-infinitive',
        'quantifiers', 'adjectives-adverbs', 'participles', 'negation', 'punctuation',
      ])
    );
    // Clause structures, moods, emphasis/inversion, comparison, writing patterns.
    expect(ids('sentence_pattern')).toEqual(
      expect.arrayContaining([
        'relative-clauses', 'noun-clauses', 'adverbial-clauses', 'reduced-clauses',
        'conditionals', 'reported-speech', 'connectives', 'question-forms',
        'inversion', 'cleft', 'emphasis', 'subjunctive', 'wish',
        'comparatives', 'cause-effect', 'so-such',
        'word-order', 'parallelism', 'discourse-markers', 'causative', 'similes',
      ])
    );
    // Usage/collocation, meaning relations, topic vocabulary.
    expect(ids('vocabulary')).toEqual(
      expect.arrayContaining([
        'enough-too', 'fixed-collocations', 'collocations', 'make-do-take',
        'synonyms', 'confusable', 'word-forms',
        'phrasal-verbs', 'idioms', 'expressions', 'topic-vocabulary',
      ])
    );
  });

  it('every label is categorised by the platform itself (ticking == typing)', () => {
    for (const category of CATEGORIES) {
      for (const option of CUSTOM_PRACTICE_TOPIC_OPTIONS[category]) {
        expect(inferCategory(option.label).category, `${category}/${option.id}: "${option.label}"`).toBe(category);
      }
    }
  });

  it('a whole category composed together still resolves to that category', () => {
    for (const category of CATEGORIES) {
      const labels = CUSTOM_PRACTICE_TOPIC_OPTIONS[category].map(option => option.label).join(', ');
      expect(inferCategory(labels).category, category).toBe(category);
    }
  });
});

describe('composePracticeRequest', () => {
  it('sends the ticked topics (canonical English, catalogue order) before the free text', () => {
    const composed = composePracticeRequest('I keep getting this wrong', 'grammar', ['past-perfect', 'present-perfect']);
    // Catalogue order, not click order — a stable request for the model.
    expect(composed).toBe('present perfect, past perfect I keep getting this wrong');
  });

  it('works with ticking alone (the barrier-lowering path)', () => {
    const composed = composePracticeRequest('', 'sentence_pattern', ['conditionals']);
    expect(composed).toBe('conditionals (if-clauses)');
    expect(normalizePracticeRequest({ requestText: composed, category: 'sentence_pattern' }).ok).toBe(true);
  });

  it('is a plain pass-through when nothing is ticked', () => {
    expect(composePracticeRequest('  past   perfect  ', 'grammar', [])).toBe('past perfect');
    expect(composePracticeRequest('present perfect', null, ['past-perfect'])).toBe('present perfect');
  });

  it('ignores ids that belong to another category (never mixes categories)', () => {
    const composed = composePracticeRequest('', 'vocabulary', ['past-perfect', 'idioms']);
    expect(composed).toBe('idioms');
  });

  it('keeps the request inside the API limit by trimming the free text, never the topics', () => {
    const composed = composePracticeRequest('x'.repeat(600), 'grammar', ['present-perfect', 'past-simple']);
    expect(composed.length).toBe(TOPIC_REQUEST_MAX_CHARS);
    expect(composed.startsWith('present perfect, past simple ')).toBe(true);
    expect(normalizePracticeRequest({ requestText: composed, category: 'grammar' }).ok).toBe(true);
  });

  it('includes only WHOLE topics when the ticked set does not fit (never slices a label)', () => {
    const everyGrammarTopic = CUSTOM_PRACTICE_TOPIC_OPTIONS.grammar.map(option => option.id);
    const plan = composePracticeRequestPlan('my own words', 'grammar', everyGrammarTopic);

    expect(plan.text.length).toBeLessThanOrEqual(TOPIC_REQUEST_MAX_CHARS);
    expect(plan.omittedTopicIds.length).toBeGreaterThan(0);
    // Every included id is a complete, resolvable topic — nothing half-written.
    expect(plan.includedTopicIds.length + plan.omittedTopicIds.length).toBe(everyGrammarTopic.length);
    for (const id of plan.includedTopicIds) {
      expect(topicLabelsFor('grammar', [id])).toHaveLength(1);
      expect(plan.text).toContain(topicLabelsFor('grammar', [id])[0]);
    }
    // The text is a clean prefix: every comma-separated part is a known label or the user's words.
    const labels = topicLabelsFor('grammar', plan.includedTopicIds);
    expect(plan.text.startsWith(labels.join(', '))).toBe(true);
  });

  it('reports nothing omitted for a selection that fits', () => {
    const plan = composePracticeRequestPlan('', 'vocabulary', ['idioms', 'expressions']);
    expect(plan.omittedTopicIds).toEqual([]);
    expect(plan.includedTopicIds).toEqual(['idioms', 'expressions']);
  });

  it('a composed request always passes the normalizer for its own category', () => {
    for (const category of CATEGORIES) {
      const options = CUSTOM_PRACTICE_TOPIC_OPTIONS[category];
      const composed = composePracticeRequest('', category, options.map(option => option.id));
      const result = normalizePracticeRequest({ requestText: composed, category });
      expect(result.ok, `${category}: ${composed}`).toBe(true);
      if (!result.ok) continue;
      expect(result.spec.category).toBe(category);
      // The stored objective must still show what was asked for (it is the request text).
      expect(result.spec.objective).toContain(options[0].label);
    }
  });

  it('topicLabelsFor returns labels in catalogue order and drops unknown ids', () => {
    expect(topicLabelsFor('grammar', ['past-simple', 'nonsense', 'present-simple'])).toEqual([
      'present simple',
      'past simple',
    ]);
    expect(topicLabelsFor(null, ['present-simple'])).toEqual([]);
  });
});
