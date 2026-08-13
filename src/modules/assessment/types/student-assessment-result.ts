// ============================================
// Sprint 132 (R2) + R2.5 audit: StudentAssessmentResult — Domain Contract
// ============================================
// Answers: "What did this student demonstrate when answering this
// assessment?" — a RAW assessment observation.
//
// This is DIFFERENT from the AI AssessmentResult
// (ai/assessment/assessment-types.ts), which answers:
// "Is this generated question valid, reliable, fair, appropriately
// difficult, and pedagogically useful?" Both contracts coexist and
// must NEVER be merged or renamed into each other.
//
// Relationship to LearningEvidence (learning/types/evidence-types.ts):
//
//   StudentAssessmentResult ──► raw assessment observation
//          (this contract)
//                │
//                ▼ (later, NOT in this sprint)
//   LearningEvidence ────────► numeric learning/mastery evidence
//
// This contract does NOT embed LearningEvidence into items, does NOT
// compute mastery, and does NOT produce recommendations.
//
// ============================================
// RUNTIME IDENTITY (audited against prisma/schema.prisma)
// ============================================
//
//   StudentAssessmentResult = ASSESSMENT EXECUTION RESULT.
//     A storage-agnostic, validated snapshot of one student's outcome
//     in one assessment execution. It is NOT a persisted entity and
//     NOT a value object; it is a domain projection over the runtime
//     execution families below.
//
//   Runtime entity          →  Contract mapping (R3+ integration)
//   ----------------------------------------------------------------
//   PracticeSession.id       →  assessmentId  (context: 'practice')
//   PracticeAnswer           →  StudentAssessmentItem
//     questionIndex          →  questionId (synthesize `${session.id}-q${index}`,
//                              the EXACT pattern /api/practice already uses
//                              for Mistake.questionId)
//   Submission.id            →  assessmentId  (context: 'assignment')
//   Assignment.id            →  assignmentId (task-template reference)
//   AssignmentQuestion.id    →  questionId
//   ListeningSession.id      →  assessmentId  (R3+)
//   SpellingSession.id       →  assessmentId  (R3+)
//   DiagnosticResult         →  aggregate only; per-item mapping deferred
//
//   There is NO Prisma model named Assessment, Exercise, or Question.
//   The canonical execution identity is `assessmentId` — the domain
//   umbrella over sessionId (practice/listening/spelling) and
//   submissionId (assignment). No second identity exists in
//   AssessmentProvenance, so contradictory identity is impossible.
//
// ============================================
// DIMENSIONS (audited — orthogonal, never mixed)
// ============================================
//
//   context  = where the assessment came from
//              ('practice' | 'assignment' | 'diagnostic')
//              ≈ PracticeSession.source / Submission / DiagnosticResult
//
//   skill    = which learning skill domain was assessed
//              (MasterySkill — the canonical shared taxonomy owned by
//              student/mastery; the exact reuse pattern /api/diagnostic
//              already follows)
//
//   These are INDEPENDENT: reading+assignment, vocabulary+practice,
//   reading+diagnostic are all valid combinations.
//
// ============================================
// Contract invariants
// ============================================
// 1. `awardedScore` in [0, maxScore] for every item (maxScore > 0).
// 2. `score` in [0, maxScore] (maxScore > 0).
// 3. Aggregates are computed over COUNTED items only:
//      score    = sum of item.awardedScore where countsTowardScore
//      maxScore = sum of item.maxScore     where countsTowardScore
//    — enforced by VALIDATION, never silently recomputed.
// 4. `percentage === (score / maxScore) * 100` — unrounded canonical
//    float; rounding is a presentation-layer concern.
// 5. Empty assessment (items: [] or NO counted items) is INVALID —
//    reject rather than produce NaN/0 percentages.
// 6. `result: 'ungradable'` is structurally preserved and is NEVER
//    coerced to 'incorrect'. Whether it counts toward score is an
//    EXPLICIT per-item decision (`countsTowardScore`), never a
//    silent aggregate policy.
// 7. `countsTowardScore: false` is ONLY allowed for 'ungradable'
//    items, and such items MUST have awardedScore === 0.
// 8. Identity fields (studentId, assessmentId, questionId) are
//    explicit — no generic `sourceId` replacement.
// 9. Provenance records the evaluator (server | human | ai), NOT the
//    mastery-evidence source. Different concepts, different types.
// ============================================

import { MASTERY_SKILLS } from '@/modules/student/mastery/types';
import type { MasterySkill } from '@/modules/student/mastery/types';

