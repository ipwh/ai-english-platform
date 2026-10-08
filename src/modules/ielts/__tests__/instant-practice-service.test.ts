// ============================================
// IELTS Instant Practice Service — on-demand self-study gates (2026-10-03 VII)
// ============================================
// The generator is injected (no AI, no DB). These tests pin:
//   * the delivery mode is INSTANT — the persisted state stays DRAFT +
//     QA_REQUIRED (instant delivery is NOT publication)
//   * the per-student Hong Kong-day cap (and that the day boundary is HKT)
//   * the cap is a RESERVATION, not a count (2026-10-08) — a count-then-generate
//     check is not concurrency safe (real concurrency is covered by
//     ielts-concurrency.integration.test.ts)
//   * input validation bounds per skill
//   * typed generation failures pass through; budget errors propagate untouched
//   * remaining quota is reported honestly
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hkDayKey } from '@/shared/utils/hk-date';

// The repository module is mocked so the real DB client is never constructed;
// every test injects its own `deps`, so these functions are not even called.
vi.mock('@/modules/ielts/repositories/ielts-repo', () => ({
  reserveInstantQuota: vi.fn(),
  releaseInstantQuota: vi.fn(),
}));

// The canonical AI pipeline is mocked (never invoked: tests inject `generate`).
vi.mock('@/modules/ai', () => ({
  generateIeltsQuestionSetWithAI: vi.fn(),
  extendIeltsSectionWithAI: vi.fn(),
  verifyIeltsItemsWithAI: vi.fn(),
  generateIeltsWritingPromptWithAI: vi.fn(),
  verifyIeltsWritingPromptWithAI: vi.fn(),
}));

import {
  generateIeltsInstantPractice,
  IELTS_INSTANT_FULL_COMPONENT_DAILY_LIMIT,
  IELTS_INSTANT_PRACTICE_DAILY_LIMIT,
} from '../services/instant-practice-service';

const NOW = new Date('2026-10-03T04:00:00.000Z'); // 12:00 HKT

function generationOk(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    testId: 'instant-1',
    testStatus: 'DRAFT' as const,
    skill: 'READING' as const,
    testType: 'ACADEMIC' as const,
    requestedCount: 5,
    deliveredCount: 5,
    shortfall: 0,
    sets: [],
    drops: [],
    durationMs: 900,
    ...overrides,
  };
}

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  generateWriting: vi.fn(),
  reserveQuota: vi.fn(),
  releaseQuota: vi.fn(),
}));

function deps() {
  return {
    generate: mocks.generate,
    generateWriting: mocks.generateWriting,
    reserveQuota: mocks.reserveQuota,
    releaseQuota: mocks.releaseQuota,
    now: () => NOW,
  };
}

function writingOk(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    testId: 'instant-writing-1',
    testStatus: 'DRAFT' as const,
    taskType: 'academic_task2' as const,
    testType: 'ACADEMIC' as const,
    durationMs: 400,
    ...overrides,
  };
}

const baseInput = {
  userId: 'student-1',
  skill: 'READING' as const,
  testType: 'ACADEMIC' as const,
  count: 5,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the slot is granted, this is the 1st generation of the day.
  mocks.reserveQuota.mockResolvedValue({ reserved: true, usedCount: 1 });
  mocks.releaseQuota.mockResolvedValue(undefined);
  mocks.generate.mockResolvedValue(generationOk());
  mocks.generateWriting.mockResolvedValue(writingOk());
});

