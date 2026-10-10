// ============================================
// Self-Directed Practice — domain types (2026-10-10, Sprint 140)
// ============================================
// Boundaries of the feature, in one place:
//   - the validated practice SPECIFICATION (what the student asked for, after
//     normalization) — Phase 1 of the mandate;
//   - what may be delivered BEFORE submission (no answer keys, ever);
//   - what may be delivered AFTER submission (reference answers + explanations);
//   - the typed error surface the API layer maps onto HTTP statuses.
// ============================================

export type PracticeCategory = 'grammar' | 'sentence_pattern' | 'vocabulary';

export type PracticeDifficulty = 'basic' | 'intermediate' | 'advanced';

export type PracticeQuestionType =
  | 'mc'
  | 'fill_blank'
  | 'error_correction'
  | 'transformation'
  | 'sentence_production';

export type PracticeVerdict = 'correct' | 'partially_correct' | 'incorrect' | 'needs_review';

/** Only MC is marked deterministically; text answers need semantic judgement. */
export const OBJECTIVE_QUESTION_TYPES: readonly PracticeQuestionType[] = ['mc'];

export function isObjectiveQuestionType(type: string): boolean {
  return (OBJECTIVE_QUESTION_TYPES as readonly string[]).includes(type);
}

/** Phase 1: the validated, typed practice specification. */
export interface PracticeSpec {
  /** The student's own words (untrusted; stored verbatim for auditability). */
  requestText: string;
  /** Normalized learning objective derived from the request. */
  objective: string;
  category: PracticeCategory;
  difficulty: PracticeDifficulty;
  questionCount: number;
  exerciseTypes: PracticeQuestionType[];
  /** Disclosed server interpretation when the request did not state the category. */
  interpretation: string | null;
}

/** A generation result that passed every deterministic gate. */
export interface ValidatedQuestion {
  orderIndex: number;
  questionType: PracticeQuestionType;
  instructions: string;
  prompt: string;
  answerKey: string;
  acceptedAnswers: string[];
  rejectedAnswers: Array<{ answer: string; why: string }>;
  rubric: { marks: number; criteria: string[] };
  targetRule: string;
  explanationZh: string | null;
  explanationEn: string;
  misconceptionTags: string[];
  maxMarks: number;
}

/** What a student may see BEFORE submitting: no key, no rubric, no explanation. */
export interface DeliveredQuestion {
  id: string;
  orderIndex: number;
  questionType: string;
  instructions: string;
  prompt: string;
  /**
   * The topic being practised ONLY (the part of `targetRule` before the colon).
   * The rule itself is the answer, so it is revealed after submission with the
   * explanation, never while the student is still working (2026-10-10 report:
   * the full rule was shown before answering and gave the answer away).
   */
  targetTopic: string;
  maxMarks: number;
}

export interface DeliveredSet {
  id: string;
  objective: string;
  category: string;
  difficulty: string;
  interpretation: string | null;
  createdAt: string;
  questionCount: number;
  submitted: boolean;
  questions: DeliveredQuestion[];
}

/** What a student may see AFTER submitting. */
export interface DeliveredResponse {
  questionId: string;
  orderIndex: number;
  verdict: PracticeVerdict;
  awardedMarks: number;
  maxMarks: number;
  rationale: string;
  /** The same explanation in Traditional Chinese; null when the marker omitted it. */
  rationaleZh: string | null;
  referenceAnswer: string;
  acceptedAlternatives: string[];
  improvement: string | null;
  improvementZh: string | null;
  explanationEn: string;
  explanationZh: string | null;
  misconceptionTags: string[];
  targetRule: string;
  needsReview: boolean;
}

export interface DeliveredResults {
  setId: string;
  submittedAt: string;
  gradedAt: string | null;
  awardedMarks: number;
  totalMarks: number;
  needsReviewCount: number;
  overallFeedback: string | null;
  overallFeedbackZh: string | null;
  /** True when at least one item could not be graded by the AI marker. */
  gradingDegraded: boolean;
  responses: DeliveredResponse[];
}

/** Grading output for a single item, produced by the grading service. */
export interface GradedItem {
  questionId: string;
  verdict: PracticeVerdict;
  awardedMarks: number;
  maxMarks: number;
  rationale: string;
  /** Traditional-Chinese counterpart of `rationale` (bilingual self-study feedback). */
  rationaleZh: string | null;
  improvement: string | null;
  improvementZh: string | null;
  needsReview: boolean;
}

export type CustomPracticeErrorCode =
  | 'INVALID_REQUEST'
  | 'CATEGORY_AMBIGUOUS'
  | 'GENERATION_FAILED'
  | 'NOT_FOUND'
  | 'ALREADY_SUBMITTED'
  | 'NO_ANSWERS';

export class CustomPracticeError extends Error {
  readonly code: CustomPracticeErrorCode;
  readonly details?: unknown;

  constructor(code: CustomPracticeErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'CustomPracticeError';
    this.code = code;
    this.details = details;
  }
}
