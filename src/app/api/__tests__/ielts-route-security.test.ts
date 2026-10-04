// ============================================
// IELTS API Route Security — authorization boundary tests
// ============================================
// verifyApiAuth is mocked with functional role enforcement; the ownership
// decisions inside the routes are the real implementations.
// ============================================
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authState: { authenticated: true, userId: 'student-1', role: 'student' as string | undefined },
  getIeltsAttemptDetail: vi.fn(),
  submitIeltsAttempt: vi.fn(),
  startIeltsAttempt: vi.fn(),
  getTestForStudentAttempt: vi.fn(),
  assessIeltsWriting: vi.fn(),
  prepareIeltsSpeaking: vi.fn(),
  getSectionTranscriptForDelivery: vi.fn(),
  getIeltsProgress: vi.fn(),
  transitionIeltsQuestionStatus: vi.fn(),
  transitionIeltsTestStatus: vi.fn(),
  generateIeltsPracticeContent: vi.fn(),
  generateIeltsWritingTask: vi.fn(),
  generateIeltsInstantPractice: vi.fn(),
  listPublishedWritingPrompts: vi.fn(),
  listPublishedIeltsTests: vi.fn(),
  ensureStarterContent: vi.fn(),
  listAdminIeltsTests: vi.fn(),
  explainIeltsMistake: vi.fn(),
  resolveTeacherStudentClass: vi.fn(),
  isBudgetExceededError: vi.fn(() => false),
  ttsSynthesize: vi.fn(),
}));

vi.mock('@/shared/auth/api-auth', () => ({
  verifyApiAuth: async (_req: unknown, allowedRoles?: string[]) => {
    if (!mocks.authState.authenticated) return { authenticated: false, error: '請先登入' };
    if (allowedRoles && (!mocks.authState.role || !allowedRoles.includes(mocks.authState.role))) {
      return { authenticated: false, error: '權限不足' };
    }
    return { authenticated: true, userId: mocks.authState.userId, role: mocks.authState.role };
  },
}));

vi.mock('@/shared/utils/rate-limiter', () => ({
  checkRateLimit: async () => ({ allowed: true, message: '', resetAt: Date.now() + 1000 }),
}));

vi.mock('@/modules/ielts', () => ({
  getIeltsAttemptDetail: mocks.getIeltsAttemptDetail,
  submitIeltsAttempt: mocks.submitIeltsAttempt,
  startIeltsAttempt: mocks.startIeltsAttempt,
  getTestForStudentAttempt: mocks.getTestForStudentAttempt,
  assessIeltsWriting: mocks.assessIeltsWriting,
  prepareIeltsSpeaking: mocks.prepareIeltsSpeaking,
  getSectionTranscriptForDelivery: mocks.getSectionTranscriptForDelivery,
  getIeltsProgress: mocks.getIeltsProgress,
  transitionIeltsQuestionStatus: mocks.transitionIeltsQuestionStatus,
  transitionIeltsTestStatus: mocks.transitionIeltsTestStatus,
  generateIeltsPracticeContent: mocks.generateIeltsPracticeContent,
  generateIeltsWritingTask: mocks.generateIeltsWritingTask,
  generateIeltsInstantPractice: mocks.generateIeltsInstantPractice,
  listPublishedWritingPrompts: mocks.listPublishedWritingPrompts,
  listPublishedIeltsTests: mocks.listPublishedIeltsTests,
  ensureStarterContent: mocks.ensureStarterContent,
  listAdminIeltsTests: mocks.listAdminIeltsTests,
  explainIeltsMistake: mocks.explainIeltsMistake,
  // Route module-scope constant (admin/generate validates targetBand against it).
  IELTS_TARGET_BAND_VALUES: ['TARGET_BAND_6'],
  // Route module-scope constant (practice/instant validates writingTaskType).
  IELTS_WRITING_TASK_TYPES: ['academic_task1', 'academic_task2', 'general_task1', 'general_task2'],
}));

vi.mock('@/modules/teacher/copilot/services/teacher-copilot-service', () => ({
  resolveTeacherStudentClass: mocks.resolveTeacherStudentClass,
}));

