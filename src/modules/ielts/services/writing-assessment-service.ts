// ============================================
// 2026-10-03 PHASE IELTS-01: Writing Assessment Service
// ============================================
// Orchestrates the AI-assisted writing assessment with the platform's evidence
// governance (docs/ielts/IELTS_ASSESSMENT_GOVERNANCE.md §5):
//
//   deterministic pre-checks → AI call (injectable) → semantic validation
//   (band legality, evidence-quote verification, claim screening, coverage)
//   → SERVER-computed task band → persisted audit row
//
// The AI never supplies the task band, never certifies anything, and a failure
// NEVER becomes a successful assessment state: failures are stored as explicit
// FAILED rows with a typed failureCode.
// ============================================

import {
  assessIeltsWritingWithAI,
  type IeltsWritingAiResult,
} from '@/modules/ai';
import type {
  IeltsAssessmentConfidence,
  IeltsFailureCode,
  IeltsWritingCriterionKey,
  IeltsWritingTaskType,
} from '../domain/types';
import { IELTS_WRITING_CRITERIA } from '../domain/types';
import { checkWritingLength } from '../domain/word-count';
import { computeWritingTaskBand } from '../scoring/aggregate';
import {
  classifyAcademicTask1VisualType,
  classifyGeneralLetterType,
  classifyTask2QuestionType,
  describeAcademicTask1Expectations,
  describeLetterTypeExpectations,
  describeTaskTypeExpectations,
  extractTaskRequirements,
  IELTS_WRITING_TASKS,
  type IeltsAcademicTask1VisualType,
  type IeltsGeneralLetterType,
  type IeltsTask2QuestionType,
  IELTS_WRITING_RUBRIC_VERSION,
  IELTS_TASK_SPECIFICATION_VERSION,
} from '../writing/criteria';
import { containsForbiddenClaim, IELTS_HUMAN_EVIDENCE } from '../governance/states';
import { emitIeltsEvent } from '../governance/events';
import * as ieltsRepo from '../repositories/ielts-repo';

// ============================================
// Types
// ============================================

export interface IeltsWritingAssessmentInput {
  userId: string;
  taskType: IeltsWritingTaskType;
  taskPrompt: string;
  essay: string;
  attemptId?: string | null;
}

export interface IeltsVerifiedQuote {
  quote: string;
  explanation: string;
  /** Quote was found verbatim in the submitted text. */
  verified: boolean;
}

export interface IeltsCriterionResult {
  band: number;
  evidence: IeltsVerifiedQuote[];
  strengths: string[];
  weaknesses: string[];
  rationale: string;
  /** Model self-reported confidence 0–1 (evidence, not a validity claim). */
  modelConfidence: number;
}

export interface IeltsTaskCoverageResult {
  requirementId: string;
  label: string;
  status: 'ADDRESSED' | 'PARTIALLY_ADDRESSED' | 'NOT_ADDRESSED';
  evidence: IeltsVerifiedQuote[];
}

export interface IeltsWritingAssessmentResult {
  taskType: IeltsWritingTaskType;
  assessmentSource: 'AI_ESTIMATE';
  calibrationStatus: 'NOT_CALIBRATED';
  /** Server-computed from the four criterion bands (never the model's number). */
  taskBand: number;
  criteria: Record<IeltsWritingCriterionKey, IeltsCriterionResult>;
  taskCoverage: IeltsTaskCoverageResult[];
  unreportedRequirementIds: string[];
  templateSuspicion: { suspected: boolean; rationale: string };
  positionPresent: boolean | null;
  uncertainty: string[];
  limitations: string[];
  confidence: IeltsAssessmentConfidence;
  wordCount: number;
  belowMinimum: boolean;
  promptVersion: string;
  /** Writing rubric version stamped by the platform (audit requirement). */
  rubricVersion: string;
  /** Task-specification version (deterministic task-type analysis). */
  taskSpecificationVersion: string;
  promptHash: string;
  provider: string | null;
  durationMs: number;
  /** Deterministic task-type classification used to align Task Response marking. */
  taskTypeAnalysis: IeltsTaskTypeAnalysis;
}

