// ============================================
// IELTS Starter Content — content-integrity screen (2026-10-03 V)
// ============================================
// The REAL deterministic validator runs against the real starter sets: fixed
// content that fails its own machine screen would be a bug (declared content
// must remain publishable). No mocks here on purpose.
import { describe, expect, it } from 'vitest';
import { IELTS_STARTER_SETS } from '../content/starter-sets';
import { emptyBatchContext, validateIeltsQuestion } from '../validation/question-validator';
import { IELTS_DIFFICULTY_MODEL_VERSION } from '../domain/types';

describe('starter sets pass the machine screen', () => {
  it('every question passes validateIeltsQuestion (with its passage/transcript)', () => {
    for (const set of IELTS_STARTER_SETS) {
      const batch = emptyBatchContext();
      set.questions.forEach((q, index) => {
        const report = validateIeltsQuestion(
          {
            id: `${set.slug}-q${index + 1}`,
            testId: set.slug,
            orderIndex: index,
            questionType: q.questionType,
            skill: set.skill,
            prompt: q.prompt,
            options: q.options,
            answerKey: q.answerKey,
            acceptedAnswers: q.acceptedAnswers,
            wordLimit: q.wordLimit,
            evidence: q.evidence,
            explanation: q.explanation,
            difficulty: q.difficulty,
            difficultyModel: IELTS_DIFFICULTY_MODEL_VERSION,
            contentSource: { type: 'ORIGINAL_GENERATED' },
            generatorVersion: 'starter-content-v1',
            validationStatus: 'DRAFT',
          },
          { passageText: set.passageText ?? null, transcriptText: set.transcriptText ?? null },
          batch,
        );
        expect(report.ok, `${set.slug} q${index + 1}: ${report.issues.map((i) => i.code).join(',')}`).toBe(true);
      });
    }
  });

  it('slugs are unique and each set carries teachable content', () => {
    const slugs = IELTS_STARTER_SETS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const set of IELTS_STARTER_SETS) {
      expect(set.questions.length).toBeGreaterThanOrEqual(2);
      expect((set.passageText ?? set.transcriptText ?? '').length).toBeGreaterThan(200);
      // Reading sets need a passage; listening sets need a transcript.
      if (set.skill === 'READING') expect(set.passageText).toBeTruthy();
      if (set.skill === 'LISTENING') expect(set.transcriptText).toBeTruthy();
    }
  });

  it('no starter question is a multi-answer item (official numbering: one answer each)', () => {
    for (const set of IELTS_STARTER_SETS) {
      for (const q of set.questions) {
        expect(Array.isArray(q.answerKey)).toBe(false);
      }
    }
  });
});