vi.mock('@/modules/ai', () => ({
  isBudgetExceededError: mocks.isBudgetExceededError,
  ttsService: { synthesizeSpeech: mocks.ttsSynthesize },
}));

import { GET as getAttempt } from '@/app/api/ielts/attempts/[id]/route';
import { POST as submitAttempt } from '@/app/api/ielts/attempts/[id]/submit/route';
import { GET as listTests } from '@/app/api/ielts/tests/route';
import { POST as assessWriting } from '@/app/api/ielts/writing/assess/route';
import { GET as writingPrompts } from '@/app/api/ielts/writing/prompts/route';
import { POST as prepareSpeaking } from '@/app/api/ielts/speaking/prepare/route';
import { POST as sectionAudio } from '@/app/api/ielts/sections/[id]/audio/route';
import { POST as adminTransition } from '@/app/api/ielts/admin/questions/[id]/transition/route';
import { POST as adminGenerate } from '@/app/api/ielts/admin/generate/route';
import { GET as adminTests } from '@/app/api/ielts/admin/tests/route';
import { POST as adminTestTransition } from '@/app/api/ielts/admin/tests/[id]/transition/route';
import { POST as explainMistake } from '@/app/api/ielts/mistakes/explain/route';
import { POST as instantPractice } from '@/app/api/ielts/practice/instant/route';

function jsonRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const attemptDetail = {
  ok: true as const,
  data: {
    id: 'attempt-1',
    userId: 'student-1',
    testId: 'test-1',
    skill: 'READING',
    testType: 'ACADEMIC',
    status: 'SUBMITTED',
    startedAt: new Date(),
    submittedAt: new Date(),
    rawScore: 1,
    totalItems: 1,
    bandEstimate: null,
    notComparableReason: null,
    responses: [],
    feedback: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState = { authenticated: true, userId: 'student-1', role: 'student' };
  mocks.resolveTeacherStudentClass.mockResolvedValue(false);
});

describe('GET /api/ielts/attempts/[id] — user isolation', () => {
  it('rejects anonymous requests (401)', async () => {
    mocks.authState.authenticated = false;
    const response = await getAttempt(jsonRequest('http://x/api/ielts/attempts/attempt-1'), {
      params: Promise.resolve({ id: 'attempt-1' }),
    });
    expect(response.status).toBe(401);
  });

  it('lets the owner read their attempt', async () => {
    mocks.getIeltsAttemptDetail.mockResolvedValue(attemptDetail);
    const response = await getAttempt(jsonRequest('http://x/api/ielts/attempts/attempt-1'), {
      params: Promise.resolve({ id: 'attempt-1' }),
    });
    expect(response.status).toBe(200);
  });

  it('blocks a different student (403)', async () => {
    mocks.authState = { authenticated: true, userId: 'student-2', role: 'student' };
    mocks.getIeltsAttemptDetail.mockResolvedValue(attemptDetail);
    const response = await getAttempt(jsonRequest('http://x/api/ielts/attempts/attempt-1'), {
      params: Promise.resolve({ id: 'attempt-1' }),
    });
    expect(response.status).toBe(403);
    mocks.authState = { authenticated: true, userId: 'student-1', role: 'student' };
  });

  it('allows a teacher only with a class relation', async () => {
    mocks.authState = { authenticated: true, userId: 'teacher-1', role: 'teacher' };
    mocks.getIeltsAttemptDetail.mockResolvedValue(attemptDetail);

    mocks.resolveTeacherStudentClass.mockResolvedValue(false);
    let response = await getAttempt(jsonRequest('http://x/api/ielts/attempts/attempt-1'), {
      params: Promise.resolve({ id: 'attempt-1' }),
    });
    expect(response.status).toBe(403);

    mocks.resolveTeacherStudentClass.mockResolvedValue(true);
    response = await getAttempt(jsonRequest('http://x/api/ielts/attempts/attempt-1'), {
      params: Promise.resolve({ id: 'attempt-1' }),
    });
    expect(response.status).toBe(200);
  });

  it('allows admin', async () => {
    mocks.authState = { authenticated: true, userId: 'admin-1', role: 'admin' };
    mocks.getIeltsAttemptDetail.mockResolvedValue(attemptDetail);
    const response = await getAttempt(jsonRequest('http://x/api/ielts/attempts/attempt-1'), {
      params: Promise.resolve({ id: 'attempt-1' }),
    });
    expect(response.status).toBe(200);
  });
});

