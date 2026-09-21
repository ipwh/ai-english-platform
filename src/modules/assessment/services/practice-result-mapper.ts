// ============================================
// R3.4: PracticeSession/PracticeAnswer → StudentAssessmentResult Mapper
// ============================================
// Pure, deterministic, evidence-bound projection layer. NOT an evaluator.
//
// Authority facts (frozen by R3.1–R3.3):
// - ANSWER-SCORING authority for deterministic practice rows is the
//   server (scoredBy='server', scoringMethod='deterministic-answer-comparison').
// - QUESTION-DEFINITION authority is NOT established: correctAnswer/choices
//   are client-supplied and the server has no question store. This mapper
//   never claims otherwise.
//
// Rules:
// - Rows with scoredBy='server' OR scoredBy='ai' are projectable — but the
//   authority MUST be UNIFORM across the whole execution.
// - Mixed server+ai rows make the WHOLE session NOT_PROJECTABLE
//   (mixed-authority): the frozen contract has exactly one execution-level
//   evaluator and no per-item provenance.
// - Persisted result/awardedScore/maxScore/countsTowardScore are COPIED,
//   never recomputed, never normalized, never repaired.
// - Aggregates are derived ONLY from persisted item values over counted
//   items (countsTowardScore !== false).
// - questionId must be non-null — never synthesized.
// - evaluator maps the uniform persisted scoredBy 1:1 ('server' → 'server',
//   'ai' → 'ai'). 'client' and unknown values have NO frozen enum
//   counterpart → NOT_PROJECTABLE (never cast).
// - evaluatorVersion is never invented → always undefined.
// - context/skill use only existing deterministic repository mappings:
//     context ← contract-documented PracticeSession.source table
//     skill   ← MASTERY_SKILLS direct match OR knowledge-graph grammar
//               node category (getSkill), else NOT_PROJECTABLE.
// - Mixed/unsupported rows make the WHOLE session NOT_PROJECTABLE
//   (no silent partial projection).
//
// WHEN EVIDENCE IS MISSING, RETURN NOT_PROJECTABLE.
// NEVER TURN MISSING EVIDENCE INTO A VALUE.
// ============================================

import { getSkill } from '@/modules/learning/services/knowledge-graph';
import { MASTERY_SKILLS } from '@/modules/student/mastery/types';
import type { MasterySkill } from '@/modules/student/mastery/types';
import {
  STUDENT_ASSESSMENT_ITEM_RESULTS,
  computePercentage,
  validateStudentAssessmentResult,
} from '../types/student-assessment-result';
import type {
  AssessmentEvaluator,
  StudentAssessmentContext,
  StudentAssessmentItemResult,
  StudentAssessmentResult,
} from '../types/student-assessment-result';

// ============================================
// Input mirrors (structural — Prisma rows satisfy these)
// ============================================

export interface PracticeSessionProjectionInput {
  id: string;
  studentId: string;
  /** grammarItem | languageSkill | 'general' | 'daily' | ... */
  skill: string;
  /** 'ai-generated' | 'mock' | 'daily-challenge' | 'dse-*' | 'assignment' | ... */
  source: string;
  completedAt: Date | string | null;
}

export interface PracticeAnswerProjectionInput {
  questionId: string | null;
  questionIndex: number;
  studentAnswer: string | null | undefined;
  result: string | null | undefined;
  awardedScore: number | null | undefined;
  maxScore: number | null | undefined;
  countsTowardScore: boolean | null | undefined;
  scoredBy: string | null | undefined;
  scoringMethod: string | null | undefined;
  createdAt: Date | string;
}

// ============================================
// Projection result
// ============================================

export type ProjectionNotProjectableReason =
  | 'no-items'
  | 'mixed-authority'
  | 'mixed-scoring-method'
  | 'unsupported-authority'
  | 'missing-scoring-method'
  | 'missing-question-id'
  | 'missing-result'
  | 'invalid-result'
  | 'missing-awarded-score'
  | 'missing-max-score'
  | 'missing-counts-toward-score'
  | 'invalid-score-range'
  | 'contract-validation-failed'
  | 'unknown-source'
  | 'unmappable-skill'
  | 'missing-completed-at'
  | 'missing-student-id'
  | 'no-counted-items';

export type PracticeProjectionResult =
  | { status: 'projectable'; value: StudentAssessmentResult }
  | {
      status: 'not-projectable';
      reason: ProjectionNotProjectableReason;
      /** Human-readable, evidence-bound explanation (never fabricated values) */
      evidence: Record<string, unknown>;
    };