/** Deterministic task-type analysis injected into the AI prompt (2026-10-03 II). */
export interface IeltsTaskTypeAnalysis {
  taskQuestionType: IeltsTask2QuestionType | null;
  letterType: IeltsGeneralLetterType | null;
  visualType: IeltsAcademicTask1VisualType | null;
  obligations: string[];
  note: string;
  /** Task-specification version stamped with the analysis (audit requirement). */
  specVersion: string;
}

/** Build the deterministic task-type analysis for a writing task prompt. */
export function buildTaskTypeAnalysis(
  taskType: IeltsWritingTaskType,
  prompt: string,
): IeltsTaskTypeAnalysis {
  if (taskType === 'academic_task2' || taskType === 'general_task2') {
    const taskQuestionType = classifyTask2QuestionType(prompt);
    const obligations = describeTaskTypeExpectations(taskQuestionType);
    return {
      taskQuestionType,
      letterType: null,
      visualType: null,
      obligations,
      specVersion: IELTS_TASK_SPECIFICATION_VERSION,
      note: [
        `Question type: ${taskQuestionType}`,
        'Marker obligations for THIS type (check each against the response):',
        ...obligations.map((o) => `- ${o}`),
      ].join('\n'),
    };
  }
  if (taskType === 'general_task1') {
    const letterType = classifyGeneralLetterType(prompt);
    const obligations = describeLetterTypeExpectations(letterType);
    return {
      taskQuestionType: null,
      letterType,
      visualType: null,
      obligations,
      specVersion: IELTS_TASK_SPECIFICATION_VERSION,
      note: [
        `Letter type: ${letterType}`,
        'Marker obligations for THIS letter type:',
        ...obligations.map((o) => `- ${o}`),
      ].join('\n'),
    };
  }
  const visualType = classifyAcademicTask1VisualType(prompt);
  const obligations = describeAcademicTask1Expectations(visualType);
  return {
    taskQuestionType: null,
    letterType: null,
    visualType,
    obligations,
    specVersion: IELTS_TASK_SPECIFICATION_VERSION,
    note: [
      `Visual type: ${visualType}`,
      'Marker obligations for THIS visual type:',
      ...obligations.map((o) => `- ${o}`),
    ].join('\n'),
  };
}

export type IeltsWritingAssessmentOutcome =
  | { ok: true; assessmentId: string | null; result: IeltsWritingAssessmentResult }
  | { ok: false; assessmentId: string | null; failureCode: IeltsFailureCode; message: string };

export interface IeltsWritingAssessmentDeps {
  assess?: (input: Parameters<typeof assessIeltsWritingWithAI>[0]) => Promise<IeltsWritingAiResult>;
  persist?: (data: Parameters<typeof ieltsRepo.createAssessment>[0]) => Promise<{ id: string }>;
}

// ============================================
// Constants
// ============================================

/** Below this word count the response cannot meaningfully be assessed. */
export const IELTS_TASK_NOT_ANSWERED_WORD_THRESHOLD = 10;

const MANDATORY_LIMITATIONS = [
  'AI-assisted feedback: this is a practice estimate, not an official IELTS score and not a certified examiner judgement.',
  'HUMAN_EVIDENCE = INSUFFICIENT: no human-marker calibration exists for this subsystem.',
];

// ============================================
// Main entry
// ============================================

