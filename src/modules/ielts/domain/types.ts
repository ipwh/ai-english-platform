// ============================================
// 2026-10-03 PHASE IELTS-01 — IELTS Domain Types
// ============================================
// Canonical types for the IELTS preparation subsystem. Pure types + const
// tables — no Prisma, no AI, no React. Everything here is shared by the
// deterministic scorer, validators, services and the API layer.
//
// GOVERNANCE: this subsystem is isolated from HKDSE scoring/calibration/
// evidence/XP. Bands produced here are platform PRACTICE ESTIMATES and every
// estimate carries `estimate: true` plus the official variance caveat.
// ============================================

/** IELTS variant. Academic and General Training MUST remain distinguishable. */
export type IeltsTestType = 'ACADEMIC' | 'GENERAL_TRAINING';

/** Four skills. */
export type IeltsSkill = 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';

/** Question lifecycle (must match Prisma `validationStatus` strings). */
export type IeltsValidationStatus =
  | 'DRAFT'
  | 'AI_VALIDATED'
  | 'QA_REQUIRED'
  | 'HUMAN_APPROVED'
  | 'PUBLISHED'
  | 'REJECTED';

/** Where content came from. Never claim generated content is official. */
export type IeltsContentSourceType =
  | 'ORIGINAL_GENERATED'
  | 'OFFICIAL_REFERENCE'
  | 'USER_CREATED'
  | 'LICENSED';

export interface IeltsContentSource {
  type: IeltsContentSourceType;
  sourceUrl?: string;
  notes?: string;
}

/** Platform difficulty estimate — NEVER an official IELTS parameter. */
export type IeltsDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export const IELTS_DIFFICULTY_MODEL_VERSION = 'ielts-platform-difficulty-v1';

// ============================================
// Question types (official inventory; see docs/ielts/IELTS_SPECIFICATION.md)
// ============================================

export type IeltsListeningQuestionType =
  | 'listening_multiple_choice'
  | 'listening_matching'
  | 'listening_plan_map_diagram_labelling'
  | 'listening_form_note_table_flowchart_completion'
  | 'listening_sentence_completion'
  | 'listening_short_answer';

export type IeltsReadingQuestionType =
  | 'reading_multiple_choice'
  | 'reading_true_false_not_given'
  | 'reading_yes_no_not_given'
  | 'reading_matching_information'
  | 'reading_matching_headings'
  | 'reading_matching_features'
  | 'reading_matching_sentence_endings'
  | 'reading_sentence_completion'
  | 'reading_summary_note_table_flowchart_completion'
  | 'reading_diagram_label_completion'
  | 'reading_short_answer';

export type IeltsWritingQuestionType = 'writing_task';
export type IeltsSpeakingQuestionType = 'speaking_task';

export type IeltsQuestionType =
  | IeltsListeningQuestionType
  | IeltsReadingQuestionType
  | IeltsWritingQuestionType
  | IeltsSpeakingQuestionType;

/** Completion-family types that carry a word limit. */
export const IELTS_WORD_LIMITED_TYPES: readonly IeltsQuestionType[] = [
  'listening_form_note_table_flowchart_completion',
  'listening_sentence_completion',
  'listening_short_answer',
  'reading_sentence_completion',
  'reading_summary_note_table_flowchart_completion',
  'reading_diagram_label_completion',
  'reading_short_answer',
];

/** Multiple-choice family (letter answers over authored options). */
export const IELTS_MC_TYPES: readonly IeltsQuestionType[] = [
  'listening_multiple_choice',
  'reading_multiple_choice',
];

/** Matching family (option-code answers). */
export const IELTS_MATCHING_TYPES: readonly IeltsQuestionType[] = [
  'listening_matching',
  'reading_matching_information',
  'reading_matching_headings',
  'reading_matching_features',
  'reading_matching_sentence_endings',
];

/** Plan/map/diagram labelling may be code-based or text-based; authoring decides. */
export const IELTS_LABELLING_TYPES: readonly IeltsQuestionType[] = [
  'listening_plan_map_diagram_labelling',
];

export function isIeltsWordLimitedType(type: IeltsQuestionType): boolean {
  return IELTS_WORD_LIMITED_TYPES.includes(type);
}

