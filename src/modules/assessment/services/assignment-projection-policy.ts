// ============================================
// R3.5 hardening: assignment projection policy (gate only — no mapping)
// ============================================
// Teacher aggregate review must never fabricate per-item human evidence.
// A teacher-reviewed Submission is explicitly NOT_PROJECTABLE for
// item-level StudentAssessmentResult projection. Existing AI/server
// SubmissionAnswer rows are never relabelled and no per-item human
// scores are invented.
//
// Legacy Submissions with zero attempts remain NOT_PROJECTABLE — no
// reconstruction of per-item evidence is ever performed.
// ============================================

export interface AssignmentProjectionCandidate {
  /** Teacher-review marker (set by PATCH /api/reviews/[id]) */
  humanReviewedAt?: Date | string | null;
  attempts?: ReadonlyArray<{ answers?: ReadonlyArray<unknown> }>;
}

export type AssignmentProjectionStatus =
  | { status: 'projectable' }
  | { status: 'not-projectable'; reason: 'human-reviewed' | 'no-attempts' };

export function evaluateAssignmentSubmissionProjection(
  submission: AssignmentProjectionCandidate,
): AssignmentProjectionStatus {
  // 教師整體覆核 ≠ 逐題人類評分：優先排除。
  if (submission.humanReviewedAt != null) {
    return { status: 'not-projectable', reason: 'human-reviewed' };
  }
  // 舊資料：沒有嘗試證據，不得重建。
  if (!submission.attempts || submission.attempts.length === 0) {
    return { status: 'not-projectable', reason: 'no-attempts' };
  }
  return { status: 'projectable' };
}