export async function assessIeltsWriting(
  input: IeltsWritingAssessmentInput,
  deps: IeltsWritingAssessmentDeps = {},
): Promise<IeltsWritingAssessmentOutcome> {
  const assess = deps.assess ?? assessIeltsWritingWithAI;
  const persist =
    deps.persist ??
    (async (data: Parameters<typeof ieltsRepo.createAssessment>[0]) => {
      const row = await ieltsRepo.createAssessment(data);
      return { id: row.id };
    });

  const config = IELTS_WRITING_TASKS[input.taskType];
  if (!config) {
    return { ok: false, assessmentId: null, failureCode: 'INVALID_QUESTION', message: `Unknown task type ${input.taskType}` };
  }

  const started = Date.now();
  emitIeltsEvent('ielts.writing.assessment.started', {
    userId: input.userId,
    taskType: input.taskType,
    attemptId: input.attemptId ?? undefined,
  });

  // ---- Deterministic pre-checks -------------------------------------------
  const length = checkWritingLength(input.essay, input.taskType);
  if (length.wordCount < IELTS_TASK_NOT_ANSWERED_WORD_THRESHOLD) {
    return failPersisted(persist, input, {
      failureCode: 'TASK_NOT_ANSWERED',
      message: `The response has ${length.wordCount} words; no assessable response was submitted.`,
      provider: null,
      promptVersion: '',
      promptHash: '',
      durationMs: Date.now() - started,
    });
  }

  const requirements = extractTaskRequirements(input.taskPrompt);

  // ---- Deterministic task-type analysis (2026-10-03 II) ---------------------
  // Classify the task BEFORE calling the AI and merge the implied marker
  // obligations into the requirement checklist so Task Response marking checks
  // the right obligations (e.g. "discuss both views" demands both views).
  const taskTypeAnalysis = buildTaskTypeAnalysis(input.taskType, input.taskPrompt);
  const allRequirements = [
    ...requirements.map((r) => ({ id: r.id, label: r.label })),
    ...taskTypeAnalysis.obligations.map((obligation, index) => ({
      id: `tasktype:${taskTypeAnalysis.taskQuestionType ?? taskTypeAnalysis.letterType ?? taskTypeAnalysis.visualType ?? 'generic'}-${index}`,
      label: `[task-type obligation] ${obligation}`,
    })),
  ];

  // ---- AI call --------------------------------------------------------------
  const aiResult = await assess({
    taskType: input.taskType,
    taskPrompt: input.taskPrompt,
    essay: input.essay,
    requirements: allRequirements,
    wordCount: length.wordCount,
    minWords: config.minWords,
    taskTypeNote: taskTypeAnalysis.note,
  });

  if (!aiResult.ok) {
    return failPersisted(persist, input, {
      failureCode: mapAiFailure(aiResult.failure),
      message: aiResult.error,
      provider: aiResult.provider,
      promptVersion: aiResult.promptVersion,
      promptHash: aiResult.promptHash,
      durationMs: aiResult.durationMs,
    });
  }

  // ---- Semantic validation ---------------------------------------------------
  const data = aiResult.data;
  const criteriaRaw = {
    taskAchievementOrResponse: data.taskAchievementOrResponse,
    coherenceAndCohesion: data.coherenceAndCohesion,
    lexicalResource: data.lexicalResource,
    grammaticalRangeAndAccuracy: data.grammaticalRangeAndAccuracy,
  };

  const limitations = [...MANDATORY_LIMITATIONS];
  if (length.belowMinimum) {
    limitations.push(
      `WORD_LIMIT_EXCEEDED: ${length.wordCount} words is below the ${length.minimum}-word minimum. ${length.officialNote}`,
    );
  }

  const criteria = {} as Record<IeltsWritingCriterionKey, IeltsCriterionResult>;
  for (const key of IELTS_WRITING_CRITERIA) {
    const raw = criteriaRaw[key];
    if (!raw) {
      return failPersisted(persist, input, {
        failureCode: 'AI_MISSING_CRITERION',
        message: `AI response is missing criterion "${key}".`,
        provider: aiResult.provider,
        promptVersion: aiResult.promptVersion,
        promptHash: aiResult.promptHash,
        durationMs: aiResult.durationMs,
      });
    }
    // Evidence-first rule (audit 2026-10-03): a criterion WITHOUT any evidence
    // entry is an evidence-less score — invalid, never persisted as success.
    if (raw.evidence.length === 0) {
      return failPersisted(persist, input, {
        failureCode: 'AI_MISSING_EVIDENCE',
        message: `Criterion "${key}" returned no evidence — an evidence-less band is invalid.`,
        provider: aiResult.provider,
        promptVersion: aiResult.promptVersion,
        promptHash: aiResult.promptHash,
        durationMs: aiResult.durationMs,
      });
    }
    if (!isWholeOrHalfBand(raw.band)) {
      return failPersisted(persist, input, {
        failureCode: 'AI_UNSUPPORTED_BAND',
        message: `Criterion "${key}" returned unsupported band ${raw.band} (whole/half bands only, 1–9).`,
        provider: aiResult.provider,
        promptVersion: aiResult.promptVersion,
        promptHash: aiResult.promptHash,
        durationMs: aiResult.durationMs,
      });
    }

    const evidence = raw.evidence.map((e) => ({
      quote: e.quote,
      explanation: e.explanation,
      verified: isQuoteVerbatim(input.essay, e.quote),
    }));
    const cleanStrengths = sanitizeClaimStrings(raw.strengths, limitations);
    const cleanWeaknesses = sanitizeClaimStrings(raw.weaknesses, limitations);
    const cleanRationale = sanitizeText(raw.rationale, limitations);

    criteria[key] = {
      band: raw.band,
      evidence,
      strengths: cleanStrengths,
      weaknesses: cleanWeaknesses,
      rationale: cleanRationale,
      modelConfidence: raw.confidence,
    };
  }

  // ---- Evidence integrity ----------------------------------------------------
  const allQuotes: IeltsVerifiedQuote[] = [];
  for (const key of IELTS_WRITING_CRITERIA) {
    allQuotes.push(...criteria[key].evidence);
  }
  const coverageQuotes: IeltsVerifiedQuote[] = [];
  const requirementIds = new Set(allRequirements.map((r) => r.id));
  const taskCoverage: IeltsTaskCoverageResult[] = [];
  const unreportedRequirementIds: string[] = [];

  for (const item of data.taskCoverage ?? []) {
    if (!requirementIds.has(item.requirementId)) {
      limitations.push(`Ignored taskCoverage entry with unknown requirementId "${item.requirementId}".`);
      continue;
    }
    const evidence = item.evidence.map((e) => ({
      quote: e.quote,
      explanation: e.explanation,
      verified: isQuoteVerbatim(input.essay, e.quote),
    }));
    coverageQuotes.push(...evidence);
    taskCoverage.push({
      requirementId: item.requirementId,
      label: allRequirements.find((r) => r.id === item.requirementId)?.label ?? item.requirementId,
      status: item.status,
      evidence,
    });
  }
  for (const req of allRequirements) {
    if (!taskCoverage.some((c) => c.requirementId === req.id)) unreportedRequirementIds.push(req.id);
  }

  const totalQuotes = allQuotes.length + coverageQuotes.length;
  const verifiedQuotes = [...allQuotes, ...coverageQuotes].filter((q) => q.verified).length;
  if (totalQuotes >= 4 && verifiedQuotes / totalQuotes < 0.5) {
    return failPersisted(persist, input, {
      failureCode: 'AI_EVIDENCE_MISMATCH',
      message: `Evidence integrity failed: ${verifiedQuotes}/${totalQuotes} quoted spans could be located in the response.`,
      provider: aiResult.provider,
      promptVersion: aiResult.promptVersion,
      promptHash: aiResult.promptHash,
      durationMs: aiResult.durationMs,
    });
  }
  if (verifiedQuotes < totalQuotes) {
    limitations.push(
      `EVIDENCE_QUOTE_NOT_VERIFIED: ${totalQuotes - verifiedQuotes} quoted span(s) could not be located verbatim and were not treated as evidence.`,
    );
  }

  // ---- Server-computed task band ---------------------------------------------
  const taskBand = computeWritingTaskBand({
    taskAchievementOrResponse: criteria.taskAchievementOrResponse.band,
    coherenceAndCohesion: criteria.coherenceAndCohesion.band,
    lexicalResource: criteria.lexicalResource.band,
    grammaticalRangeAndAccuracy: criteria.grammaticalRangeAndAccuracy.band,
  });
  if (taskBand === null) {
    return failPersisted(persist, input, {
      failureCode: 'AI_MISSING_CRITERION',
      message: 'Task band could not be computed from the four criterion bands.',
      provider: aiResult.provider,
      promptVersion: aiResult.promptVersion,
      promptHash: aiResult.promptHash,
      durationMs: aiResult.durationMs,
    });
  }

  // ---- Confidence (capped; see governance doc) --------------------------------
  const avgModelConfidence =
    IELTS_WRITING_CRITERIA.reduce((sum, key) => sum + criteria[key].modelConfidence, 0) / IELTS_WRITING_CRITERIA.length;
  const everyCriterionHasVerifiedEvidence = IELTS_WRITING_CRITERIA.every((key) =>
    criteria[key].evidence.some((e) => e.verified),
  );
  const evidenceCoverageRatio = totalQuotes === 0 ? 0 : verifiedQuotes / totalQuotes;
  const confidence = capConfidenceForUncalibrated(
    deriveConfidence(avgModelConfidence, evidenceCoverageRatio, everyCriterionHasVerifiedEvidence),
  );
  limitations.push(
    'CONFIDENCE_CAPPED: no HIGH confidence is possible while HUMAN_EVIDENCE = INSUFFICIENT (calibration status: NOT_CALIBRATED).',
  );

  const result: IeltsWritingAssessmentResult = {
    taskType: input.taskType,
    assessmentSource: 'AI_ESTIMATE',
    calibrationStatus: 'NOT_CALIBRATED',
    taskBand,
    criteria,
    taskCoverage,
    unreportedRequirementIds,
    templateSuspicion: {
      suspected: data.templateSuspicion?.suspected ?? false,
      rationale: sanitizeText(data.templateSuspicion?.rationale ?? '', limitations),
    },
    positionPresent: data.positionPresent ?? null,
    uncertainty: sanitizeClaimStrings(data.uncertainty ?? [], limitations),
    limitations,
    confidence,
    wordCount: length.wordCount,
    belowMinimum: length.belowMinimum,
    promptVersion: aiResult.promptVersion,
    rubricVersion: IELTS_WRITING_RUBRIC_VERSION,
    taskSpecificationVersion: IELTS_TASK_SPECIFICATION_VERSION,
    promptHash: aiResult.promptHash,
    provider: aiResult.provider,
    durationMs: aiResult.durationMs,
    taskTypeAnalysis,
  };

  // ---- Persist audit row ------------------------------------------------------
  let assessmentId: string | null = null;
  try {
    const persisted = await persist({
      user: { connect: { id: input.userId } },
      ...(input.attemptId ? { attempt: { connect: { id: input.attemptId } } } : {}),
      skill: 'WRITING',
      taskType: input.taskType,
      promptVersion: aiResult.promptVersion,
      rubricVersion: IELTS_WRITING_RUBRIC_VERSION,
      assessmentSource: 'AI_ESTIMATE',
      confidence,
      status: 'COMPLETED',
      estimatedBand: taskBand,
      criteria: JSON.stringify(result.criteria),
      taskCoverage: JSON.stringify(result.taskCoverage),
      taskTypeAnalysis: JSON.stringify(taskTypeAnalysis),
      evidence: JSON.stringify([...allQuotes, ...coverageQuotes]),
      limitations: JSON.stringify(result.limitations),
      provider: aiResult.provider ?? undefined,
      usage: JSON.stringify({ costStatus: 'UNKNOWN' }),
      promptHash: aiResult.promptHash,
      durationMs: aiResult.durationMs,
    });
    assessmentId = persisted.id;
  } catch {
    // Persistence failure must not fabricate success: the caller still gets the
    // result but with assessmentId null (nothing stored).
    limitations.push('ASSESSMENT_NOT_PERSISTED: the audit row could not be stored.');
  }

  emitIeltsEvent('ielts.writing.assessment.completed', {
    userId: input.userId,
    taskType: input.taskType,
    assessmentId: assessmentId ?? undefined,
    promptVersion: aiResult.promptVersion,
    durationMs: aiResult.durationMs,
    provider: aiResult.provider ?? undefined,
  });

  return { ok: true, assessmentId, result };
}

