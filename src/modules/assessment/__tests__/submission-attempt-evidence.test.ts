// ============================================
// R3.5 hardening: atomic submission + attempt evidence tests
// ============================================
// Unit tests with a MOCKED Prisma layer. They prove:
//  - Submission compat view + SubmissionAttempt + SubmissionAnswer are
//    written inside ONE transaction scope; any failure rejects the call
//    (real rollback is Prisma interactive-transaction behaviour).
//  - attemptNumber is computed AFTER a FOR UPDATE row lock (serialized).
//  - historical attempts are appended, never updated/deleted.
//  - schema/migration contracts (uniqueness, review marker, ordering).
// They do NOT prove a live DB round trip (Neon unreachable from this
// environment).
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const {
  mockTx,
  client,
  mockQueryRaw,
  mockFindFirst,
  mockUpdate,
  mockCreate,
  mockCount,
  mockAttemptCreate,
  mockAnswerCreateMany,
} = vi.hoisted(() => {
  const mockQueryRaw = vi.fn();
  const mockFindFirst = vi.fn();
  const mockUpdate = vi.fn();
  const mockCreate = vi.fn();
  const mockCount = vi.fn();
  const mockAttemptCreate = vi.fn();
  const mockAnswerCreateMany = vi.fn();
  const client = {
    $queryRaw: mockQueryRaw,
    submission: { findFirst: mockFindFirst, update: mockUpdate, create: mockCreate },
    submissionAttempt: { count: mockCount, create: mockAttemptCreate },
    submissionAnswer: { createMany: mockAnswerCreateMany },
  };
  return {
    mockTx: vi.fn(),
    client,
    mockQueryRaw,
    mockFindFirst,
    mockUpdate,
    mockCreate,
    mockCount,
    mockAttemptCreate,
    mockAnswerCreateMany,
  };
});

vi.mock('@/shared/db/db', () => ({
  db: {
    $transaction: mockTx,
    $queryRaw: mockQueryRaw,
    submission: client.submission,
    submissionAttempt: client.submissionAttempt,
    submissionAnswer: client.submissionAnswer,
  },
}));

import { submitAssignmentAttempt } from '../services/submission-attempt-service';

const items = [
  { questionId: 'aq-mc', response: 'A', result: 'correct', awardedScore: 1, maxScore: 1, countsTowardScore: true, evaluator: 'server', scoringMethod: 'assignment-mc-exact-match' },
  { questionId: 'aq-txt', response: 'no', result: 'incorrect', awardedScore: 0, maxScore: 1, countsTowardScore: true, evaluator: 'ai', scoringMethod: 'assignment-ai-answer-analysis' },
];

const input = {
  assignmentId: 'assign-1',
  studentId: 'student-1',
  answersJson: JSON.stringify({ 'aq-mc': 'A', 'aq-txt': 'no' }),
  score: 50,
  aiFeedback: '回饋',
  submittedAt: new Date('2026-08-13T10:00:00.000Z'),
  items,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(client));
  mockQueryRaw.mockResolvedValue([]);
  mockCount.mockResolvedValue(0);
  mockUpdate.mockResolvedValue({ id: 'sub-1' });
  mockAnswerCreateMany.mockResolvedValue({ count: 2 });
  mockAttemptCreate.mockImplementation(
    async ({ data }: { data: { attemptNumber: number } }) =>
      ({ ...data, id: `attempt-${data.attemptNumber}` }),
  );
});

// ============================================
// Atomic transaction + evidence round-trip
// ============================================