export function isIeltsMcType(type: IeltsQuestionType): boolean {
  return IELTS_MC_TYPES.includes(type);
}

export function isIeltsMatchingType(type: IeltsQuestionType): boolean {
  return IELTS_MATCHING_TYPES.includes(type);
}

export function isIeltsObjectiveType(type: IeltsQuestionType): boolean {
  return (
    isIeltsWordLimitedType(type) ||
    isIeltsMcType(type) ||
    isIeltsMatchingType(type) ||
    IELTS_LABELLING_TYPES.includes(type) ||
    type === 'reading_true_false_not_given' ||
    type === 'reading_yes_no_not_given'
  );
}

// ============================================
// Word limits
// ============================================

/** Parsed word-limit rule, e.g. "NO MORE THAN TWO WORDS AND/OR A NUMBER" ⇒ { maxWords: 2, allowsNumber: true }. */
export interface IeltsWordLimit {
  maxWords?: number;
  allowsNumber?: boolean;
  /** Display string as authored (official-style instruction). */
  instruction?: string;
}

// ============================================
// Evidence
// ============================================

export interface IeltsEvidenceSpan {
  start: number;
  end: number;
  text: string;
}

/** Reading item provenance: answer must be traceable to the passage. */
export interface IeltsReadingItemEvidence {
  passageId: string;
  evidenceSpans: IeltsEvidenceSpan[];
  reasoning: string;
  answerType: string;
}

/** Listening item provenance: answer must be locatable in the transcript. */
export interface IeltsListeningItemEvidence {
  audioId?: string;
  transcriptSpan?: IeltsEvidenceSpan;
  expectedAnswer: string | string[];
  acceptedVariants?: string[];
  wordLimit?: IeltsWordLimit;
}

export type IeltsItemEvidence = IeltsReadingItemEvidence | IeltsListeningItemEvidence;

export function isReadingEvidence(e: IeltsItemEvidence): e is IeltsReadingItemEvidence {
  return Array.isArray((e as IeltsReadingItemEvidence).evidenceSpans);
}

export function isListeningEvidence(e: IeltsItemEvidence): e is IeltsListeningItemEvidence {
  return 'expectedAnswer' in e;
}

// ============================================
// Answer keys / options
// ============================================

export interface IeltsOption {
  code: string; // "A", "B", … or "i", "ii", …
  text: string;
}

/**
 * Answer key representation:
 *  - single canonical answer: string
 *  - explicit multi-answer (order-insensitive unless declared): string[]
 */
export type IeltsAnswerKey = string | string[];

export type IeltsAnswerMode = 'single' | 'multiple-order-insensitive' | 'multiple-order-sensitive';

// ============================================
// Canonical question shape (service-facing; DB rows are parsed into this)
// ============================================

export interface IeltsQuestionDefinition {
  id: string;
  testId: string;
  sectionId?: string | null;
  orderIndex: number;
  questionType: IeltsQuestionType;
  skill: IeltsSkill;
  prompt: string;
  options?: IeltsOption[] | string[];
  answerKey?: IeltsAnswerKey;
  answerMode?: IeltsAnswerMode;
  acceptedAnswers?: string[];
  wordLimit?: IeltsWordLimit;
  evidence?: IeltsItemEvidence;
  explanation?: string;
  difficulty: IeltsDifficulty;
  difficultyModel?: string;
  contentSource: IeltsContentSource;
  generatorVersion?: string;
  validationStatus: IeltsValidationStatus;
}

// ============================================
// Scoring results
// ============================================

export type IeltsVerdict = 'correct' | 'incorrect' | 'ungradable';

export const IELTS_SERVER_SCORING_METHOD = 'ielts-server-deterministic';

export type IeltsScoreReason =
  | 'EXACT_MATCH'
  | 'ACCEPTED_VARIANT'
  | 'NUMBER_EQUIVALENT'
  | 'MC_LETTER_MATCH'
  | 'MC_OPTION_TEXT_MATCH'
  | 'MATCHING_CODE_MATCH'
  | 'TRUEFALSE_CANONICAL'
  | 'WORD_LIMIT_EXCEEDED'
  | 'NUMBER_NOT_ALLOWED'
  | 'EMPTY_ANSWER'
  | 'NO_MATCH'
  | 'OPEN_ENDED_NOT_DETERMINISTIC';

