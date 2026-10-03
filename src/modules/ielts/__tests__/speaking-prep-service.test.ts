// ============================================
// IELTS Speaking Preparation Service — no-score contract tests
// ============================================
// The AI coach is mocked. These tests prove:
//   * preparation output is returned structurally
//   * NO score/band field ever exists in the result or the persisted row
//   * score-language in coach text is filtered
//   * unusable output / provider failures are typed and persisted as FAILED
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepareIeltsSpeakingWithAI: vi.fn(),
  createAssessment: vi.fn(),
}));

vi.mock('@/modules/ai', () => ({
  prepareIeltsSpeakingWithAI: mocks.prepareIeltsSpeakingWithAI,
}));

vi.mock('@/modules/ielts/repositories/ielts-repo', () => ({
  createAssessment: mocks.createAssessment,
  listPairedCalibrationRecords: vi.fn(),
}));

import { prepareIeltsSpeaking, type IeltsSpeakingPrepDeps } from '../services/speaking-prep-service';
import type { IeltsSpeakingPrepAiResult } from '@/modules/ai';

type PersistFn = NonNullable<IeltsSpeakingPrepDeps['persist']>;

function aiOk(data: Record<string, unknown>): IeltsSpeakingPrepAiResult {
  return {
    ok: true as const,
    data: data as never,
    provider: 'deepseek',
    durationMs: 800,
    promptVersion: 'IELTS_SPEAKING_PREP_V1',
    promptHash: 'hash',
  };
}

const persist = vi.fn<PersistFn>(async () => ({ id: 'prep-1' }));

const baseInput = {
  userId: 'student-1',
  part: 'speaking_part2' as const,
  topicPrompt: 'Describe a place where you like to relax. You should say: where it is; how often you go there.',
};

const GOOD_COACH_OUTPUT = {
  plan: { focus: 'Build one strong personal story', steps: ['Pick a real place', 'Map four facets to keywords'] },
  outline: [{ facet: 'where it is', ideas: ['riverside park', '10 min from home'] }],
  usefulLanguage: [{ item: 'Describing routine', example: 'I tend to go there whenever…', usage: 'Part 1 & 2' }],
  pitfalls: ['Listing features without feelings'],
  followUpQuestions: ['Why do people need quiet places in cities?'],
  mergeSuggestions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  persist.mockResolvedValue({ id: 'prep-1' });
});

describe('successful preparation — the no-score contract', () => {
  it('returns a PREPARATION_ONLY result with no score fields', async () => {
    const outcome = await prepareIeltsSpeaking(baseInput, {
      prepare: async () => aiOk(GOOD_COACH_OUTPUT),
      persist,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.kind).toBe('PREPARATION_ONLY');
      expect(outcome.result.notice).toBe('NO_SPEAKING_SCORE_OFFERED');
      // Structural no-score guarantee: these fields do not exist at all.
      expect('estimatedBand' in outcome.result).toBe(false);
      expect('languageBandEstimate' in outcome.result).toBe(false);
      expect(outcome.result.plan.steps.length).toBeGreaterThan(0);
      expect(outcome.result.limitations.join(' ')).toMatch(/does not assess Speaking/);
    }
  });

  it('persists NULL bands (never a fabricated number)', async () => {
    await prepareIeltsSpeaking(baseInput, { prepare: async () => aiOk(GOOD_COACH_OUTPUT), persist });
    const persisted = persist.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(persisted.status).toBe('COMPLETED');
    expect(persisted.estimatedBand).toBeNull();
    expect(persisted.languageBandEstimate).toBeNull();
    expect(persisted.skill).toBe('SPEAKING');
    expect(persisted.promptVersion).toBe('IELTS_SPEAKING_PREP_V1');
    expect(typeof persisted.prepContent).toBe('string');
  });
});

describe('score-language screening', () => {
  it('filters band/score/examiner wording out of the plan', async () => {
    const outcome = await prepareIeltsSpeaking(baseInput, {
      prepare: async () =>
        aiOk({
          ...GOOD_COACH_OUTPUT,
          plan: {
            focus: 'Aim for Band 7 in this topic.',
            steps: ['Practise daily to raise your score.', 'Map four facets to keywords'],
          },
        }),
      persist,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const serializedPlan = JSON.stringify(outcome.result.plan);
      expect(serializedPlan).not.toMatch(/\bband\b/i);
      expect(serializedPlan).not.toMatch(/\bscore\b/i);
      expect(outcome.result.plan.steps).toContain('Map four facets to keywords');
      expect(outcome.result.limitations.join(' ')).toContain('SCORE_LANGUAGE_FILTERED');
    }
  });
});

describe('fail-safe behaviours', () => {
  it('INVALID_QUESTION for an unknown part (no AI call)', async () => {
    const prepare = vi.fn();
    const outcome = await prepareIeltsSpeaking(
      { ...baseInput, part: 'speaking_part9' as never },
      { prepare, persist },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failureCode).toBe('INVALID_QUESTION');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('unusable coach output → AI_INVALID_JSON + FAILED row (never a successful empty plan)', async () => {
    const outcome = await prepareIeltsSpeaking(baseInput, {
      prepare: async () => aiOk({ plan: {}, outline: [], usefulLanguage: [], pitfalls: [], followUpQuestions: [], mergeSuggestions: [] }),
      persist,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failureCode).toBe('AI_INVALID_JSON');
    const persisted = persist.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(persisted.status).toBe('FAILED');
  });

  it('provider timeout → typed failure, FAILED row', async () => {
    const outcome = await prepareIeltsSpeaking(baseInput, {
      prepare: async () => ({
        ok: false as const,
        failure: 'AI_PROVIDER_TIMEOUT' as const,
        error: 'timed out',
        provider: 'deepseek',
        durationMs: 60_000,
        promptVersion: 'IELTS_SPEAKING_PREP_V1',
        promptHash: 'h',
      }),
      persist,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failureCode).toBe('AI_PROVIDER_TIMEOUT');
    const persisted = persist.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(persisted.failureCode).toBe('AI_PROVIDER_TIMEOUT');
  });

  it('persistence failure does not fabricate a stored id', async () => {
    const outcome = await prepareIeltsSpeaking(baseInput, {
      prepare: async () => aiOk(GOOD_COACH_OUTPUT),
      persist: async () => {
        throw new Error('db down');
      },
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.assessmentId).toBeNull();
  });
});

describe('topic-bank enrichment', () => {
  it('passes deterministic platform teaching notes when a topicId matches', async () => {
    const prepare = vi.fn(async (_req: unknown) => aiOk(GOOD_COACH_OUTPUT));
    await prepareIeltsSpeaking(
      { ...baseInput, topicId: 'p2-place-relax' },
      { prepare: prepare as never, persist },
    );
    const request = prepare.mock.calls[0][0] as { platformNotes?: string };
    expect(request.platformNotes).toContain('Preparation pointers');
    expect(request.platformNotes).toContain('Language functions');
  });
});
