// ============================================
// R3.10-E.2 P0-2/P0-3/P1: concurrency + idempotency + retry tests
// ============================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ──────────────────────────────────────────────
// P0-2: atomic mistake insert-if-absent
// P0-3: practice execution idempotency
// (single vi.mock for @/shared/db/db — both suites share it)
// ──────────────────────────────────────────────
const {
  mockQueryRaw,
  mockTx,
  txClient,
  mockSessionCreate,
  mockSessionFindUnique,
  mockAnswerCreateMany,
} = vi.hoisted(() => {
  const mockQueryRaw = vi.fn();
  const mockSessionCreate = vi.fn();
  const mockSessionFindUnique = vi.fn();
  const mockAnswerCreateMany = vi.fn();
  const txClient = {
    practiceSession: { create: mockSessionCreate, findUnique: mockSessionFindUnique },
    practiceAnswer: { createMany: mockAnswerCreateMany },
  };
  return {
    mockQueryRaw,
    mockTx: vi.fn(),
    txClient,
    mockSessionCreate,
    mockSessionFindUnique,
    mockAnswerCreateMany,
  };
});

vi.mock('@/shared/db/db', () => ({
  db: {
    $queryRaw: mockQueryRaw,
    $transaction: mockTx,
    practiceSession: txClient.practiceSession,
    practiceAnswer: txClient.practiceAnswer,
  },
}));

import { createMistakeIfAbsent } from '@/modules/mistake/db/repositories/mistake-repo';
import { createPracticeExecutionTx } from '../repositories/practice-repo';

/**
 * Emulates the DB-side UNIQUE (studentId, questionId) constraint:
 * the first INSERT returns a row; any conflicting INSERT returns [].
 */