// ============================================
// Enums
// ============================================

/**
 * Where this assessment came from — the assessment CONTEXT.
 *
 * This is ONE orthogonal dimension. The skill domain is the separate
 * `skill: MasterySkill` field. Do NOT merge them back into a single
 * enum (practice/assignment/diagnostic are contexts; reading/writing/
 * vocabulary are skill domains; combinations are valid).
 *
 * Runtime mapping (R3+):
 * - 'practice'    ← PracticeSession.source ('ai-generated' | 'mock')
 * - 'assignment'  ← PracticeSession.source 'assignment' | Submission
 * - 'diagnostic'  ← DiagnosticResult
 */
export type StudentAssessmentContext = 'practice' | 'assignment' | 'diagnostic';

/** All valid assessment contexts (for iteration / validation) */
export const STUDENT_ASSESSMENT_CONTEXTS: readonly StudentAssessmentContext[] = [
  'practice',
  'assignment',
  'diagnostic',
] as const;

/**
 * Outcome of one question for one student.
 *
 * - `correct`:    fully correct
 * - `incorrect`:  fully incorrect
 * - `partial`:    partial credit awarded. NO fixed ratio — a rubric
 *                 may award 0.25, 0.5, 0.75, or arbitrary points.
 *                 `awardedScore` carries the actual points.
 * - `ungradable`: cannot be graded (missing/blank/garbled response,
 *                 image, unsupported format). NOT the same as
 *                 'incorrect' — downstream systems must distinguish.
 *                 Use `countsTowardScore` to declare whether it
 *                 participates in the aggregate denominator.
 */
export type StudentAssessmentItemResult =
  | 'correct'
  | 'incorrect'
  | 'partial'
  | 'ungradable';

/** All valid item results (for iteration / validation) */
export const STUDENT_ASSESSMENT_ITEM_RESULTS: readonly StudentAssessmentItemResult[] = [
  'correct',
  'incorrect',
  'partial',
  'ungradable',
] as const;

/**
 * Who/what evaluated this assessment result.
 */
export type AssessmentEvaluator = 'server' | 'human' | 'ai';

/** All valid evaluators (for iteration / validation) */
export const ASSESSMENT_EVALUATORS: readonly AssessmentEvaluator[] = [
  'server',
  'human',
  'ai',
] as const;

// ============================================
// Contract types
// ============================================

/**
 * One student's answer to one question.
 *
 * This is a RAW assessment observation. It is deliberately NOT
 * wrapped in LearningEvidence — an MCQ answer is not numeric mastery
 * evidence; it is the primary observation mastery evidence will
 * later be derived from.
 *
 * `partial` carries an explicit `awardedScore` (no fixed ratio).
 * `ungradable` is distinct from `incorrect` and its participation in
 * the aggregate score is an explicit per-item decision.
 */
export interface StudentAssessmentItem {
  /** The question this answer belongs to (identity — required) */
  questionId: string;

  /**
   * Raw student response. Type is intentionally `unknown`:
   * a string ("B"), a number, a JSON object, a transcript, etc.
   * No shape is imposed at contract level.
   */
  response: unknown;

  /** Grading outcome — correct / incorrect / partial / ungradable */
  result: StudentAssessmentItemResult;

  /**
   * INVARIANT: 0 <= awardedScore <= maxScore.
   * Partial credit supported: e.g. 0.5 of 1.
   * INVARIANT: must be 0 when countsTowardScore is false.
   */
  awardedScore: number;

  /** INVARIANT: maxScore > 0 for every scorable item */
  maxScore: number;

  /**
   * Does this item participate in the aggregate score/maxScore?
   *
   * This is an EXPLICIT assessment-policy field — the contract never
   * silently decides the denominator. Examples:
   *
   *   10 items: 8 correct, 1 incorrect, 1 ungradable.
   *   - Policy A (ungradable counts, zero awarded):
   *       ungradable item { awardedScore: 0, maxScore: 1,
   *                         countsTowardScore: true }
   *       → aggregate 8 / 10 = 80%
   *   - Policy B (ungradable excluded from denominator):
   *       ungradable item { awardedScore: 0, maxScore: 1,
   *                         countsTowardScore: false }
   *       → aggregate 8 / 9 = 88.888...%
   *
   * Only 'ungradable' items may set this to false.
   */
  countsTowardScore: boolean;
}