describe('POST /api/ielts/attempts/[id]/submit', () => {
  it('rejects unauthenticated submissions (401)', async () => {
    mocks.authState.authenticated = false;
    const response = await submitAttempt(
      jsonRequest('http://x/api/ielts/attempts/attempt-1/submit', { answers: [] }),
      { params: Promise.resolve({ id: 'attempt-1' }) },
    );
    expect(response.status).toBe(401);
  });

  it('rejects anonymous malformed payloads early', async () => {
    const response = await submitAttempt(
      jsonRequest('http://x/api/ielts/attempts/attempt-1/submit', { answers: 'nope' }),
      { params: Promise.resolve({ id: 'attempt-1' }) },
    );
    expect(response.status).toBe(400);
  });
});

describe('POST /api/ielts/writing/assess', () => {
  const validBody = {
    taskType: 'academic_task2',
    taskPrompt: 'Some people think X. To what extent do you agree?',
    essay: 'A sufficiently long essay response for validation purposes. '.repeat(10),
  };

  it('rejects anonymous AI assessment (401)', async () => {
    mocks.authState.authenticated = false;
    const response = await assessWriting(jsonRequest('http://x/api/ielts/writing/assess', validBody));
    expect(response.status).toBe(401);
  });

  it('rejects attaching an assessment to another user’s attempt (403)', async () => {
    mocks.getIeltsAttemptDetail.mockResolvedValue({
      ok: true,
      data: { ...attemptDetail.data, userId: 'someone-else' },
    });
    const response = await assessWriting(
      jsonRequest('http://x/api/ielts/writing/assess', { ...validBody, attemptId: 'attempt-1' }),
    );
    expect(response.status).toBe(403);
  });

  it('maps typed failures to non-2xx (never a successful assessment state)', async () => {
    mocks.assessIeltsWriting.mockResolvedValue({
      ok: false,
      assessmentId: null,
      failureCode: 'AI_EVIDENCE_MISMATCH',
      message: 'evidence could not be located',
    });
    const response = await assessWriting(jsonRequest('http://x/api/ielts/writing/assess', validBody));
    expect(response.status).toBe(422);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('AI_EVIDENCE_MISMATCH');
  });

  it('maps budget exhaustion to 503', async () => {
    const budgetError = new Error('AI daily budget exhausted');
    mocks.assessIeltsWriting.mockRejectedValue(budgetError);
    mocks.isBudgetExceededError.mockReturnValue(true);
    const response = await assessWriting(jsonRequest('http://x/api/ielts/writing/assess', validBody));
    expect(response.status).toBe(503);
    mocks.isBudgetExceededError.mockReturnValue(false);
  });
});

describe('POST /api/ielts/speaking/prepare — preparation only, never a score', () => {
  const validBody = {
    part: 'speaking_part2',
    topicPrompt: 'Describe a place where you like to relax.',
  };

  it('rejects anonymous requests (401)', async () => {
    mocks.authState.authenticated = false;
    const response = await prepareSpeaking(jsonRequest('http://x/api/ielts/speaking/prepare', validBody));
    expect(response.status).toBe(401);
  });

  it('rejects an invalid part (400)', async () => {
    const response = await prepareSpeaking(
      jsonRequest('http://x/api/ielts/speaking/prepare', { ...validBody, part: 'speaking_part9' }),
    );
    expect(response.status).toBe(400);
  });

  it('returns preparation output with NO score/band fields', async () => {
    mocks.prepareIeltsSpeaking.mockResolvedValue({
      ok: true,
      assessmentId: 'prep-1',
      result: {
        kind: 'PREPARATION_ONLY',
        notice: 'NO_SPEAKING_SCORE_OFFERED',
        plan: { focus: 'story', steps: ['step'] },
        outline: [],
        usefulLanguage: [],
        pitfalls: [],
        followUpQuestions: [],
        mergeSuggestions: [],
        limitations: ['not scored'],
      },
    });
    const response = await prepareSpeaking(jsonRequest('http://x/api/ielts/speaking/prepare', validBody));
    expect(response.status).toBe(200);
    const json = (await response.json()) as { preparation: Record<string, unknown> };
    expect(json.preparation.kind).toBe('PREPARATION_ONLY');
    expect('estimatedBand' in json.preparation).toBe(false);
    expect('languageBandEstimate' in json.preparation).toBe(false);
  });

  it('maps typed failures to non-2xx (never a successful empty plan)', async () => {
    mocks.prepareIeltsSpeaking.mockResolvedValue({
      ok: false,
      assessmentId: null,
      failureCode: 'AI_INVALID_JSON',
      message: 'unusable output',
    });
    const response = await prepareSpeaking(jsonRequest('http://x/api/ielts/speaking/prepare', validBody));
    expect(response.status).toBe(422);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('AI_INVALID_JSON');
  });

  it('maps budget exhaustion to 503', async () => {
    mocks.prepareIeltsSpeaking.mockRejectedValue(new Error('AI daily budget exhausted'));
    mocks.isBudgetExceededError.mockReturnValue(true);
    const response = await prepareSpeaking(jsonRequest('http://x/api/ielts/speaking/prepare', validBody));
    expect(response.status).toBe(503);
    mocks.isBudgetExceededError.mockReturnValue(false);
  });
});