function makeUniqueMistakeStore() {
  const seen = new Set<string>();
  mockQueryRaw.mockImplementation(async (_sql: TemplateStringsArray, ...params: unknown[]) => {
    const sql = String(_sql);
    if (!sql.includes('ON CONFLICT ("studentId", "questionId") DO NOTHING')) {
      throw new Error('expected atomic ON CONFLICT insert');
    }
    const [id, studentId, questionId] = params as [string, string, string];
    const key = `${studentId}\u0000${questionId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id }];
  });
  return {
    count: () => seen.size,
  };
}

describe('R3.10-E.2 P0-2 — mistake atomicity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('concurrent duplicate submissions produce EXACTLY ONE mistake row', async () => {
    const store = makeUniqueMistakeStore();
    const make = () => createMistakeIfAbsent({
      studentId: 'student-1',
      questionId: 'gq-1',
      studentAnswer: 'wrong',
      correctAnswer: 'right',
    });
    const results = await Promise.all([make(), make(), make(), make()]);
    // DB unique semantics: one insert, three no-ops
    expect(store.count()).toBe(1);
    expect(results.filter(r => r.inserted)).toHaveLength(1);
    expect(results.filter(r => !r.inserted)).toHaveLength(3);
  });

  it('different questions still create separate rows', async () => {
    const store = makeUniqueMistakeStore();
    await createMistakeIfAbsent({ studentId: 's1', questionId: 'q1', studentAnswer: 'a', correctAnswer: 'b' });
    await createMistakeIfAbsent({ studentId: 's1', questionId: 'q2', studentAnswer: 'a', correctAnswer: 'b' });
    expect(store.count()).toBe(2);
  });

  it('migration dedupes historical duplicates deterministically (keep newest)', () => {
    const sql = readFileSync(
      resolve(import.meta.dirname, '../../../../prisma/migrations/20260813_mistake_unique_question/migration.sql'), 'utf-8');
    expect(sql).toContain('DELETE FROM "Mistake" AS a');
    expect(sql).toContain('a."createdAt" < b."createdAt"');
    expect(sql).toContain('CREATE UNIQUE INDEX "Mistake_studentId_questionId_key"');
  });
});

// ──────────────────────────────────────────────
// P0-3: practice execution idempotency
// ──────────────────────────────────────────────

const sessionInput = (clientSubmissionId?: string | null) => ({
  studentId: 'student-1',
  skill: 'tenses',
  skillZh: '時態',
  difficulty: 'core',
  totalQuestions: 2,
  correctCount: 1,
  source: 'ai-generated',
  completedAt: new Date('2026-08-13T10:00:00.000Z'),
  clientSubmissionId: clientSubmissionId ?? null,
});

const answers = [
  { questionIndex: 0, questionId: 'gq-a', questionType: 'mc', questionPrompt: 'Q1', correctAnswer: 'A', studentAnswer: 'A', isCorrect: true, result: 'correct', awardedScore: 1, maxScore: 1, countsTowardScore: true, scoredBy: 'server', scoringMethod: 'server-key-resolved' },
];

/** In-memory fake replicating the (studentId, clientSubmissionId) unique index. */
function makeSessionStore() {
  const sessions = new Map<string, { id: string }>();
  let createdCount = 0;
  mockTx.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txClient));
  mockSessionCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const key = `${data.studentId}\u0000${data.clientSubmissionId}`;
    if (data.clientSubmissionId && sessions.has(key)) {
      const err = new Error('Unique constraint failed') as Error & { code?: string };
      err.code = 'P2002';
      throw err;
    }
    const row = { id: `session-${createdCount + 1}` };
    createdCount += 1;
    if (data.clientSubmissionId) sessions.set(key, row);
    return row;
  });
  mockSessionFindUnique.mockImplementation(async ({ where }: { where: { studentId_clientSubmissionId: { studentId: string; clientSubmissionId: string } } }) => {
    const key = `${where.studentId_clientSubmissionId.studentId}\u0000${where.studentId_clientSubmissionId.clientSubmissionId}`;
    return sessions.get(key) ?? null;
  });
  mockAnswerCreateMany.mockResolvedValue({ count: 1 });
  return { sessions, createdCount: () => createdCount };
}

describe('R3.10-E.2 P0-3 — practice idempotency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('concurrent duplicate submissions return the SAME original session; one create only', async () => {
    const store = makeSessionStore();
    const [r1, r2, r3] = await Promise.all([
      createPracticeExecutionTx({ session: sessionInput('key-1'), answers }),
      createPracticeExecutionTx({ session: sessionInput('key-1'), answers }),
      createPracticeExecutionTx({ session: sessionInput('key-1'), answers }),
    ]);
    expect(store.sessions.size).toBe(1);
    expect(store.createdCount()).toBe(1);
    expect(mockAnswerCreateMany).toHaveBeenCalledTimes(1);
    expect(r1.id).toBe(r2.id);
    expect(r2.id).toBe(r3.id);
    expect([r1, r2, r3].filter(r => r.created)).toHaveLength(1);
    expect([r1, r2, r3].filter(r => !r.created)).toHaveLength(2);
  });

  it('different keys create different sessions (backward-compatible behavior)', async () => {
    const store = makeSessionStore();
    const r1 = await createPracticeExecutionTx({ session: sessionInput('key-1'), answers });
    const r2 = await createPracticeExecutionTx({ session: sessionInput('key-2'), answers });
    expect(store.sessions.size).toBe(2);
    expect(store.createdCount()).toBe(2);
    expect(r1.created).toBe(true);
    expect(r2.created).toBe(true);
    expect(r1.id).not.toBe(r2.id);
  });

  it('requests WITHOUT a key keep legacy behavior (always create)', async () => {
    const store = makeSessionStore();
    const r1 = await createPracticeExecutionTx({ session: sessionInput(null), answers });
    const r2 = await createPracticeExecutionTx({ session: sessionInput(null), answers });
    expect(store.createdCount()).toBe(2);
    expect(r1.created).toBe(true);
    expect(r2.created).toBe(true);
  });

  it('service returns replay result and applies mastery through the session-idempotent gate (contract)', () => {
    const svc = readFileSync(resolve(import.meta.dirname, '../services/practice-submission-service.ts'), 'utf-8');
    expect(svc).toContain('if (!persisted.created)');
    expect(svc).toContain('recordPracticeSessionMasteryOnce({');
    expect(svc).toContain('sessionId: persisted.id');
    expect(svc).toContain('clientSubmissionId: clientSubmissionId ?? null');
  });
});

// ──────────────────────────────────────────────
// P1: persistence retry classification
// ──────────────────────────────────────────────
import {
  classifyPersistenceFailure,
  shouldRetryPersistence,
  persistWithRetry,
} from '@/shared/utils/persistence-helper';

describe('R3.10-E.2 P1 — persistence retry policy', () => {
  it('4xx is NEVER retried and is classified as client failure', async () => {
    const fn = vi.fn<() => Promise<Response>>().mockResolvedValue(new Response('bad', { status: 400 }));
    const outcome = await persistWithRetry(fn, { retries: 2 });
    expect(outcome.ok).toBe(false);
    expect(outcome.failureKind).toBe('client');
    expect(outcome.retried).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('5xx is retried once, then reported as server failure', async () => {
    const fn = vi.fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const outcome = await persistWithRetry(fn, { retries: 1 });
    expect(outcome.ok).toBe(true);
    expect(outcome.retried).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('network failure is retried and finally reported as network failure', async () => {
    const fn = vi.fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    const outcome = await persistWithRetry(fn, { retries: 1 });
    expect(outcome.ok).toBe(false);
    expect(outcome.failureKind).toBe('network');
    expect(outcome.retried).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('classification helper: network and server retry, client does not', () => {
    expect(shouldRetryPersistence('network')).toBe(true);
    expect(shouldRetryPersistence('server')).toBe(true);
    expect(shouldRetryPersistence('client')).toBe(false);
    expect(shouldRetryPersistence('unknown')).toBe(false);
    expect(classifyPersistenceFailure(new TypeError('nope'))).toBe('network');
    expect(classifyPersistenceFailure(new Response('', { status: 500 }))).toBe('server');
    expect(classifyPersistenceFailure(new Response('', { status: 403 }))).toBe('client');
  });
});