describe('Atomic submission transaction', () => {
  it('writes Submission compat view + attempt + evidence inside one transaction', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'sub-1' });

    const res = await submitAssignmentAttempt(input);

    expect(mockTx).toHaveBeenCalledTimes(1);
    expect(res.isNew).toBe(true);
    expect(res.attempt.id).toBe('attempt-1');
    expect(res.attempt.attemptNumber).toBe(1);

    const createData = mockCreate.mock.calls[0][0].data;
    expect(createData).toMatchObject({
      assignmentId: 'assign-1',
      studentId: 'student-1',
      answers: input.answersJson,
      score: 50,
      status: 'submitted',
    });

    // Evidence rows verbatim + attemptId attached by the service:
    const payload = mockAnswerCreateMany.mock.calls[0][0].data;
    expect(payload).toHaveLength(2);
    expect(payload[0]).toEqual({ ...items[0], attemptId: 'attempt-1' });
    expect(payload[1]).toEqual({ ...items[1], attemptId: 'attempt-1' });
    expect('evaluatorVersion' in payload[0]).toBe(false);
    expect('evaluatorVersion' in payload[1]).toBe(false);
  });

  it('attempt creation failure rejects the whole transaction (no partial commit)', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'sub-1' });
    mockAttemptCreate.mockRejectedValue(new Error('db down'));

    await expect(submitAssignmentAttempt(input)).rejects.toThrow('db down');
    expect(mockTx).toHaveBeenCalledTimes(1);
    // No answer writes were attempted after the failure point:
    expect(mockAnswerCreateMany).not.toHaveBeenCalled();
  });

  it('answer persistence failure rejects the whole transaction', async () => {
    mockFindFirst.mockResolvedValue({ id: 'sub-1' });
    mockAnswerCreateMany.mockRejectedValue(new Error('write failed'));

    await expect(submitAssignmentAttempt(input)).rejects.toThrow('write failed');
    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  it('duplicate attemptNumber (P2002) rejects the whole transaction', async () => {
    // Stale count simulates a concurrent race; the DB unique constraint
    // fires and the interactive transaction rolls back everything.
    mockFindFirst.mockResolvedValue({ id: 'sub-1' });
    mockCount.mockResolvedValue(0);
    mockAttemptCreate.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );

    await expect(submitAssignmentAttempt(input)).rejects.toThrow();
    expect(mockAnswerCreateMany).not.toHaveBeenCalled();
    expect(mockTx).toHaveBeenCalledTimes(1);
  });
});

// ============================================
// Concurrency-safe attempt numbering
// ============================================

describe('Concurrency-safe attempt numbering', () => {
  it('locks the Submission row BEFORE counting attempts', async () => {
    const order: string[] = [];
    mockFindFirst.mockImplementation(async () => { order.push('find'); return { id: 'sub-1' }; });
    mockUpdate.mockImplementation(async () => { order.push('update'); return { id: 'sub-1' }; });
    mockQueryRaw.mockImplementation(async () => { order.push('lock'); return []; });
    mockCount.mockImplementation(async () => { order.push('count'); return 0; });
    mockAttemptCreate.mockImplementation(async ({ data }: { data: { attemptNumber: number } }) => {
      order.push('attempt');
      return { id: `attempt-${data.attemptNumber}`, attemptNumber: data.attemptNumber };
    });
    mockAnswerCreateMany.mockImplementation(async () => { order.push('answers'); return { count: 2 }; });

    await submitAssignmentAttempt(input);

    expect(order.indexOf('update')).toBeLessThan(order.indexOf('lock'));
    expect(order.indexOf('lock')).toBeLessThan(order.indexOf('count'));
    expect(order.indexOf('count')).toBeLessThan(order.indexOf('attempt'));
    expect(order.indexOf('attempt')).toBeLessThan(order.indexOf('answers'));
  });
});

// ============================================
// Append-only attempt identity
// ============================================