describe('POST /api/ielts/sections/[id]/audio — transcript never leaks', () => {
  it('returns 422 when a section has no transcript (never fake audio)', async () => {
    mocks.getSectionTranscriptForDelivery.mockResolvedValue({
      ok: true,
      data: { transcript: null, provenance: 'PLATFORM_TTS_GENERATED_FROM_ORIGINAL_TRANSCRIPT' },
    });
    const response = await sectionAudio(
      jsonRequest('http://x/api/ielts/sections/sec-1/audio'),
      { params: Promise.resolve({ id: 'sec-1' }) },
    );
    expect(response.status).toBe(422);
    const text = await response.text();
    expect(text).toContain('NO_TRANSCRIPT');
  });

  it('returns 503 when TTS is unavailable (fail closed, no fabricated audio)', async () => {
    mocks.getSectionTranscriptForDelivery.mockResolvedValue({
      ok: true,
      data: { transcript: 'A transcript', provenance: 'PLATFORM_TTS_GENERATED_FROM_ORIGINAL_TRANSCRIPT' },
    });
    mocks.ttsSynthesize.mockRejectedValue(new Error('TTS client unavailable — no GCP service account configured'));
    const response = await sectionAudio(
      jsonRequest('http://x/api/ielts/sections/sec-1/audio'),
      { params: Promise.resolve({ id: 'sec-1' }) },
    );
    expect(response.status).toBe(503);
  });
});

describe('POST /api/ielts/admin/questions/[id]/transition — staff only', () => {
  it('rejects students (auth layer denies staff role)', async () => {
    mocks.authState = { authenticated: true, userId: 'student-1', role: 'student' };
    const response = await adminTransition(
      jsonRequest('http://x/api/ielts/admin/questions/q-1/transition', { to: 'PUBLISHED' }),
      { params: Promise.resolve({ id: 'q-1' }) },
    );
    expect(response.status).toBe(401);
  });

  it('uses the session reviewer id, not the request body', async () => {
    mocks.authState = { authenticated: true, userId: 'teacher-9', role: 'teacher' };
    mocks.transitionIeltsQuestionStatus.mockResolvedValue({
      ok: true,
      data: { questionId: 'q-1', status: 'PUBLISHED' },
    });
    const response = await adminTransition(
      jsonRequest('http://x/api/ielts/admin/questions/q-1/transition', {
        to: 'PUBLISHED',
        reviewerId: 'forged-id',
      }),
      { params: Promise.resolve({ id: 'q-1' }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.transitionIeltsQuestionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ reviewerId: 'teacher-9' }),
    );
  });
});