describe('generateIeltsInstantPractice — delivery + quota', () => {
  it('generates an INSTANT set (never a catalogue publication) and reports remaining quota', async () => {
    // 2 slots were already used today → this reservation is the 3rd.
    mocks.reserveQuota.mockResolvedValue({ reserved: true, usedCount: 3 });

    const outcome = await generateIeltsInstantPractice(baseInput, deps());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.testId).toBe('instant-1');
    expect(outcome.data.deliveredCount).toBe(5);
    expect(outcome.data.remainingToday).toBe(IELTS_INSTANT_PRACTICE_DAILY_LIMIT - 3);
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'student-1',
        skill: 'READING',
        testType: 'ACADEMIC',
        scope: 'set',
        count: 5,
        deliveryMode: 'INSTANT',
      }),
    );
  });

  it('defaults count to 5 when omitted', async () => {
    const outcome = await generateIeltsInstantPractice(
      { userId: 'student-1', skill: 'READING', testType: 'ACADEMIC' },
      deps(),
    );
    expect(outcome.ok).toBe(true);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ count: 5 }));
  });

  it('enforces the per-student daily cap on the Hong Kong day boundary', async () => {
    mocks.reserveQuota.mockResolvedValue({
      reserved: false,
      usedCount: IELTS_INSTANT_PRACTICE_DAILY_LIMIT,
    });

    const outcome = await generateIeltsInstantPractice(baseInput, deps());

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('INSTANT_DAILY_LIMIT_REACHED');
    expect(mocks.generate).not.toHaveBeenCalled();
    // The reservation must be scoped to the HKT day (never a UTC day) and to
    // the shared 'set' bucket at the documented cap.
    expect(mocks.reserveQuota).toHaveBeenCalledWith({
      ownerUserId: 'student-1',
      dayKey: hkDayKey(NOW),
      bucket: 'set',
      cap: IELTS_INSTANT_PRACTICE_DAILY_LIMIT,
    });
  });

  it('reports shortfall honestly (gates dropped items)', async () => {
    mocks.generate.mockResolvedValue(
      generationOk({
        requestedCount: 5,
        deliveredCount: 3,
        shortfall: 2,
        drops: [{ reason: 'VERIFY_ANSWER_MISMATCH', count: 2 }],
      }),
    );

    const outcome = await generateIeltsInstantPractice(baseInput, deps());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.data.shortfall).toBe(2);
  });
});

describe('generateIeltsInstantPractice — validation & typed failures', () => {
  it('rejects unsupported skills and test types (INVALID_INPUT, no generation)', async () => {
    const badSkill = await generateIeltsInstantPractice(
      { ...baseInput, skill: 'SPEAKING' as never },
      deps(),
    );
    expect(badSkill.ok).toBe(false);
    if (!badSkill.ok) expect(badSkill.code).toBe('INVALID_INPUT');

    const badType = await generateIeltsInstantPractice(
      { ...baseInput, testType: 'IELTS_GENERAL' as never },
      deps(),
    );
    expect(badType.ok).toBe(false);
    if (!badType.ok) expect(badType.code).toBe('INVALID_INPUT');

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.generateWriting).not.toHaveBeenCalled();
  });

  it('rejects out-of-range counts per skill (3–14 reading, 3–10 listening)', async () => {
    const tooFew = await generateIeltsInstantPractice({ ...baseInput, count: 2 }, deps());
    expect(tooFew.ok).toBe(false);

    const tooManyListening = await generateIeltsInstantPractice(
      { ...baseInput, skill: 'LISTENING', count: 11 },
      deps(),
    );
    expect(tooManyListening.ok).toBe(false);

    const nonInteger = await generateIeltsInstantPractice(
      { ...baseInput, count: 5.5 as never },
      deps(),
    );
    expect(nonInteger.ok).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('passes typed generation failures through untouched', async () => {
    mocks.generate.mockResolvedValue({
      ok: false,
      code: 'GENERATION_EMPTY',
      message: 'No item passed the machine screen and blind-solve verification.',
    });

    const outcome = await generateIeltsInstantPractice(baseInput, deps());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('GENERATION_EMPTY');
  });

  it('propagates budget exhaustion untouched (route maps to 503)', async () => {
    mocks.generate.mockRejectedValue(new Error('AI daily budget exhausted'));
    await expect(generateIeltsInstantPractice(baseInput, deps())).rejects.toThrow(
      'AI daily budget exhausted',
    );
  });
});

// 2026-10-08 (Sprint 131): the cap is a RESERVATION. A reserved slot is kept
// only when the generation persisted a test — the same set of cases the old
// row-counting implementation counted (it counted created IeltsTest rows).
describe('generateIeltsInstantPractice — quota reservation policy', () => {
  const reserveArgs = {
    ownerUserId: 'student-1',
    dayKey: hkDayKey(NOW),
    bucket: 'set' as const,
  };

  it('keeps the reservation when a test was persisted', async () => {
    const outcome = await generateIeltsInstantPractice(baseInput, deps());
    expect(outcome.ok).toBe(true);
    expect(mocks.releaseQuota).not.toHaveBeenCalled();
  });

  it('releases the reservation when a typed generation failure stored nothing', async () => {
    mocks.generate.mockResolvedValue({
      ok: false,
      code: 'GENERATION_EMPTY',
      message: 'No item passed the machine screen and blind-solve verification.',
    });

    const outcome = await generateIeltsInstantPractice(baseInput, deps());

    expect(outcome.ok).toBe(false);
    expect(mocks.releaseQuota).toHaveBeenCalledWith(reserveArgs);
  });

  it('releases the reservation before rethrowing a budget/provider error', async () => {
    mocks.generate.mockRejectedValue(new Error('AI daily budget exhausted'));

    await expect(generateIeltsInstantPractice(baseInput, deps())).rejects.toThrow(
      'AI daily budget exhausted',
    );
    expect(mocks.releaseQuota).toHaveBeenCalledWith(reserveArgs);
  });

  it('releases the reservation when the WRITING task never persisted', async () => {
    mocks.generateWriting.mockResolvedValue({
      ok: false,
      code: 'WRITING_PROMPT_NOT_CONFORMING',
      message: 'Did not pass the conformance check after retrying.',
    });

    const outcome = await generateIeltsInstantPractice(
      { userId: 'student-1', skill: 'WRITING', testType: 'ACADEMIC', writingTaskType: 'academic_task2' },
      deps(),
    );

    expect(outcome.ok).toBe(false);
    expect(mocks.releaseQuota).toHaveBeenCalledWith(reserveArgs);
  });

  it('never generates when the reservation is refused (fail-closed)', async () => {
    mocks.reserveQuota.mockResolvedValue({ reserved: false, usedCount: 8 });

    const outcome = await generateIeltsInstantPractice(baseInput, deps());

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('INSTANT_DAILY_LIMIT_REACHED');
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.generateWriting).not.toHaveBeenCalled();
    expect(mocks.releaseQuota).not.toHaveBeenCalled();
  });
});

