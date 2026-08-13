// ============================================
// R3.5 hardening: teacher-review projection policy tests
// ============================================
import { describe, it, expect } from 'vitest';
import { evaluateAssignmentSubmissionProjection } from '../services/assignment-projection-policy';

const attempts = [
  { answers: [{ questionId: 'q1', evaluator: 'server' }, { questionId: 'q2', evaluator: 'ai' }] },
];

describe('Teacher review policy (no fabricated human evidence)', () => {
  it('teacher-reviewed submission → NOT_PROJECTABLE (human-reviewed)', () => {
    const status = evaluateAssignmentSubmissionProjection({
      humanReviewedAt: new Date('2026-08-13T12:00:00.000Z'),
      attempts,
    });
    expect(status).toEqual({ status: 'not-projectable', reason: 'human-reviewed' });
  });

  it('human-review marker takes precedence over missing attempts', () => {
    const status = evaluateAssignmentSubmissionProjection({
      humanReviewedAt: new Date(),
      attempts: [],
    });
    expect(status).toEqual({ status: 'not-projectable', reason: 'human-reviewed' });
  });

  it('AI/server per-item evidence remains unchanged after teacher review', () => {
    const frozen = Object.freeze(
      attempts.map(a => ({ ...a, answers: Object.freeze([...a.answers]) })),
    );
    const before = JSON.stringify(frozen);

    const status = evaluateAssignmentSubmissionProjection({
      humanReviewedAt: '2026-08-13',
      attempts: frozen,
    });

    expect(status.status).toBe('not-projectable');
    // No relabelling, no new per-item rows, no mutation:
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it('never fabricates per-item human evidence (no item output produced)', () => {
    const status = evaluateAssignmentSubmissionProjection({ humanReviewedAt: new Date(), attempts });
    expect('items' in status).toBe(false);
    expect('score' in status).toBe(false);
  });

  it('unreviewed attempt-backed submission → projectable', () => {
    const status = evaluateAssignmentSubmissionProjection({ humanReviewedAt: null, attempts });
    expect(status).toEqual({ status: 'projectable' });
  });
});

describe('Legacy data policy (no reconstruction)', () => {
  it('legacy submission with zero attempts → NOT_PROJECTABLE (no-attempts)', () => {
    const status = evaluateAssignmentSubmissionProjection({ humanReviewedAt: null, attempts: [] });
    expect(status).toEqual({ status: 'not-projectable', reason: 'no-attempts' });
  });

  it('legacy submission with no attempts field → NOT_PROJECTABLE (no-attempts)', () => {
    const status = evaluateAssignmentSubmissionProjection({});
    expect(status).toEqual({ status: 'not-projectable', reason: 'no-attempts' });
  });

  it('does not reconstruct any evidence for legacy submissions', () => {
    const status = evaluateAssignmentSubmissionProjection({ humanReviewedAt: null, attempts: [] });
    expect('items' in status).toBe(false);
    expect('score' in status).toBe(false);
  });
});