describe('POST /api/ielts/admin/generate — staff-only AI authoring', () => {
  const validBody = { skill: 'READING', testType: 'ACADEMIC', count: 5 };

  it('rejects anonymous requests (401)', async () => {
    mocks.authState.authenticated = false;
    const response = await adminGenerate(jsonRequest('http://x/api/ielts/admin/generate', validBody));
    expect(response.status).toBe(401);
  });

  it('rejects students (staff role required)', async () => {
    mocks.authState = { authenticated: true, userId: 'student-1', role: 'student' };
    const response = await adminGenerate(jsonRequest('http://x/api/ielts/admin/generate', validBody));
    expect(response.status).toBe(401);
  });

  it('rejects invalid skill (400)', async () => {
    mocks.authState = { authenticated: true, userId: 'teacher-1', role: 'teacher' };
    const response = await adminGenerate(
      jsonRequest('http://x/api/ielts/admin/generate', { ...validBody, skill: 'SPEAKING' }),
    );
    expect(response.status).toBe(400);
  });

  it('returns 201 with the honest generation meta (never PUBLISHED)', async () => {
    mocks.authState = { authenticated: true, userId: 'teacher-1', role: 'teacher' };
    mocks.generateIeltsPracticeContent.mockResolvedValue({
      ok: true,
      testId: 'test-ai-1',
      testStatus: 'DRAFT',
      skill: 'READING',
      testType: 'ACADEMIC',
      requestedCount: 5,
      deliveredCount: 4,
      shortfall: 1,
      sets: [{ label: 'Section 1', itemCount: 4, contentWords: 600 }],
      drops: [{ reason: 'VERIFY_ANSWER_MISMATCH', count: 1 }],
      durationMs: 1000,
    });
    const response = await adminGenerate(jsonRequest('http://x/api/ielts/admin/generate', validBody));
    expect(response.status).toBe(201);
    const json = (await response.json()) as { generation: { testStatus: string; shortfall: number } };
    expect(json.generation.testStatus).toBe('DRAFT');
    expect(json.generation.shortfall).toBe(1);
  });

  it('maps typed generation failure to 422 with the code', async () => {
    mocks.authState = { authenticated: true, userId: 'teacher-1', role: 'teacher' };
    mocks.generateIeltsPracticeContent.mockResolvedValue({
      ok: false,
      code: 'GENERATION_EMPTY',
      message: 'nothing survived',
    });
    const response = await adminGenerate(jsonRequest('http://x/api/ielts/admin/generate', validBody));
    expect(response.status).toBe(422);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('GENERATION_EMPTY');
  });

  it('maps budget exhaustion to 503 (nothing persisted)', async () => {
    mocks.authState = { authenticated: true, userId: 'teacher-1', role: 'teacher' };
    mocks.generateIeltsPracticeContent.mockRejectedValue(new Error('AI daily budget exhausted'));
    mocks.isBudgetExceededError.mockReturnValue(true);
    const response = await adminGenerate(jsonRequest('http://x/api/ielts/admin/generate', validBody));
    expect(response.status).toBe(503);
    mocks.isBudgetExceededError.mockReturnValue(false);
  });
});