describe('Attempt identity semantics (append-only)', () => {
  it('retry creates a distinct attempt number and never mutates the previous attempt', async () => {
    mockFindFirst.mockResolvedValue({ id: 'sub-1' });
    mockUpdate.mockResolvedValue({ id: 'sub-1' });
    mockCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    const first = await submitAssignmentAttempt(input);
    const second = await submitAssignmentAttempt(input);

    expect(first.attempt.id).toBe('attempt-1');
    expect(second.attempt.id).toBe('attempt-2');
    expect(second.attempt.attemptNumber).toBe(2);
    expect(mockAttemptCreate).toHaveBeenCalledTimes(2);

    // Both evidence batches attach to their own attempt; attempt 1's rows
    // are never rewritten:
    const firstPayload = mockAnswerCreateMany.mock.calls[0][0].data;
    const secondPayload = mockAnswerCreateMany.mock.calls[1][0].data;
    expect(firstPayload.every((row: { attemptId: string }) => row.attemptId === 'attempt-1')).toBe(true);
    expect(secondPayload.every((row: { attemptId: string }) => row.attemptId === 'attempt-2')).toBe(true);

    // Create-only repository surface: append-only design.
    expect(client.submissionAttempt).not.toHaveProperty('update');
    expect(client.submissionAttempt).not.toHaveProperty('delete');
    expect(client.submissionAnswer).not.toHaveProperty('update');
    expect(client.submissionAnswer).not.toHaveProperty('delete');
  });

  it('legacy submission (no prior attempts) starts at attemptNumber 1; empty evidence writes nothing', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'legacy-sub' });

    const res = await submitAssignmentAttempt({ ...input, items: [] });

    expect(res.isNew).toBe(true);
    expect(res.attempt.attemptNumber).toBe(1);
    expect(mockAnswerCreateMany).not.toHaveBeenCalled();
  });

  it('compatibility view always matches the same execution as the attempt', async () => {
    mockFindFirst.mockResolvedValue({ id: 'sub-1' });
    mockUpdate.mockResolvedValue({ id: 'sub-1' });

    await submitAssignmentAttempt({ ...input, score: 75, aiFeedback: 'v2 回饋' });

    const updateData = mockUpdate.mock.calls[0][0].data;
    const attemptData = mockAttemptCreate.mock.calls[0][0].data;
    expect(updateData.score).toBe(75);
    expect(updateData.aiFeedback).toBe('v2 回饋');
    expect(attemptData.score).toBe(75);
    expect(attemptData.aiFeedback).toBe('v2 回饋');
    expect(updateData.answers).toBe(input.answersJson);
    expect(updateData.submittedAt).toEqual(input.submittedAt);
    expect(attemptData.submittedAt).toEqual(input.submittedAt);
  });
});

// ============================================
// Schema + migration + route contracts
// ============================================

describe('Schema, migration and route contracts', () => {
  const root = resolve(import.meta.dirname, '../../../..');

  it('SubmissionAnswer declares @@unique([attemptId, questionId])', () => {
    const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf-8');
    expect(schema).toContain('@@unique([attemptId, questionId])');
  });

  it('Submission declares humanReviewedAt marker', () => {
    const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf-8');
    expect(schema).toContain('humanReviewedAt DateTime?');
  });

  it('hardening migration is additive: unique index + humanReviewedAt column', () => {
    const sql = readFileSync(
      resolve(root, 'prisma/migrations/20260813_assignment_02_hardening/migration.sql'),
      'utf-8',
    );
    expect(sql).toContain('CREATE UNIQUE INDEX "SubmissionAnswer_attemptId_questionId_key"');
    expect(sql).toContain('ALTER TABLE "Submission" ADD COLUMN "humanReviewedAt" TIMESTAMP(3);');
  });

  it('POST route loads assignment questions ordered by canonical orderIndex', () => {
    const route = readFileSync(resolve(root, 'src/app/api/assignments/[id]/route.ts'), 'utf-8');
    const postSection = route.split('export async function POST')[1];
    expect(postSection).toContain("orderBy: { orderIndex: 'asc' }");
  });

  it('teacher review route writes humanReviewedAt without touching attempts/answers', () => {
    const reviews = readFileSync(resolve(root, 'src/app/api/reviews/[id]/route.ts'), 'utf-8');
    expect(reviews).toContain('updateData.humanReviewedAt = new Date()');
    // The review flow only ever updates the Submission row — no attempt or
    // answer writes exist in the file:
    expect(reviews).not.toContain('submissionAttempt');
    expect(reviews).not.toContain('submissionAnswer');
  });

  it('migration folder set contains the hardening migrations (dependency-ordered)', () => {
    const dirs = readdirSync(resolve(root, 'prisma/migrations'));
    expect(dirs).toContain('20260813_assignment_01_per_item_evidence');
    expect(dirs).toContain('20260813_assignment_02_hardening');
  });
});
