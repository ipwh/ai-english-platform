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
