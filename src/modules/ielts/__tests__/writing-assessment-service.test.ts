// ============================================
// IELTS Writing Assessment Service — failure-mode + governance tests
// ============================================
// The AI provider is mocked; every malformed / hostile AI behaviour must fail
// safely and never become a successful assessment state.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assessIeltsWritingWithAI: vi.fn(),
  createAssessment: vi.fn(),
}));

vi.mock('@/modules/ai', () => ({
  assessIeltsWritingWithAI: mocks.assessIeltsWritingWithAI,
}));

vi.mock('@/modules/ielts/repositories/ielts-repo', () => ({
  createAssessment: mocks.createAssessment,
  listPairedCalibrationRecords: vi.fn(),
}));

import { assessIeltsWriting, type IeltsWritingAssessmentDeps } from '../services/writing-assessment-service';
import type { IeltsWritingAiResult } from '@/modules/ai';

type PersistFn = NonNullable<IeltsWritingAssessmentDeps['persist']>;

const ESSAY = [
  'Some people believe that city centres should be car-free. I partly agree with this view.',
  'On the one hand, restricting private vehicles would reduce air pollution and noise in crowded districts.',
  'On the other hand, many workers depend on their cars because public transport is unreliable in some areas.',
  'In my opinion, cities should invest in reliable buses and trains first, then gradually limit cars in the centre.',
  'A balanced approach would protect both the environment and people who cannot easily change their travel habits.',
].join(' ');

function criterion(band: number, quote: string, confidence = 0.8) {
  return {
    band,
    evidence: [{ quote, explanation: 'observed in text' }],
    strengths: ['clear point'],
    weaknesses: ['needs development'],
    rationale: 'based on the observed text',
    confidence,
  };
}

function validAiData(overrides: Record<string, unknown> = {}) {
  return {
    taskAchievementOrResponse: criterion(6.5, 'I partly agree with this view'),
    coherenceAndCohesion: criterion(6.0, 'On the one hand'),
    lexicalResource: criterion(6.5, 'restricting private vehicles'),
    grammaticalRangeAndAccuracy: criterion(6.0, 'In my opinion, cities should invest'),
    taskCoverage: [],
    positionPresent: true,
    templateSuspicion: { suspected: false, rationale: '' },
    uncertainty: [],
    limitations: [],
    ...overrides,
  };
}

function aiOk(data: Record<string, unknown>): IeltsWritingAiResult {
  return {
    ok: true as const,
    data: data as never,
    provider: 'deepseek',
    durationMs: 1234,
    promptVersion: 'IELTS_WRITING_TASK2_V1',
    promptHash: 'hash',
    model: null,
  };
}

const persist = vi.fn<PersistFn>(async () => ({ id: 'assessment-1' }));

beforeEach(() => {
  vi.clearAllMocks();
  persist.mockResolvedValue({ id: 'assessment-1' });
});

const baseInput = {
  userId: 'student-1',
  taskType: 'academic_task2' as const,
  taskPrompt:
    'Some people believe that city centres should be car-free. To what extent do you agree or disagree?',
  essay: ESSAY,
};