// 2026-10-04: WRITING joins the on-demand self-study path (same owner-only /
// never-listed semantics, one shared daily budget).
describe('generateIeltsInstantPractice — instant writing tasks', () => {
  const writingInput = {
    userId: 'student-1',
    skill: 'WRITING' as const,
    testType: 'ACADEMIC' as const,
    writingTaskType: 'academic_task2' as const,
  };

  it('generates one INSTANT writing task and reports quota', async () => {
    // 3 slots used → this reservation is the 4th.
    mocks.reserveQuota.mockResolvedValue({ reserved: true, usedCount: 4 });

    const outcome = await generateIeltsInstantPractice(writingInput, deps());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.testId).toBe('instant-writing-1');
    expect(outcome.data.skill).toBe('WRITING');
    expect(outcome.data.requestedCount).toBe(1);
    expect(outcome.data.deliveredCount).toBe(1);
    expect(outcome.data.shortfall).toBe(0);
    expect(outcome.data.remainingToday).toBe(IELTS_INSTANT_PRACTICE_DAILY_LIMIT - 4);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.generateWriting).toHaveBeenCalledWith({
      userId: 'student-1',
      testType: 'ACADEMIC',
      writingTaskType: 'academic_task2',
      topicHint: undefined,
      deliveryMode: 'INSTANT',
    });
  });

  it('shares the same Hong Kong-day cap as reading/listening instant practice', async () => {
    mocks.reserveQuota.mockResolvedValue({
      reserved: false,
      usedCount: IELTS_INSTANT_PRACTICE_DAILY_LIMIT,
    });

    const outcome = await generateIeltsInstantPractice(writingInput, deps());

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('INSTANT_DAILY_LIMIT_REACHED');
    expect(mocks.generateWriting).not.toHaveBeenCalled();
    // Writing shares the 'set' bucket with reading/listening sets.
    expect(mocks.reserveQuota).toHaveBeenCalledWith({
      ownerUserId: 'student-1',
      dayKey: hkDayKey(NOW),
      bucket: 'set',
      cap: IELTS_INSTANT_PRACTICE_DAILY_LIMIT,
    });
  });

  it('requires a writing task type and a matching test variant', async () => {
    const missing = await generateIeltsInstantPractice(
      { userId: 'student-1', skill: 'WRITING', testType: 'ACADEMIC' },
      deps(),
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('INVALID_INPUT');

    const unknown = await generateIeltsInstantPractice(
      { ...writingInput, writingTaskType: 'academic_task9' as never },
      deps(),
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe('INVALID_INPUT');

    const wrongVariant = await generateIeltsInstantPractice(
      { ...writingInput, testType: 'GENERAL_TRAINING' },
      deps(),
    );
    expect(wrongVariant.ok).toBe(false);
    if (!wrongVariant.ok) expect(wrongVariant.code).toBe('INVALID_INPUT');

    expect(mocks.generateWriting).not.toHaveBeenCalled();
  });

  it('accepts general training task types for the GT variant', async () => {
    mocks.generateWriting.mockResolvedValue(
      writingOk({ taskType: 'general_task1', testType: 'GENERAL_TRAINING' }),
    );

    const outcome = await generateIeltsInstantPractice(
      { userId: 'student-1', skill: 'WRITING', testType: 'GENERAL_TRAINING', writingTaskType: 'general_task1' },
      deps(),
    );

    expect(outcome.ok).toBe(true);
    expect(mocks.generateWriting).toHaveBeenCalledWith(
      expect.objectContaining({ writingTaskType: 'general_task1', testType: 'GENERAL_TRAINING' }),
    );
  });

  it('passes a non-conforming prompt failure through untouched', async () => {
    mocks.generateWriting.mockResolvedValue({
      ok: false,
      code: 'WRITING_PROMPT_NOT_CONFORMING',
      message: 'Did not pass the conformance check after retrying.',
    });

    const outcome = await generateIeltsInstantPractice(writingInput, deps());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('WRITING_PROMPT_NOT_CONFORMING');
  });
});

