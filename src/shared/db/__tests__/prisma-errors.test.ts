// ============================================
// Prisma error helpers — P2002 shape contract (2026-10-08, Sprint 131)
// ============================================
// Pins that BOTH runtime error shapes are recognised, because the codebase
// previously inspected `meta.target` only — which Prisma 7 (driver adapters /
// query compiler) no longer populates. That dead predicate silently disabled the
// DB-001 concurrent-first-submission retry.
//
// The Prisma 7 shape below was MEASURED against @prisma/client 7.8.0 +
// @prisma/adapter-pg (Postgres 18), not invented.
import { describe, expect, it } from 'vitest';
import {
  isUniqueViolation,
  isUniqueViolationOn,
  uniqueViolationConstraintName,
  uniqueViolationFields,
} from '../prisma-errors';

/** MEASURED Prisma 7 + driver-adapter P2002 shape. */
function prisma7(fields: string[]): Error {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: {
      modelName: 'Submission',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23505',
          kind: 'UniqueConstraintViolation',
          constraint: { fields: fields.map((f) => `"${f}"`) },
        },
      },
    },
  });
}

/** Classic-engine (Prisma <= 6) P2002 shape. */
function classic(fields: string[]): Error {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target: fields },
  });
}

/**
 * MEASURED Prisma 7.10 + driver-adapter P2002 shape (2026-10-09, client 7.10.0,
 * Postgres 18): the field list is GONE — only the constraint INDEX NAME is
 * reported. Reading just `constraint.fields` goes dead again on this version, so
 * this fixture is what keeps the DB-001 retry honest.
 */
function prisma710(index: string): Error {
  return Object.assign(new Error(`Unique constraint failed on the constraint: \`${index}\``), {
    code: 'P2002',
    meta: {
      modelName: 'Submission',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23505',
          kind: 'UniqueConstraintViolation',
          constraint: { index },
          table: 'Submission',
        },
      },
    },
  });
}

describe('isUniqueViolation', () => {
  it('detects P2002 structurally and rejects everything else', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueViolation({ code: 'P2025' })).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('P2002')).toBe(false);
  });
});

describe('uniqueViolationFields — Prisma 7 driver-adapter shape', () => {
  it('reads the constraint fields and strips the SQL quoting', () => {
    expect(uniqueViolationFields(prisma7(['assignmentId', 'studentId']))).toEqual([
      'assignmentId',
      'studentId',
    ]);
  });

  it('returns [] for a P2002 without usable metadata (fail closed)', () => {
    expect(uniqueViolationFields(Object.assign(new Error('x'), { code: 'P2002' }))).toEqual([]);
  });

  it('returns [] for non-P2002 errors', () => {
    expect(uniqueViolationFields(new Error('x'))).toEqual([]);
  });
});

describe('Prisma 7.10 shape — only the constraint index name is reported', () => {
  const SUBMISSION_KEY = 'Submission_assignmentId_studentId_key';

  it('exposes the constraint name', () => {
    expect(uniqueViolationConstraintName(prisma710(SUBMISSION_KEY))).toBe(SUBMISSION_KEY);
  });

  it('reports NO fields — the name fallback is what keeps the retry alive', () => {
    expect(uniqueViolationFields(prisma710(SUBMISSION_KEY))).toEqual([]);
  });

  it('still recognises the expected composite key', () => {
    expect(isUniqueViolationOn(prisma710(SUBMISSION_KEY), ['assignmentId', 'studentId'])).toBe(true);
  });

  it('does NOT match a different unique constraint', () => {
    expect(
      isUniqueViolationOn(prisma710('SubmissionAttempt_submissionId_attemptNumber_key'), [
        'assignmentId',
        'studentId',
      ]),
    ).toBe(false);
  });

  it('does NOT match when the name merely CONTAINS one expected field', () => {
    expect(isUniqueViolationOn(prisma710('Submission_assignmentId_key'), ['assignmentId', 'studentId'])).toBe(
      false,
    );
  });

  it('fails closed when neither shape is present', () => {
    const bare = Object.assign(new Error('x'), { code: 'P2002' });
    expect(uniqueViolationConstraintName(bare)).toBeNull();
    expect(isUniqueViolationOn(bare, ['assignmentId'])).toBe(false);
    expect(isUniqueViolationOn(new Error('x'), ['assignmentId'])).toBe(false);
  });

  it('keeps matching through the 7.8 field list as well', () => {
    expect(isUniqueViolationOn(prisma7(['assignmentId', 'studentId']), ['assignmentId', 'studentId'])).toBe(
      true,
    );
  });
});

describe('uniqueViolationFields — legacy classic-engine shape', () => {
  it('still reads meta.target (array form)', () => {
    expect(uniqueViolationFields(classic(['assignmentId', 'studentId']))).toEqual([
      'assignmentId',
      'studentId',
    ]);
  });

  it('reads the string form too', () => {
    expect(uniqueViolationFields(classic(['submissionId']))).toEqual(['submissionId']);
  });
});

describe('isUniqueViolationOn', () => {
  it('matches the expected constraint in both runtime shapes', () => {
    expect(isUniqueViolationOn(prisma7(['assignmentId', 'studentId']), ['assignmentId', 'studentId'])).toBe(true);
    expect(isUniqueViolationOn(classic(['assignmentId', 'studentId']), ['assignmentId', 'studentId'])).toBe(true);
  });

  it('does NOT match an unrelated unique constraint', () => {
    expect(
      isUniqueViolationOn(prisma7(['submissionId', 'attemptNumber']), ['assignmentId', 'studentId']),
    ).toBe(false);
  });

  it('does NOT match when metadata is missing', () => {
    expect(
      isUniqueViolationOn(Object.assign(new Error('x'), { code: 'P2002' }), ['assignmentId']),
    ).toBe(false);
  });
});
