// ============================================
// IELTS Speaking Topic Bank — content integrity tests
// ============================================
// The bank is platform-original teaching content. These tests pin structural
// quality so future edits cannot ship empty or malformed preparation material.
import { describe, expect, it } from 'vitest';
import {
  IELTS_SPEAKING_TOPIC_BANK,
  IELTS_SPEAKING_TOPIC_CATEGORIES,
  findSpeakingTopicById,
  getSpeakingTopicsByCategory,
  getSpeakingTopicsForPart,
} from '../speaking/topic-bank';

describe('topic bank integrity', () => {
  it('every topic has unique id, non-empty prompt and full teaching material', () => {
    const ids = new Set<string>();
    for (const topic of IELTS_SPEAKING_TOPIC_BANK) {
      expect(ids.has(topic.id), `duplicate id ${topic.id}`).toBe(false);
      ids.add(topic.id);
      expect(topic.prompt.trim().length).toBeGreaterThan(20);
      expect(topic.prepPointers.length).toBeGreaterThanOrEqual(1);
      expect(topic.languageFunctions.length).toBeGreaterThanOrEqual(1);
      expect(topic.pitfalls.length).toBeGreaterThanOrEqual(1);
      for (const fn of topic.languageFunctions) {
        expect(fn.function.trim().length).toBeGreaterThan(0);
        expect(fn.examples.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('no duplicate prompts', () => {
    const prompts = IELTS_SPEAKING_TOPIC_BANK.map((t) => t.prompt.trim().toLowerCase());
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it('part and category are consistent', () => {
    for (const topic of IELTS_SPEAKING_TOPIC_BANK) {
      if (topic.category === 'part1_themes') expect(topic.part).toBe('speaking_part1');
      if (['people', 'places', 'objects_things', 'events_experiences'].includes(topic.category)) {
        expect(topic.part).toBe('speaking_part2');
      }
      if (topic.category === 'part3_functions') expect(topic.part).toBe('speaking_part3');
    }
  });

  it('Part 2 cue cards carry the "You should say" facets', () => {
    const part2 = getSpeakingTopicsForPart('speaking_part2');
    expect(part2.length).toBeGreaterThanOrEqual(8);
    for (const topic of part2) {
      expect(topic.cueFacets, `${topic.id} missing cueFacets`).toBeDefined();
      expect(topic.cueFacets!.length).toBeGreaterThanOrEqual(3);
      expect(topic.prompt).toContain('You should say');
    }
  });

  it('every category has at least 2 entries', () => {
    for (const category of IELTS_SPEAKING_TOPIC_CATEGORIES) {
      expect(
        getSpeakingTopicsByCategory(category.key).length,
        `category ${category.key} under-populated`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('Part 3 entries are question-shaped (functions to practise)', () => {
    for (const topic of getSpeakingTopicsForPart('speaking_part3')) {
      expect(topic.prompt).toMatch(/\?/);
    }
  });

  it('lookup by id works and returns null for unknown ids', () => {
    expect(findSpeakingTopicById('p2-place-relax')?.title).toContain('relax');
    expect(findSpeakingTopicById('does-not-exist')).toBeNull();
  });

  it('preparation material avoids score/band language (no scoring promises)', () => {
    for (const topic of IELTS_SPEAKING_TOPIC_BANK) {
      const text = JSON.stringify(topic);
      expect(text).not.toMatch(/\bband\s*\d/i);
      expect(text).not.toMatch(/examiner would/i);
    }
  });
});