export interface IeltsItemScore {
  verdict: IeltsVerdict;
  awardedScore: number;
  maxScore: number;
  countsTowardScore: boolean;
  scoredBy: typeof IELTS_SERVER_SCORING_METHOD;
  reason: IeltsScoreReason;
  wordCount?: number;
  limitExceeded?: boolean;
}

// ============================================
// Band estimates (see docs/ielts/IELTS_SCORING.md)
// ============================================

export interface IeltsBandEstimate {
  /** Always true — the platform never claims an exact official conversion. */
  estimate: true;
  /** Where this number came from — never collapsed into a generic score. */
  scoringMethod: 'DETERMINISTIC_OBJECTIVE';
  component: 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING' | 'OVERALL';
  /** Conservative lower bound band (whole/half). */
  minBand: number;
  /** Exclusive upper bound band, or null when == 9.0 is inclusive max. */
  maxBandExclusive: number | null;
  /** UI display range, e.g. "6.5–7.0". Never false precision. */
  displayRange: string;
  rawScore?: number;
  rawTotal?: number;
  tableId?: string;
  tableVersion?: string;
  source?: string;
  sourceKind?: 'OFFICIAL_PUBLIC_AVERAGE';
  officialNote: string;
  /** Set when the practice set is a subset that cannot map to a full band. */
  notComparableReason?: string;
}

// ============================================
// Writing / Speaking task types & criteria
// ============================================

export type IeltsWritingTaskType =
  | 'academic_task1'
  | 'academic_task2'
  | 'general_task1'
  | 'general_task2';

export type IeltsSpeakingPartType = 'speaking_part1' | 'speaking_part2' | 'speaking_part3';

export type IeltsWritingCriterionKey =
  | 'taskAchievementOrResponse'
  | 'coherenceAndCohesion'
  | 'lexicalResource'
  | 'grammaticalRangeAndAccuracy';

export type IeltsSpeakingCriterionKey =
  | 'fluencyAndCoherence'
  | 'lexicalResource'
  | 'grammaticalRangeAndAccuracy'
  | 'pronunciation';

export type IeltsAssessmentSource = 'AI_ESTIMATE' | 'HUMAN_MARKER' | 'CALIBRATED_HUMAN_VALIDATED';

export type IeltsAssessmentConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NOT_CALIBRATED';

export const IELTS_WRITING_CRITERIA: readonly IeltsWritingCriterionKey[] = [
  'taskAchievementOrResponse',
  'coherenceAndCohesion',
  'lexicalResource',
  'grammaticalRangeAndAccuracy',
];

export const IELTS_SPEAKING_CRITERIA: readonly IeltsSpeakingCriterionKey[] = [
  'fluencyAndCoherence',
  'lexicalResource',
  'grammaticalRangeAndAccuracy',
  'pronunciation',
];

/** Typed failure modes — never converted into successful assessment states. */
export type IeltsFailureCode =
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_ERROR'
  | 'AI_INVALID_JSON'
  | 'AI_MISSING_CRITERION'
  | 'AI_MISSING_EVIDENCE'
  | 'AI_UNSUPPORTED_BAND'
  | 'AI_EVIDENCE_MISMATCH'
  | 'TASK_NOT_ANSWERED'
  | 'WORD_LIMIT_EXCEEDED'
  | 'MISSING_SOURCE_EVIDENCE'
  | 'INVALID_QUESTION'
  | 'UNVERIFIED_PRONUNCIATION'
  | 'CALIBRATION_INSUFFICIENT_DATA';

// ============================================
// Governance states (see docs/ielts/IELTS_ASSESSMENT_GOVERNANCE.md)
// ============================================

export type IeltsHumanEvidenceState = 'INSUFFICIENT' | 'AVAILABLE' | 'SUFFICIENT_FOR_INTERNAL_VALIDATION';
export type IeltsMarkerEquivalenceState = 'UNPROVEN' | 'UNDER_EVALUATION' | 'SUPPORTED';
export type IeltsFeatureStatus =
  | 'IMPLEMENTED'
  | 'PARTIALLY_IMPLEMENTED'
  | 'NOT_AVAILABLE'
  | 'NOT_CALIBRATED'
  | 'NOT_VERIFIED';
