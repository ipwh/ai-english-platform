import { describe, expect, it } from 'vitest';
import {
  DAILY_QUESTION_TYPES,
  DAILY_TOPICS,
  MC_ONLY_TOPICS,
  resolveDailyQuestionType,
  resolveDailyTopic,
} from '../services/daily-challenge-rotation';

describe('daily-challenge-rotation — canonical topic/type selection', () => {
  it('resolveDailyTopic stays within the 30-day cycle for any day of year', () => {
    for (let day = 0; day < 365; day++) {
      expect(DAILY_TOPICS).toContain(resolveDailyTopic(day));
    }
    // negative day-of-year should not throw and should still map inside the cycle
    expect(DAILY_TOPICS).toContain(resolveDailyTopic(-3));
  });

  it('every MC_ONLY topic exists in the topic cycle', () => {
    for (const topic of MC_ONLY_TOPICS) {
      expect(DAILY_TOPICS).toContain(topic);
    }
  });

  it('open-ended topics are ALWAYS mc, regardless of day parity', () => {
    for (const topic of MC_ONLY_TOPICS) {
      for (let day = 0; day < 60; day++) {
        expect(resolveDailyQuestionType(topic, day)).toBe('mc');
      }
    }
  });

  it('closed topics alternate mc/fill-blank by day parity', () => {
    const closedTopic = 'tenses';
    expect(MC_ONLY_TOPICS.has(closedTopic)).toBe(false);
    // day 0 → mc, day 1 → fill-blank (QUESTION_TYPES = ['mc', 'fill-blank'])
    expect(resolveDailyQuestionType(closedTopic, 0)).toBe('mc');
    expect(resolveDailyQuestionType(closedTopic, 1)).toBe('fill-blank');
    expect(resolveDailyQuestionType(closedTopic, 2)).toBe('mc');
    // every closed topic's type must be one of the two valid values
    for (const topic of DAILY_TOPICS) {
      if (MC_ONLY_TOPICS.has(topic)) continue;
      expect(DAILY_QUESTION_TYPES).toContain(resolveDailyQuestionType(topic, 7));
    }
  });

  it('question-forms (the reported bug) never produces fill-blank', () => {
    // Sweep the full topic cycle to make sure the question-forms slot
    // never lands on fill-blank regardless of which day it falls on.
    for (let day = 0; day < DAILY_TOPICS.length; day++) {
      const topic = resolveDailyTopic(day);
      const type = resolveDailyQuestionType(topic, day);
      if (topic === 'question-forms') {
        expect(type).toBe('mc');
      }
    }
  });
});