describe('POST /api/ielts/practice/instant — on-demand self-study, never published', () => {
  const validBody = { skill: 'READING', testType: 'ACADEMIC', count: 5 };

  it('rejects anonymous requests (401)', async () => {
    mocks.authState.authenticated = false;
    const response = await instantPractice(jsonRequest('http://x/api/ielts/practice/instant', validBody));
    expect(response.status).toBe(401);
  });

  it('rejects invalid skill (400)', async () => {
    const response = await instantPractice(
      jsonRequest('http://x/api/ielts/practice/instant', { ...validBody, skill: 'SPEAKING' }),
    );
    expect(response.status).toBe(400);
  });

  it('rejects WRITING without a writingTaskType (400)', async () => {
    const response = await instantPractice(
      jsonRequest('http://x/api/ielts/practice/instant', { skill: 'WRITING', testType: 'ACADEMIC' }),
    );
    expect(response.status).toBe(400);
  });

  it('rejects an unknown writingTaskType (400)', async () => {
    const response = await instantPractice(
      jsonRequest('http://x/api/ielts/practice/instant', {
        skill: 'WRITING',
        testType: 'ACADEMIC',
        writingTaskType: 'academic_task9',
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.generateIeltsInstantPractice).not.toHaveBeenCalled();
  });

  it('accepts an on-demand WRITING task and forwards it as INSTANT self-study (201)', async () => {
    mocks.generateIeltsInstantPractice.mockResolvedValue({
      ok: true,
      data: {
        testId: 'instant-writing-1',
        skill: 'WRITING',
        testType: 'ACADEMIC',
        requestedCount: 1,
        deliveredCount: 1,
        shortfall: 0,
        remainingToday: 5,
        durationMs: 800,
      },
    });

    const response = await instantPractice(
      jsonRequest('http://x/api/ielts/practice/instant', {
        skill: 'WRITING',
        testType: 'ACADEMIC',
        writingTaskType: 'academic_task2',
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.generateIeltsInstantPractice).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'student-1',
        skill: 'WRITING',
        testType: 'ACADEMIC',
        writingTaskType: 'academic_task2',
      }),
    );
  });

  it('accepts a complete component and forwards scope=full_component (201)', async () => {
    mocks.generateIeltsInstantPractice.mockResolvedValue({
      ok: true,
      data: {
        testId: 'instant-component-1',
        skill: 'READING',
        testType: 'ACADEMIC',
        scope: 'full_component',
        requestedCount: 40,
        deliveredCount: 37,
        shortfall: 3,
        remainingToday: 1,
        durationMs: 240_000,
      },
    });

    const response = await instantPractice(
      jsonRequest('http://x/api/ielts/practice/instant', {
        skill: 'READING',
        testType: 'ACADEMIC',
        scope: 'full_component',
      }),
    );

    expect(response.status).toBe(201);
    const json = (await response.json()) as { instant: { scope: string; deliveredCount: number } };
    expect(json.instant.scope).toBe('full_component');
    expect(json.instant.deliveredCount).toBe(37);
    expect(mocks.generateIeltsInstantPractice).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'full_component', userId: 'student-1' }),
    );
  });

  it('rejects an unknown scope (400) and a component scope for writing (400)', async () => {
    const unknown = await instantPractice(
      jsonRequest('http://x/api/ielts/practice/instant', { ...validBody, scope: 'everything' }),
    );
    expect(unknown.status).toBe(400);

    const writingComponent = await instantPractice(
      jsonRequest('http://x/api/ielts/practice/instant', {
        skill: 'WRITING',
        testType: 'ACADEMIC',
        writingTaskType: 'academic_task2',
        scope: 'full_component',
      }),
    );
    expect(writingComponent.status).toBe(400);
    expect(mocks.generateIeltsInstantPractice).not.toHaveBeenCalled();
  });

  it('delivers the owner-scoped set id with honest remaining-quota meta (201)', async () => {
    mocks.generateIeltsInstantPractice.mockResolvedValue({
      ok: true,
      data: {
        testId: 'instant-1',
        skill: 'READING',
        testType: 'ACADEMIC',
        requestedCount: 5,
        deliveredCount: 4,
        shortfall: 1,
        remainingToday: 7,
        durationMs: 1200,
      },
    });
    const response = await instantPractice(jsonRequest('http://x/api/ielts/practice/instant', validBody));
    expect(response.status).toBe(201);
    const json = (await response.json()) as { instant: { testId: string; shortfall: number; remainingToday: number } };
    expect(json.instant.testId).toBe('instant-1');
    expect(json.instant.shortfall).toBe(1);
    expect(json.instant.remainingToday).toBe(7);
  });

  it('maps the daily cap to 429 with the structured code (never silent)', async () => {
    mocks.generateIeltsInstantPractice.mockResolvedValue({
      ok: false,
      code: 'INSTANT_DAILY_LIMIT_REACHED',
      message: 'Daily instant-practice limit reached (8 sets per Hong Kong day).',
    });
    const response = await instantPractice(jsonRequest('http://x/api/ielts/practice/instant', validBody));
    expect(response.status).toBe(429);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('INSTANT_DAILY_LIMIT_REACHED');
  });

  it('maps generation failure to 422 with the code', async () => {
    mocks.generateIeltsInstantPractice.mockResolvedValue({
      ok: false,
      code: 'GENERATION_EMPTY',
      message: 'nothing survived the gates',
    });
    const response = await instantPractice(jsonRequest('http://x/api/ielts/practice/instant', validBody));
    expect(response.status).toBe(422);
  });

  it('maps budget exhaustion to 503 (nothing persisted)', async () => {
    mocks.generateIeltsInstantPractice.mockRejectedValue(new Error('AI daily budget exhausted'));
    mocks.isBudgetExceededError.mockReturnValue(true);
    const response = await instantPractice(jsonRequest('http://x/api/ielts/practice/instant', validBody));
    expect(response.status).toBe(503);
    mocks.isBudgetExceededError.mockReturnValue(false);
  });
});