/**
 * Where the grading verdict came from and when it was produced.
 *
 * This is NOT LearningEvidence.provenance. That records the origin
 * of mastery evidence (algorithm/model source); this records WHO
 * evaluated the student's answers (server rules, human marker, AI
 * evaluator) and which evaluator version was used.
 *
 * It deliberately carries NO identity field — the canonical
 * assessment identity lives only on the top-level result, so a
 * contradictory provenance identity cannot exist.
 */
export interface AssessmentProvenance {
  evaluator: AssessmentEvaluator;

  /** Method used, e.g. 'exact-match', 'keyword-overlap', 'rubric-3pl' */
  method?: string;

  /** Version of the evaluator (e.g. rubric version, model version) */
  evaluatorVersion?: string;

  /**
   * When this result record was evaluated/produced. ISO 8601.
   * DIFFERENT event from `completedAt` (student finished):
   * runtime mapping (R3+): Submission.gradedAt | Review.createdAt.
   */
  createdAt: string;
}

/**
 * The completed assessment result for one student — the assessment
 * EXECUTION RESULT.
 */
export interface StudentAssessmentResult {
  /**
   * Canonical ID of THIS STUDENT'S assessment EXECUTION (the attempt),
   * NOT the assessment definition/template.
   *
   * Runtime mapping (R3+):
   *   PracticeSession.id | Submission.id | ListeningSession.id |
   *   SpellingSession.id → assessmentId
   * The task-template reference (if any) is `assignmentId`.
   */
  assessmentId: string;

  /** The student who answered (required) */
  studentId: string;

  /**
   * OPTIONAL reference to the persistent task template the execution
   * belongs to — today exactly `Assignment.id` (the repository's real
   * task-template entity; see Submission.assignmentId).
   * Ad-hoc AI-generated practice has no template — leave undefined.
   * (No Exercise entity exists in the repository.)
   */
  assignmentId?: string;

  /** Assessment context: practice / assignment / diagnostic */
  context: StudentAssessmentContext;

  /**
   * The single canonical mastery skill when the execution is scoped
   * to one mastery skill (canonical shared taxonomy owned by
   * student/mastery — same reuse as /api/diagnostic).
   *
   * OPTIONAL: absent when the execution has no canonical mastery
   * skill, e.g. PracticeSession.skill='general' (a real fallback in
   * /api/practice), languageSkill='integrated', or executions that
   * span multiple skills.
   */
  skill?: MasterySkill;

  /**
   * Total awarded points over COUNTED items.
   * INVARIANT: equals sum(item.awardedScore) where countsTowardScore.
   *
   * Higher-level scoring policies (rubric normalization, DSE CLO
   * scoring, section weights, bonuses/penalties) must be RESOLVED
   * into explicit per-item awarded/max values BEFORE constructing
   * this contract. The contract never applies such policies itself.
   */
  score: number;

  /**
   * Total possible points over COUNTED items.
   * INVARIANT: equals sum(item.maxScore) where countsTowardScore, > 0.
   */
  maxScore: number;

  /**
   * Canonical percentage over counted items.
   * INVARIANT: equals (score / maxScore) * 100, unrounded.
   * Rounding/formatting belongs to the presentation layer.
   */
  percentage: number;

  /** Per-question results. INVARIANT: non-empty, ≥1 counted item */
  items: StudentAssessmentItem[];

  /**
   * When the student completed/submitted the assessment. ISO 8601.
   * Runtime mapping (R3+):
   *   PracticeSession.completedAt | Submission.submittedAt
   */
  completedAt: string;

  /** Who evaluated this result and when */
  provenance: AssessmentProvenance;
}

// ============================================
// Helper: canonical percentage
// ============================================

/**
 * Canonical percentage for a completed assessment.
 * No rounding — returns the raw float of (score / maxScore) * 100.
 *
 * Used by PRODUCERS to construct a consistent result. Validation
 * still re-checks consistency so that inconsistent upstream logic
 * is never silently hidden.
 */
export function computePercentage(score: number, maxScore: number): number {
  return (score / maxScore) * 100;
}

// ============================================
// Validation
// ============================================

export interface StudentAssessmentValidationError {
  field: string;
  message: string;
}

export interface StudentAssessmentValidationResult {
  valid: boolean;
  errors: StudentAssessmentValidationError[];
}

/** Absolute tolerance for float-sum consistency checks */
const SUM_EPSILON = 1e-9;
/** Absolute tolerance for percentage consistency checks */
const PERCENTAGE_EPSILON = 1e-6;