// ============================================
// Helpers
// ============================================

function mapAiFailure(failure: 'AI_PROVIDER_TIMEOUT' | 'AI_PROVIDER_ERROR' | 'AI_INVALID_JSON'): IeltsFailureCode {
  return failure;
}

async function failPersisted(
  persist: (data: Parameters<typeof ieltsRepo.createAssessment>[0]) => Promise<{ id: string }>,
  input: IeltsWritingAssessmentInput,
  failure: {
    failureCode: IeltsFailureCode;
    message: string;
    provider: string | null;
    promptVersion: string;
    promptHash: string;
    durationMs: number;
  },
): Promise<IeltsWritingAssessmentOutcome> {
  emitIeltsEvent('ielts.writing.assessment.failed', {
    userId: input.userId,
    taskType: input.taskType,
    attemptId: input.attemptId ?? undefined,
    code: failure.failureCode,
    durationMs: failure.durationMs,
  });
  let assessmentId: string | null = null;
  try {
    const persisted = await persist({
      user: { connect: { id: input.userId } },
      ...(input.attemptId ? { attempt: { connect: { id: input.attemptId } } } : {}),
      skill: 'WRITING',
      taskType: input.taskType,
      promptVersion: failure.promptVersion || 'UNKNOWN',
      rubricVersion: IELTS_WRITING_RUBRIC_VERSION,
      assessmentSource: 'AI_ESTIMATE',
      confidence: 'NOT_CALIBRATED',
      status: 'FAILED',
      failureCode: failure.failureCode,
      limitations: JSON.stringify([`FAILED: ${failure.failureCode}`]),
      provider: failure.provider ?? undefined,
      usage: JSON.stringify({ costStatus: 'UNKNOWN' }),
      promptHash: failure.promptHash || undefined,
      durationMs: failure.durationMs,
    });
    assessmentId = persisted.id;
  } catch {
    assessmentId = null;
  }
  return { ok: false, assessmentId, failureCode: failure.failureCode, message: failure.message };
}