function notProjectable(
  reason: ProjectionNotProjectableReason,
  evidence: Record<string, unknown>,
): PracticeProjectionResult {
  return { status: 'not-projectable', reason, evidence };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

// ============================================
// Deterministic skill mapping (existing repository evidence only)
// ============================================

/**
 * Map a PracticeSession.skill string to the canonical MasterySkill.
 *
 * Evidence sources:
 * 1. Direct match against MASTERY_SKILLS (languageSkill values
 *    'reading'|'writing'|'listening'|'speaking'|'vocabulary'|'grammar').
 * 2. Knowledge-graph grammar node lookup (grammarItem ids such as
 *    'present-perfect' → category 'grammar') — the repository's existing
 *    deterministic mapping.
 *
 * No arbitrary fallback. Returns undefined when no canonical skill
 * exists ('general', 'daily', 'integrated', 'integrated-skills').
 */
export function mapSessionSkillToMasterySkill(skill: string): MasterySkill | undefined {
  if (MASTERY_SKILLS.includes(skill as MasterySkill)) {
    return skill as MasterySkill;
  }
  const node = getSkill(skill);
  if (node && MASTERY_SKILLS.includes(node.category as MasterySkill)) {
    return node.category as MasterySkill;
  }
  return undefined;
}

// ============================================
// Deterministic context mapping (contract-documented source table)
// ============================================

/**
 * Map PracticeSession.source → StudentAssessmentContext using the
 * contract-documented runtime table (student-assessment-result.ts):
 *
 *   'practice'    ← 'ai-generated' | 'mock' (practice family)
 *   'practice'    ← practice-family executions recorded under
 *                   'daily-challenge' | 'dse-reading' | 'dse-listening'
 *                   | 'dse-speaking' | 'dse-writing' | 'dse-integrated-skills'
 *   'assignment'  ← 'assignment'
 *   'diagnostic'  ← 'diagnostic'
 *
 * Any source outside this table → undefined (NOT_PROJECTABLE).
 */
export function mapPracticeSourceToContext(source: string): StudentAssessmentContext | undefined {
  switch (source) {
    case 'ai-generated':
    case 'mock':
    case 'daily-challenge':
    case 'dse-reading':
    case 'dse-listening':
    case 'dse-speaking':
    case 'dse-writing':
    case 'dse-integrated-skills':
      return 'practice';
    case 'assignment':
      return 'assignment';
    case 'diagnostic':
      return 'diagnostic';
    default:
      return undefined;
  }
}

// ============================================
// The mapper
// ============================================

export function mapPracticeSessionToStudentAssessmentResult(
  session: PracticeSessionProjectionInput,
  answers: PracticeAnswerProjectionInput[],
): PracticeProjectionResult {
  // ---- Session identity / timestamps ----
  if (!session.studentId || typeof session.studentId !== 'string') {
    return notProjectable('missing-student-id', { sessionId: session.id });
  }
  if (!session.completedAt) {
    return notProjectable('missing-completed-at', { sessionId: session.id });
  }
  const completedAt = toIso(session.completedAt);
  if (isNaN(Date.parse(completedAt))) {
    return notProjectable('missing-completed-at', { sessionId: session.id, completedAt });
  }

  // ---- Context (deterministic source table) ----
  const context = mapPracticeSourceToContext(session.source);
  if (context === undefined) {
    return notProjectable('unknown-source', { sessionId: session.id, source: session.source });
  }

  // ---- Skill (deterministic mapping; no arbitrary fallback) ----
  const skill = mapSessionSkillToMasterySkill(session.skill);
  if (skill === undefined) {
    return notProjectable('unmappable-skill', { sessionId: session.id, skill: session.skill });
  }

  // ---- Items must exist ----
  if (!Array.isArray(answers) || answers.length === 0) {
    return notProjectable('no-items', { sessionId: session.id });
  }

  // ---- Per-item authority + scoring evidence ----
  const seenAuthorities = new Set<string>();
  const seenMethods = new Set<string>();
  let latestCreatedAt: string | null = null;

  for (const a of answers) {
    // R3.8 authority gate: only rows with a supported persisted authority
    // ('server' | 'ai') are candidates for projection. Every other value
    // ('client', null, unknown) is recorded and makes the execution
    // NOT_PROJECTABLE at the authority gate below — never cast.
    if (a.scoredBy !== 'server' && a.scoredBy !== 'ai') {
      seenAuthorities.add(a.scoredBy ?? 'null');
      continue;
    }
    seenAuthorities.add(a.scoredBy);

    // Method: must be persisted and non-empty.
    if (typeof a.scoringMethod !== 'string' || a.scoringMethod === '') {
      return notProjectable('missing-scoring-method', {
        sessionId: session.id,
        questionId: a.questionId,
        scoredBy: a.scoredBy,
      });
    }
    seenMethods.add(a.scoringMethod);

    // Identity: questionId must be canonical, non-null. Never synthesized.
    if (typeof a.questionId !== 'string' || a.questionId.trim() === '') {
      return notProjectable('missing-question-id', {
        sessionId: session.id,
        questionIndex: a.questionIndex,
      });
    }

    // Result: must be a persisted valid contract enum value.
    if (a.result == null) {
      return notProjectable('missing-result', { sessionId: session.id, questionId: a.questionId });
    }
    if (!STUDENT_ASSESSMENT_ITEM_RESULTS.includes(a.result as StudentAssessmentItemResult)) {
      return notProjectable('invalid-result', { sessionId: session.id, questionId: a.questionId, result: a.result });
    }

    // Scores: persisted evidence only — never recomputed or repaired.
    if (typeof a.awardedScore !== 'number' || !Number.isFinite(a.awardedScore)) {
      return notProjectable('missing-awarded-score', { sessionId: session.id, questionId: a.questionId });
    }
    if (typeof a.maxScore !== 'number' || !Number.isFinite(a.maxScore)) {
      return notProjectable('missing-max-score', { sessionId: session.id, questionId: a.questionId });
    }
    if (a.maxScore <= 0 || a.awardedScore < 0 || a.awardedScore > a.maxScore) {
      // Persisted data violates the contract invariant — the mapper is
      // not a validator/repairer. NOT_PROJECTABLE.
      return notProjectable('invalid-score-range', {
        sessionId: session.id,
        questionId: a.questionId,
        awardedScore: a.awardedScore,
        maxScore: a.maxScore,
      });
    }
    if (typeof a.countsTowardScore !== 'boolean') {
      return notProjectable('missing-counts-toward-score', {
        sessionId: session.id,
        questionId: a.questionId,
      });
    }

    // Track latest authoritative evaluation timestamp.
    const itemCreatedAt = toIso(a.createdAt);
    if (isNaN(Date.parse(itemCreatedAt))) {
      return notProjectable('missing-completed-at', { sessionId: session.id, questionId: a.questionId, createdAt: itemCreatedAt });
    }
    if (latestCreatedAt === null || Date.parse(itemCreatedAt) > Date.parse(latestCreatedAt)) {
      latestCreatedAt = itemCreatedAt;
    }
  }

  // ---- Uniform authority is required (no silent partial projection) ----
  if (seenAuthorities.size > 1) {
    return notProjectable('mixed-authority', {
      sessionId: session.id,
      authorities: [...seenAuthorities],
    });
  }
  if (seenAuthorities.has('server') === false && seenAuthorities.has('ai') === false) {
    return notProjectable('unsupported-authority', {
      sessionId: session.id,
      scoredBy: [...seenAuthorities][0],
    });
  }
  // Exactly one authority remains — validated, never cast:
  const evaluator: AssessmentEvaluator = seenAuthorities.has('server') ? 'server' : 'ai';
  if (seenMethods.size > 1) {
    return notProjectable('mixed-scoring-method', {
      sessionId: session.id,
      methods: [...seenMethods],
    });
  }

  // ---- Build items (values copied verbatim from persisted evidence) ----
  const items = answers.map(a => ({
    questionId: a.questionId as string,
    response: a.studentAnswer ?? '',
    result: a.result as StudentAssessmentItemResult,
    awardedScore: a.awardedScore as number,
    maxScore: a.maxScore as number,
    countsTowardScore: a.countsTowardScore as boolean,
  }));

  // ---- Aggregation: counted items only (frozen contract semantics) ----
  const counted = items.filter(i => i.countsTowardScore !== false);
  if (counted.length === 0) {
    return notProjectable('no-counted-items', { sessionId: session.id });
  }
  const score = counted.reduce((sum, i) => sum + i.awardedScore, 0);
  const maxScore = counted.reduce((sum, i) => sum + i.maxScore, 0);
  if (maxScore <= 0) {
    return notProjectable('no-counted-items', { sessionId: session.id, maxScore });
  }

  const value: StudentAssessmentResult = {
    assessmentId: session.id,
    studentId: session.studentId,
    // Practice executions have no Assignment template → omitted.
    assignmentId: undefined,
    context,
    skill,
    score,
    maxScore,
    percentage: computePercentage(score, maxScore),
    items,
    completedAt,
    provenance: {
      evaluator,
      method: [...seenMethods][0],
      // No authoritative evaluatorVersion source exists. The key is
      // deliberately OMITTED (never present with an invented value).
      // Authoritative persisted evaluation-record timestamp
      // (latest item evaluation among this session's rows).
      createdAt: latestCreatedAt as string,
    },
  };

  // Defense in depth: the frozen contract validator is the final gate.
  const validation = validateStudentAssessmentResult(value);
  if (!validation.valid) {
    return notProjectable('contract-validation-failed', {
      sessionId: session.id,
      errors: validation.errors,
    });
  }

  return { status: 'projectable', value };
}