// 2026-10-04: complete components (official 4 sections/parts, ~40 items) — the
// student may practise a full-length component, with its own small daily cap.
describe('generateIeltsInstantPractice — complete components', () => {
  const componentInput = {
    userId: 'student-1',
    skill: 'READING' as const,
    testType: 'ACADEMIC' as const,
    scope: 'full_component' as const,
  };

  it('generates a full component with the official target count and reports scope', async () => {
    mocks.reserveQuota.mockResolvedValue({ reserved: true, usedCount: 1 });
    mocks.generate.mockResolvedValue(
      generationOk({ requestedCount: 40, deliveredCount: 38, shortfall: 2 }),
    );

    const outcome = await generateIeltsInstantPractice(componentInput, deps());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.scope).toBe('full_component');
    expect(outcome.data.requestedCount).toBe(40);
    expect(outcome.data.deliveredCount).toBe(38);
    expect(outcome.data.shortfall).toBe(2);
    expect(outcome.data.remainingToday).toBe(IELTS_INSTANT_FULL_COMPONENT_DAILY_LIMIT - 1);
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'full_component', count: 40, deliveryMode: 'INSTANT' }),
    );
    // A component must NOT consume the per-set budget — it reserves ONLY the
    // dedicated 'full_component' bucket.
    expect(mocks.reserveQuota).toHaveBeenCalledTimes(1);
    expect(mocks.reserveQuota).toHaveBeenCalledWith({
      ownerUserId: 'student-1',
      dayKey: hkDayKey(NOW),
      bucket: 'full_component',
      cap: IELTS_INSTANT_FULL_COMPONENT_DAILY_LIMIT,
    });
  });

  it('enforces the separate component cap (sets are unaffected)', async () => {
    mocks.reserveQuota.mockResolvedValue({
      reserved: false,
      usedCount: IELTS_INSTANT_FULL_COMPONENT_DAILY_LIMIT,
    });

    const outcome = await generateIeltsInstantPractice(componentInput, deps());

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('INSTANT_DAILY_LIMIT_REACHED');
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('does not require or validate `count` for a component', async () => {
    mocks.generate.mockResolvedValue(generationOk({ requestedCount: 40, deliveredCount: 40, shortfall: 0 }));

    const outcome = await generateIeltsInstantPractice(
      { ...componentInput, count: 999 as never },
      deps(),
    );

    expect(outcome.ok).toBe(true);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ count: 40 }));
  });

  it('rewrites a set back to scope=set when count is supplied', async () => {
    await generateIeltsInstantPractice(
      { userId: 'student-1', skill: 'LISTENING', testType: 'GENERAL_TRAINING', count: 8 },
      deps(),
    );
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'set', count: 8 }),
    );
  });

  it('rejects a component scope for writing tasks', async () => {
    const outcome = await generateIeltsInstantPractice(
      {
        userId: 'student-1',
        skill: 'WRITING',
        testType: 'ACADEMIC',
        writingTaskType: 'academic_task2',
        scope: 'full_component',
      },
      deps(),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('INVALID_INPUT');
    expect(mocks.generateWriting).not.toHaveBeenCalled();
  });

  it('rejects an unknown scope', async () => {
    const outcome = await generateIeltsInstantPractice(
      { ...componentInput, scope: 'everything' as never },
      deps(),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('INVALID_INPUT');
  });
});