describe('happy path', () => {
  it('computes the task band SERVER-SIDE from the four criterion bands', async () => {
    const outcome = await assessIeltsWriting(baseInput, {
      assess: async () => aiOk(validAiData()),
      persist,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // (6.5 + 6.0 + 6.5 + 6.0) / 4 = 6.25 → 6.5
      expect(outcome.result.taskBand).toBe(6.5);
      expect(outcome.result.assessmentSource).toBe('AI_ESTIMATE');
      expect(outcome.result.calibrationStatus).toBe('NOT_CALIBRATED');
      expect(outcome.result.limitations.join(' ')).toContain('HUMAN_EVIDENCE = INSUFFICIENT');
      expect(outcome.result.confidence).not.toBe('NOT_CALIBRATED');
      // Audit 2026-10-03: rubric + task-spec versions are stamped.
      expect(outcome.result.rubricVersion).toBe('ielts-writing-rubric-v1');
      expect(outcome.result.taskSpecificationVersion).toBe('ielts-task-spec-v1');
      expect(outcome.result.taskTypeAnalysis.specVersion).toBe('ielts-task-spec-v1');
    }
    expect(persist).toHaveBeenCalledTimes(1);
    const persisted = persist.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(persisted.status).toBe('COMPLETED');
    expect(persisted.estimatedBand).toBe(6.5);
    expect(persisted.assessmentSource).toBe('AI_ESTIMATE');
    expect(persisted.rubricVersion).toBe('ielts-writing-rubric-v1');
  });

  it('marks all evidence as verified when quotes are verbatim', async () => {
    const outcome = await assessIeltsWriting(baseInput, {
      assess: async () => aiOk(validAiData()),
      persist,
    });
    if (outcome.ok) {
      for (const key of ['taskAchievementOrResponse', 'coherenceAndCohesion', 'lexicalResource', 'grammaticalRangeAndAccuracy'] as const) {
        expect(outcome.result.criteria[key].evidence[0].verified).toBe(true);
      }
    }
  });
});

describe('fail-safe behaviours', () => {
  it('TASK_NOT_ANSWERED when the response is effectively empty', async () => {
    const assess = vi.fn();
    const outcome = await assessIeltsWriting({ ...baseInput, essay: 'too short' }, { assess, persist });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failureCode).toBe('TASK_NOT_ANSWERED');
    expect(assess).not.toHaveBeenCalled(); // no AI budget wasted
  });

  it('AI_MISSING_CRITERION when a criterion is absent', async () => {
    const data = validAiData();
    delete (data as Record<string, unknown>).lexicalResource;
    const outcome = await assessIeltsWriting(baseInput, {
      assess: async () => aiOk(data),
      persist,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failureCode).toBe('AI_MISSING_CRITERION');
  });

  it('AI_MISSING_EVIDENCE when a criterion carries no evidence (evidence-less scores are invalid)', async () => {
    const data = validAiData({
      lexicalResource: { ...criterion(6.5, 'restricting private vehicles'), evidence: [] },
    });
    const outcome = await assessIeltsWriting(baseInput, {
      assess: async () => aiOk(data),
      persist,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failureCode).toBe('AI_MISSING_EVIDENCE');
    // The typed failure row is persisted for audit — never a successful one.
    const persisted = persist.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(persisted.status).toBe('FAILED');
    expect(persisted.failureCode).toBe('AI_MISSING_EVIDENCE');
  });

  it('AI_UNSUPPORTED_BAND for 7.13 (false precision)', async () => {
    const outcome = await assessIeltsWriting(baseInput, {
      assess: async () => aiOk(validAiData({ lexicalResource: criterion(7.13, 'restricting private vehicles') })),
      persist,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failureCode).toBe('AI_UNSUPPORTED_BAND');
  });

  it('AI_EVIDENCE_MISMATCH when the majority of quotes are hallucinated', async () => {
    const data = validAiData({
      taskAchievementOrResponse: criterion(6.5, 'THIS QUOTE DOES NOT EXIST ANYWHERE'),
      coherenceAndCohesion: criterion(6.0, 'NEITHER DOES THIS ONE AT ALL'),
      lexicalResource: criterion(6.5, 'NOR THIS THIRD ONE HERE'),
      grammaticalRangeAndAccuracy: criterion(6.0, 'AND THIS FOURTH ONE TOO'),
    });
    const outcome = await assessIeltsWriting(baseInput, {
      assess: async () => aiOk(data),
      persist,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failureCode).toBe('AI_EVIDENCE_MISMATCH');
  });

  it('strips unverified quotes but keeps the assessment when integrity is acceptable', async () => {
    const outcome = await assessIeltsWriting(baseInput, {
      assess: async () =>
        aiOk(
          validAiData({
            taskCoverage: [
              {
                requirementId: 'agree-disagree',
                status: 'ADDRESSED',
                evidence: [{ quote: 'I partly agree with this view', explanation: 'position' }],
              },
            ],
          }),
        ),
      persist,
    });
    if (outcome.ok) {
      expect(outcome.result.taskCoverage[0].evidence[0].verified).toBe(true);
      expect(outcome.result.confidence).not.toBe('HIGH'); // capped while uncalibrated
    }
  });

  it('provider timeout → typed failure row, never a success', async () => {
    const outcome = await assessIeltsWriting(baseInput, {
      assess: async () => ({
        ok: false as const,
        failure: 'AI_PROVIDER_TIMEOUT' as const,
        error: 'DeepSeek request timed out.',
        provider: 'deepseek',
        durationMs: 60000,
        promptVersion: 'IELTS_WRITING_TASK2_V1',
        promptHash: 'h',
      }),
      persist,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failureCode).toBe('AI_PROVIDER_TIMEOUT');
    const persisted = persist.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(persisted.status).toBe('FAILED');
    expect(persisted.failureCode).toBe('AI_PROVIDER_TIMEOUT');
    expect(persisted.estimatedBand).toBeUndefined();
  });

  it('filters forbidden examiner/guarantee claims from feedback', async () => {
    const outcome = await assessIeltsWriting(baseInput, {
      assess: async () =>
        aiOk(
          validAiData({
            coherenceAndCohesion: {
              ...criterion(6.0, 'On the one hand'),
              rationale: 'The examiner would definitely award Band 7. The ideas are logically ordered.',
            },
          }),
        ),
      persist,
    });
    if (outcome.ok) {
      expect(outcome.result.criteria.coherenceAndCohesion.rationale).not.toContain('examiner');
      expect(outcome.result.limitations.join(' ')).toContain('FORBIDDEN_CLAIM_FILTERED');
    }
  });

  it('below-minimum responses complete with a WORD_LIMIT_EXCEEDED limitation (no silent band penalty claim)', async () => {
    const shortEssay = ESSAY.split(' ').slice(0, 30).join(' ');
    const outcome = await assessIeltsWriting({ ...baseInput, essay: shortEssay }, {
      assess: async () => aiOk(validAiData()),
      persist,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.belowMinimum).toBe(true);
      expect(outcome.result.limitations.join(' ')).toContain('WORD_LIMIT_EXCEEDED');
    }
  });

  it('persistence failure does not fabricate a stored assessment id', async () => {
    const outcome = await assessIeltsWriting(baseInput, {
      assess: async () => aiOk(validAiData()),
      persist: async () => {
        throw new Error('db down');
      },
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.assessmentId).toBeNull();
  });
});

describe('task coverage handling', () => {
  it('ignores unknown requirement ids and reports unreported ones', async () => {
    const outcome = await assessIeltsWriting(baseInput, {
      assess: async () =>
        aiOk(
          validAiData({
            taskCoverage: [
              { requirementId: 'invented-requirement', status: 'ADDRESSED', evidence: [] },
            ],
          }),
        ),
      persist,
    });
    if (outcome.ok) {
      expect(outcome.result.taskCoverage).toHaveLength(0);
      expect(outcome.result.unreportedRequirementIds).toContain('agree-disagree');
      expect(outcome.result.limitations.join(' ')).toContain('unknown requirementId');
    }
  });
});