describe('GET /api/ielts/writing/prompts — published bank only', () => {
  it('rejects anonymous requests (401)', async () => {
    mocks.authState.authenticated = false;
    const response = await writingPrompts(new NextRequest('http://x/api/ielts/writing/prompts'));
    expect(response.status).toBe(401);
  });

  it('rejects an invalid testType (400)', async () => {
    const response = await writingPrompts(
      new NextRequest('http://x/api/ielts/writing/prompts?testType=WRONG'),
    );
    expect(response.status).toBe(400);
  });

  it('returns the published prompt bank for the variant', async () => {
    mocks.listPublishedWritingPrompts.mockResolvedValue([
      {
        testId: 'w-1',
        title: 'City transport task',
        testType: 'ACADEMIC',
        taskType: 'academic_task2',
        prompt: 'Some people believe... Write at least 250 words.',
      },
    ]);
    const response = await writingPrompts(
      new NextRequest('http://x/api/ielts/writing/prompts?testType=ACADEMIC'),
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as { prompts: Array<{ taskType: string }> };
    expect(json.prompts).toHaveLength(1);
    expect(mocks.listPublishedWritingPrompts).toHaveBeenCalledWith('ACADEMIC');
  });
});

describe('GET /api/ielts/tests — starter provisioning + catalogue', () => {
  it('rejects anonymous requests (401)', async () => {
    mocks.authState.authenticated = false;
    const response = await listTests(new NextRequest('http://x/api/ielts/tests'));
    expect(response.status).toBe(401);
  });

  it('provisions starter content, then returns the published catalogue', async () => {
    mocks.ensureStarterContent.mockResolvedValue({
      provisioned: true,
      createdSlugs: ['seed-academic-reading-1', 'seed-listening-1'],
      skipped: [],
    });
    mocks.listPublishedIeltsTests.mockResolvedValue([
      {
        id: 't1',
        slug: 'seed-academic-reading-1',
        title: 'Academic Reading — Community Repair',
        testType: 'ACADEMIC',
        skill: 'READING',
        description: null,
        durationMinutes: null,
        sectionCount: 1,
        questionCount: 4,
      },
    ]);
    const response = await listTests(new NextRequest('http://x/api/ielts/tests?testType=ACADEMIC'));
    expect(response.status).toBe(200);
    expect(mocks.ensureStarterContent).toHaveBeenCalledTimes(1);
    expect(mocks.listPublishedIeltsTests).toHaveBeenCalledWith({ testType: 'ACADEMIC', skill: undefined });
    const json = (await response.json()) as { tests: unknown[] };
    expect(json.tests).toHaveLength(1);
  });

  it('a provisioning failure never breaks the catalogue (fail-safe read)', async () => {
    mocks.ensureStarterContent.mockRejectedValue(new Error('db down'));
    mocks.listPublishedIeltsTests.mockResolvedValue([]);
    const response = await listTests(new NextRequest('http://x/api/ielts/tests'));
    expect(response.status).toBe(200);
    const json = (await response.json()) as { tests: unknown[] };
    expect(json.tests).toEqual([]);
  });
});

describe('admin tests console — staff only, session reviewer identity', () => {
  it('GET /api/ielts/admin/tests rejects students', async () => {
    mocks.authState = { authenticated: true, userId: 'student-1', role: 'student' };
    const response = await adminTests(new NextRequest('http://x/api/ielts/admin/tests'));
    expect(response.status).toBe(401);
  });

  it('GET returns the tests with QA status counts for teachers', async () => {
    mocks.authState = { authenticated: true, userId: 'teacher-1', role: 'teacher' };
    mocks.listAdminIeltsTests.mockResolvedValue([
      {
        id: 't1',
        slug: 'ai-reading-1',
        title: 'AI-generated reading',
        testType: 'ACADEMIC',
        skill: 'READING',
        status: 'DRAFT',
        createdAt: new Date(),
        questionCount: 3,
        statusCounts: { QA_REQUIRED: 3 },
      },
    ]);
    const response = await adminTests(new NextRequest('http://x/api/ielts/admin/tests'));
    expect(response.status).toBe(200);
    const json = (await response.json()) as { tests: Array<{ statusCounts: Record<string, number> }> };
    expect(json.tests[0].statusCounts.QA_REQUIRED).toBe(3);
  });

  it('POST transition rejects an invalid target (400)', async () => {
    mocks.authState = { authenticated: true, userId: 'teacher-1', role: 'teacher' };
    const response = await adminTestTransition(
      jsonRequest('http://x/api/ielts/admin/tests/t1/transition', { to: 'NOPE' }),
      { params: Promise.resolve({ id: 't1' }) },
    );
    expect(response.status).toBe(400);
  });

  it('POST transition uses the session reviewer id and forwards the decision', async () => {
    mocks.authState = { authenticated: true, userId: 'teacher-9', role: 'teacher' };
    mocks.transitionIeltsTestStatus.mockResolvedValue({
      ok: true,
      data: { testId: 't1', status: 'PUBLISHED' },
    });
    const response = await adminTestTransition(
      jsonRequest('http://x/api/ielts/admin/tests/t1/transition', {
        to: 'PUBLISHED',
        reviewerId: 'forged-id',
      }),
      { params: Promise.resolve({ id: 't1' }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.transitionIeltsTestStatus).toHaveBeenCalledWith({
      testId: 't1',
      to: 'PUBLISHED',
      reviewerId: 'teacher-9',
    });
  });
});

describe('POST /api/ielts/mistakes/explain — advisory, owner-only', () => {
  const validBody = { attemptId: 'attempt-1', questionId: 'q1' };

  it('rejects anonymous requests (401)', async () => {
    mocks.authState.authenticated = false;
    const response = await explainMistake(jsonRequest('http://x/api/ielts/mistakes/explain', validBody));
    expect(response.status).toBe(401);
  });

  it('rejects a body without ids (400)', async () => {
    const response = await explainMistake(
      jsonRequest('http://x/api/ielts/mistakes/explain', { attemptId: 'attempt-1' }),
    );
    expect(response.status).toBe(400);
  });

  it('returns the advisory explanation (200)', async () => {
    mocks.explainIeltsMistake.mockResolvedValue({
      ok: true,
      data: {
        questionId: 'q1',
        explanation: 'The text says repairs are free.',
        misconception: 'You read it as a fee.',
        tip: 'Look for the exact phrase.',
        limitations: ['AI-assisted explanation — advisory only'],
        promptVersion: 'IELTS_MISTAKE_EXPLANATION_V1',
        provider: 'deepseek',
        durationMs: 10,
      },
    });
    const response = await explainMistake(jsonRequest('http://x/api/ielts/mistakes/explain', validBody));
    expect(response.status).toBe(200);
    const json = (await response.json()) as { explanation: { explanation: string } };
    expect(json.explanation.explanation).toContain('free');
    expect(mocks.explainIeltsMistake).toHaveBeenCalledWith({
      userId: 'student-1',
      attemptId: 'attempt-1',
      questionId: 'q1',
      language: 'en',
    });
  });

  it('maps ineligible responses to their typed status (409)', async () => {
    mocks.explainIeltsMistake.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'NOT_AN_INCORRECT_ANSWER',
    });
    const response = await explainMistake(jsonRequest('http://x/api/ielts/mistakes/explain', validBody));
    expect(response.status).toBe(409);
    const json = (await response.json()) as { error: string };
    expect(json.error).toBe('NOT_AN_INCORRECT_ANSWER');
  });

  it('maps budget exhaustion to 503', async () => {
    mocks.explainIeltsMistake.mockRejectedValue(new Error('AI daily budget exhausted'));
    mocks.isBudgetExceededError.mockReturnValue(true);
    const response = await explainMistake(jsonRequest('http://x/api/ielts/mistakes/explain', validBody));
    expect(response.status).toBe(503);
    mocks.isBudgetExceededError.mockReturnValue(false);
  });
});