/**
 * Validate a StudentAssessmentResult against the contract invariants.
 *
 * DETECTS (never silently fixes):
 * 1. invalid percentage (out of range or inconsistent with score/maxScore)
 * 2. invalid overall score range
 * 3. invalid item awardedScore range
 * 4. score inconsistent with COUNTED item totals
 * 5. maxScore inconsistent with COUNTED item totals
 * 6. duplicate questionId
 * 7. empty assessment (items: [] or no counted items) — REJECTED
 * 8. invalid completedAt timestamp
 * 9. missing studentId
 * 10. missing assessmentId
 * 11. empty assignmentId when present
 * 12. invalid enums (result / context / skill / evaluator)
 * 13. countsTowardScore=false on non-ungradable items
 * 14. countsTowardScore=false with awardedScore != 0
 */
export function validateStudentAssessmentResult(
  result: StudentAssessmentResult,
): StudentAssessmentValidationResult {
  const errors: StudentAssessmentValidationError[] = [];

  // ---- Identity fields (required) ----
  if (!result.studentId || typeof result.studentId !== 'string') {
    errors.push({ field: 'studentId', message: 'studentId is required and must be a non-empty string' });
  }
  if (!result.assessmentId || typeof result.assessmentId !== 'string') {
    errors.push({ field: 'assessmentId', message: 'assessmentId is required and must be a non-empty string' });
  }
  // assignmentId is OPTIONAL (ad-hoc practice has no task template),
  // but when present it must not be empty.
  if (result.assignmentId !== undefined && (typeof result.assignmentId !== 'string' || result.assignmentId === '')) {
    errors.push({ field: 'assignmentId', message: 'assignmentId, when present, must be a non-empty string (task-template reference)' });
  }

  // ---- Context enum ----
  if (!STUDENT_ASSESSMENT_CONTEXTS.includes(result.context)) {
    errors.push({ field: 'context', message: `context must be one of: ${STUDENT_ASSESSMENT_CONTEXTS.join(', ')}` });
  }

  // ---- Skill enum (canonical MasterySkill taxonomy, OPTIONAL) ----
  // Absent skill = execution has no single canonical mastery skill
  // ('general' fallback, 'integrated', or multi-skill).
  if (result.skill !== undefined && !MASTERY_SKILLS.includes(result.skill)) {
    errors.push({ field: 'skill', message: `skill, when present, must be one of: ${MASTERY_SKILLS.join(', ')}` });
  }

  // ---- completedAt timestamp ----
  if (!result.completedAt || typeof result.completedAt !== 'string') {
    errors.push({ field: 'completedAt', message: 'completedAt is required and must be an ISO 8601 string' });
  } else if (isNaN(Date.parse(result.completedAt))) {
    errors.push({ field: 'completedAt', message: 'completedAt must be a valid ISO 8601 date string' });
  }

  // ---- Items: non-empty ----
  if (!Array.isArray(result.items) || result.items.length === 0) {
    errors.push({ field: 'items', message: 'a completed assessment must contain at least one item' });
  } else {
    // ---- Per-item checks ----
    const seenQuestionIds = new Set<string>();
    result.items.forEach((item, index) => {
      const prefix = `items[${index}]`;

      if (!item.questionId || typeof item.questionId !== 'string') {
        errors.push({ field: `${prefix}.questionId`, message: 'questionId is required and must be a non-empty string' });
      } else if (seenQuestionIds.has(item.questionId)) {
        errors.push({ field: `${prefix}.questionId`, message: `duplicate questionId '${item.questionId}' — each item must reference a unique question` });
      } else {
        seenQuestionIds.add(item.questionId);
      }

      if (!STUDENT_ASSESSMENT_ITEM_RESULTS.includes(item.result)) {
        errors.push({ field: `${prefix}.result`, message: `result must be one of: ${STUDENT_ASSESSMENT_ITEM_RESULTS.join(', ')}` });
      }

      if (typeof item.maxScore !== 'number' || item.maxScore <= 0) {
        errors.push({ field: `${prefix}.maxScore`, message: 'maxScore must be a positive number' });
      }

      if (typeof item.awardedScore !== 'number' || item.awardedScore < 0) {
        errors.push({ field: `${prefix}.awardedScore`, message: 'awardedScore must be a number >= 0' });
      } else if (typeof item.maxScore === 'number' && item.awardedScore > item.maxScore) {
        errors.push({ field: `${prefix}.awardedScore`, message: `awardedScore (${item.awardedScore}) must not exceed maxScore (${item.maxScore})` });
      }

      // countsTowardScore semantics
      if (typeof item.countsTowardScore !== 'boolean') {
        errors.push({ field: `${prefix}.countsTowardScore`, message: 'countsTowardScore is required and must be a boolean' });
      } else {
        if (item.countsTowardScore === false && item.result !== 'ungradable') {
          errors.push({
            field: `${prefix}.countsTowardScore`,
            message: `countsTowardScore=false is only allowed for 'ungradable' items (got '${item.result}') — only ungradable items may be excluded from scoring`,
          });
        }
        if (item.countsTowardScore === false && item.awardedScore !== 0) {
          errors.push({
            field: `${prefix}.awardedScore`,
            message: 'a non-counted item must have awardedScore = 0 (it contributes nothing)',
          });
        }
      }
    });
  }

  // ---- Counted items ----
  const items = Array.isArray(result.items) ? result.items : [];
  const countedItems = items.filter(i => i.countsTowardScore === true);
  if (items.length > 0 && countedItems.length === 0) {
    errors.push({ field: 'items', message: 'at least one item must count toward the score (no scorable denominator)' });
  }

  // ---- Overall score range ----
  if (typeof result.score !== 'number' || result.score < 0) {
    errors.push({ field: 'score', message: 'score must be a number >= 0' });
  }
  if (typeof result.maxScore !== 'number' || result.maxScore <= 0) {
    errors.push({ field: 'maxScore', message: 'maxScore must be a positive number — no scorable denominator is invalid' });
  }
  if (
    typeof result.score === 'number' &&
    typeof result.maxScore === 'number' &&
    result.maxScore > 0 &&
    result.score > result.maxScore
  ) {
    errors.push({ field: 'score', message: `score (${result.score}) must not exceed maxScore (${result.maxScore})` });
  }

  // ---- Consistency: score/maxScore vs COUNTED item totals ----
  if (countedItems.length > 0) {
    const itemAwardedTotal = countedItems.reduce((sum, item) => sum + item.awardedScore, 0);
    const itemMaxTotal = countedItems.reduce((sum, item) => sum + item.maxScore, 0);

    if (typeof result.score === 'number' && Math.abs(result.score - itemAwardedTotal) > SUM_EPSILON) {
      errors.push({
        field: 'score',
        message: `score (${result.score}) is inconsistent with sum of counted item awardedScore (${itemAwardedTotal})`,
      });
    }
    if (typeof result.maxScore === 'number' && Math.abs(result.maxScore - itemMaxTotal) > SUM_EPSILON) {
      errors.push({
        field: 'maxScore',
        message: `maxScore (${result.maxScore}) is inconsistent with sum of counted item maxScore (${itemMaxTotal})`,
      });
    }
  }

  // ---- Percentage: range + consistency ----
  if (typeof result.percentage !== 'number' || result.percentage < 0 || result.percentage > 100) {
    errors.push({ field: 'percentage', message: 'percentage must be a number in [0, 100]' });
  } else if (
    typeof result.score === 'number' &&
    typeof result.maxScore === 'number' &&
    result.maxScore > 0
  ) {
    const expected = computePercentage(result.score, result.maxScore);
    if (Math.abs(result.percentage - expected) > PERCENTAGE_EPSILON) {
      errors.push({
        field: 'percentage',
        message: `percentage (${result.percentage}) is inconsistent with score/maxScore (${result.score}/${result.maxScore} = ${expected})`,
      });
    }
  }

  // ---- Provenance ----
  if (!result.provenance || typeof result.provenance !== 'object') {
    errors.push({ field: 'provenance', message: 'provenance is required (who evaluated this result)' });
  } else {
    if (!ASSESSMENT_EVALUATORS.includes(result.provenance.evaluator)) {
      errors.push({ field: 'provenance.evaluator', message: `evaluator must be one of: ${ASSESSMENT_EVALUATORS.join(', ')}` });
    }
    if (!result.provenance.createdAt || typeof result.provenance.createdAt !== 'string') {
      errors.push({ field: 'provenance.createdAt', message: 'provenance.createdAt is required and must be an ISO 8601 string' });
    } else if (isNaN(Date.parse(result.provenance.createdAt))) {
      errors.push({ field: 'provenance.createdAt', message: 'provenance.createdAt must be a valid ISO 8601 date string' });
    }
  }

  return { valid: errors.length === 0, errors };
}