export function isWholeOrHalfBand(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (value < 1 || value > 9) return false;
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-9;
}

/** Verbatim containment (direct or whitespace-normalized). */
export function isQuoteVerbatim(text: string, quote: string): boolean {
  const q = quote.trim();
  if (q.length < 3) return false;
  if (text.includes(q)) return true;
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  return normalize(text).includes(normalize(q));
}

export function sanitizeText(text: string, limitations: string[]): string {
  if (!text) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => !containsForbiddenClaim(s) && !/examiner/i.test(s) && !/guarantee/i.test(s));
  if (kept.length !== sentences.length) {
    limitations.push('FORBIDDEN_CLAIM_FILTERED: text referring to examiners/guarantees was removed from feedback.');
  }
  return kept.join(' ').trim();
}

function sanitizeClaimStrings(items: string[], limitations: string[]): string[] {
  return items
    .map((s) => sanitizeText(s, limitations))
    .filter((s) => s.trim().length > 0);
}

function deriveConfidence(
  avgModelConfidence: number,
  evidenceCoverageRatio: number,
  everyCriterionHasVerifiedEvidence: boolean,
): IeltsAssessmentConfidence {
  if (avgModelConfidence >= 0.7 && evidenceCoverageRatio >= 0.8 && everyCriterionHasVerifiedEvidence) {
    return 'HIGH';
  }
  if (avgModelConfidence >= 0.4) return 'MEDIUM';
  return 'LOW';
}

/** While human evidence is insufficient, HIGH confidence is unreachable. */
export function capConfidenceForUncalibrated(
  confidence: IeltsAssessmentConfidence,
): IeltsAssessmentConfidence {
  if (IELTS_HUMAN_EVIDENCE === 'INSUFFICIENT' && confidence === 'HIGH') return 'MEDIUM';
  return confidence;
}
