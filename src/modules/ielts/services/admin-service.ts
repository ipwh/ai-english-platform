// ============================================
// IELTS Admin / Content-Authoring Service
// ============================================
// Server-side content pipeline (section 41 of the phase spec):
//   create draft → validate → (AI_VALIDATED) → QA_REQUIRED → HUMAN_APPROVED
//   → PUBLISHED (or REJECTED)
//
// AI NEVER publishes. Automation may only validate/default to QA_REQUIRED.
// Human approval requires a reviewer id and is recorded with timestamps.
// ============================================

import type {
  IeltsAnswerKey,
  IeltsContentSource,
  IeltsDifficulty,
  IeltsItemEvidence,
  IeltsOption,
  IeltsQuestionType,
  IeltsValidationStatus,
  IeltsWordLimit,
} from '../domain/types';
import {
  emptyBatchContext,
  validateIeltsQuestion,
  type IeltsValidationReport,
} from '../validation/question-validator';
import { applyTransition } from '../validation/pipeline';
import { emitIeltsEvent } from '../governance/events';
import * as ieltsRepo from '../repositories/ielts-repo';
import { parseJson, rowToQuestionDefinition } from './row-mappers';

export interface IeltsQuestionDraftInput {
  testId: string;
  sectionId?: string | null;
  orderIndex?: number;
  questionType: IeltsQuestionType;
  skill: 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';
  prompt: string;
  options?: IeltsOption[] | string[];
  answerKey?: IeltsAnswerKey;
  acceptedAnswers?: string[];
  wordLimit?: IeltsWordLimit;
  evidence?: IeltsItemEvidence;
  explanation?: string;
  difficulty?: IeltsDifficulty;
  difficultyModel?: string;
  contentSource?: IeltsContentSource;
  generatorVersion?: string;
}

export type IeltsAdminResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

// ============================================
// Draft creation
// ============================================

export async function createIeltsQuestionDraft(
  input: IeltsQuestionDraftInput,
): Promise<IeltsAdminResult<{ id: string; validationStatus: string }>> {
  const test = await ieltsRepo.getTestById(input.testId);
  if (!test) return { ok: false, status: 404, error: 'Test not found' };

  const created = await ieltsRepo.createQuestion({
    test: { connect: { id: input.testId } },
    ...(input.sectionId ? { section: { connect: { id: input.sectionId } } } : {}),
    orderIndex: input.orderIndex ?? 0,
    questionType: input.questionType,
    skill: input.skill,
    prompt: input.prompt,
    options: input.options ? JSON.stringify(input.options) : null,
    answerKey: input.answerKey !== undefined ? JSON.stringify(input.answerKey) : null,
    acceptedAnswers: input.acceptedAnswers ? JSON.stringify(input.acceptedAnswers) : null,
    wordLimit: input.wordLimit ? JSON.stringify(input.wordLimit) : null,
    evidence: input.evidence ? JSON.stringify(input.evidence) : null,
    explanation: input.explanation ?? null,
    difficulty: input.difficulty ?? 'MEDIUM',
    difficultyModel: input.difficultyModel ?? 'ielts-platform-difficulty-v1',
    contentSource: JSON.stringify(input.contentSource ?? { type: 'ORIGINAL_GENERATED' }),
    generatorVersion: input.generatorVersion ?? null,
    validationStatus: 'DRAFT',
  });

  return { ok: true, data: { id: created.id, validationStatus: created.validationStatus } };
}

// ============================================
// Validation pipeline
// ============================================

export interface IeltsValidationOutcome {
  questionId: string;
  report: IeltsValidationReport;
  previousStatus: string;
  status: string;
}

/**
 * Run the machine validation screen. On success the item advances
 * DRAFT → AI_VALIDATED → QA_REQUIRED (system automation only ever reaches
 * QA_REQUIRED). On failure the status is left unchanged and the report is
 * stored for the author — rejection is an explicit action, not an accident.
 */
export async function validateIeltsQuestionById(
  questionId: string,
): Promise<IeltsAdminResult<IeltsValidationOutcome>> {
  const row = await ieltsRepo.getQuestionById(questionId);
  if (!row) return { ok: false, status: 404, error: 'Question not found' };

  const section = row.sectionId ? await ieltsRepo.getSectionById(row.sectionId) : null;
  const report = validateIeltsQuestion(
    rowToQuestionDefinition(row),
    { passageText: section?.passageText ?? null, transcriptText: section?.transcriptText ?? null },
    emptyBatchContext(),
  );

  let status = row.validationStatus;
  if (report.ok) {
    if (status === 'DRAFT') {
      const step1 = applyTransition({ from: 'DRAFT', to: 'AI_VALIDATED', actor: 'SYSTEM' });
      if (step1.allowed) {
        const step2 = applyTransition({ from: 'AI_VALIDATED', to: 'QA_REQUIRED', actor: 'SYSTEM' });
        if (step2.allowed) status = 'QA_REQUIRED';
        else status = 'AI_VALIDATED';
      }
    } else if (status === 'AI_VALIDATED') {
      const step2 = applyTransition({ from: 'AI_VALIDATED', to: 'QA_REQUIRED', actor: 'SYSTEM' });
      if (step2.allowed) status = 'QA_REQUIRED';
    }
  }

  await ieltsRepo.updateQuestionStatus(questionId, {
    validationStatus: status,
    validationNotes: JSON.stringify({
      validatedAt: new Date().toISOString(),
      ok: report.ok,
      issues: report.issues,
    }),
  });

  if (!report.ok) {
    emitIeltsEvent('ielts.question.invalid', {
      questionId,
      code: 'VALIDATOR_REJECTED',
      reason: report.issues.filter((i) => i.severity === 'reject').map((i) => i.code).join(','),
    });
  }

  return {
    ok: true,
    data: { questionId, report, previousStatus: row.validationStatus, status },
  };
}

// ============================================
// Human transitions
// ============================================

export interface IeltsTransitionOutcome {
  questionId: string;
  status: IeltsValidationStatus;
}

export async function transitionIeltsQuestionStatus(input: {
  questionId: string;
  to: IeltsValidationStatus;
  reviewerId: string;
  reason?: string;
}): Promise<IeltsAdminResult<IeltsTransitionOutcome>> {
  const row = await ieltsRepo.getQuestionById(input.questionId);
  if (!row) return { ok: false, status: 404, error: 'Question not found' };

  const notes = JSON.parse(row.validationNotes || '{}') as Record<string, unknown>;
  const validatorOk = notes.ok === undefined ? undefined : Boolean(notes.ok);

  const transition = applyTransition({
    from: row.validationStatus as IeltsValidationStatus,
    to: input.to,
    actor: 'HUMAN',
    reviewerId: input.reviewerId,
    validatorOk,
    reason: input.reason,
  });
  if (!transition.allowed) {
    return { ok: false, status: 409, error: transition.error ?? 'Transition not allowed' };
  }

  const requiresReviewStamp = input.to === 'HUMAN_APPROVED' || input.to === 'PUBLISHED';
  await ieltsRepo.updateQuestionStatus(input.questionId, {
    validationStatus: input.to,
    validationNotes: JSON.stringify({
      ...notes,
      lastTransition: {
        to: input.to,
        by: input.reviewerId,
        at: new Date().toISOString(),
        reason: input.reason ?? null,
      },
    }),
    ...(requiresReviewStamp ? { reviewedBy: input.reviewerId, reviewedAt: new Date() } : {}),
  });

  return { ok: true, data: { questionId: input.questionId, status: input.to } };
}

/** Forward chain of TEST states (2026-10-03 XII). */
const TEST_STATUS_CHAIN: readonly IeltsValidationStatus[] = [
  'DRAFT',
  'AI_VALIDATED',
  'QA_REQUIRED',
  'HUMAN_APPROVED',
  'PUBLISHED',
];

export async function transitionIeltsTestStatus(input: {
  testId: string;
  to: IeltsValidationStatus;
  reviewerId: string;
}): Promise<IeltsAdminResult<{ testId: string; status: IeltsValidationStatus }>> {
  const test = await ieltsRepo.getTestById(input.testId);
  if (!test) return { ok: false, status: 404, error: 'Test not found' };

  // 2026-10-03 (XII) — publish fix. The console publishes with ONE human
  // action, but the state machine only allows single steps. When the target is
  // further along the forward chain than the current state, each intermediate
  // step is validated (actor HUMAN, same reviewer) and the walk is applied as
  // one action. Nothing is bypassed: every step still goes through
  // applyTransition, and the final PUBLISHED gates below are unchanged.
  // (Production bug: publishing from DRAFT returned ILLEGAL_TRANSITION, so no
  // test — objective or writing — could ever reach the catalogue.)
  const forwardIdx = TEST_STATUS_CHAIN.indexOf(input.to as (typeof TEST_STATUS_CHAIN)[number]);
  const currentIdx = TEST_STATUS_CHAIN.indexOf(test.status as (typeof TEST_STATUS_CHAIN)[number]);
  if (forwardIdx > -1 && currentIdx > -1 && forwardIdx > currentIdx) {
    let walkedStatus = test.status as IeltsValidationStatus;
    for (let i = currentIdx + 1; i <= forwardIdx; i++) {
      const step = applyTransition({
        from: walkedStatus,
        to: TEST_STATUS_CHAIN[i],
        actor: 'HUMAN',
        reviewerId: input.reviewerId,
      });
      if (!step.allowed) {
        return { ok: false, status: 409, error: step.error ?? 'Transition not allowed' };
      }
      walkedStatus = TEST_STATUS_CHAIN[i];
    }
  } else {
    const transition = applyTransition({
      from: test.status as IeltsValidationStatus,
      to: input.to,
      actor: 'HUMAN',
      reviewerId: input.reviewerId,
    });
    if (!transition.allowed) {
      return { ok: false, status: 409, error: transition.error ?? 'Transition not allowed' };
    }
  }

  if (input.to === 'PUBLISHED') {
    const questions = await ieltsRepo.listQuestionsForAdmin({ testId: input.testId });
    const unpublished = questions.filter((q) => q.validationStatus !== 'PUBLISHED');
    if (unpublished.length > 0) {
      return {
        ok: false,
        status: 409,
        error: `TEST_NOT_READY: ${unpublished.length} question(s) are not PUBLISHED; a test cannot be published with unpublished items.`,
      };
    }
    if (questions.length === 0) {
      return { ok: false, status: 409, error: 'TEST_EMPTY: a test cannot be published without questions.' };
    }
    // Graduation (2026-10-03 VII): publishing an INSTANT self-study set moves it
    // into the catalogue — the human review path is what makes it public.
    if (test.origin === 'INSTANT') {
      await ieltsRepo.updateTestStatus(input.testId, input.to, { origin: 'CATALOGUE' });
      return { ok: true, data: { testId: input.testId, status: input.to } };
    }
  }

  await ieltsRepo.updateTestStatus(input.testId, input.to);
  return { ok: true, data: { testId: input.testId, status: input.to } };
}

// ============================================
// Queries
// ============================================

export interface IeltsAdminQuestionListItem {
  id: string;
  testId: string;
  questionType: string;
  skill: string;
  prompt: string;
  validationStatus: string;
  difficulty: string;
  createdAt: Date;
  reviewedBy: string | null;
  /** Reviewer context: the canonical key + explanation (admin surface only). */
  correctAnswer: unknown;
  explanation: string | null;
}

export async function listAdminQuestions(filter: {
  status?: string;
  skill?: string;
  testId?: string;
}): Promise<IeltsAdminQuestionListItem[]> {
  const rows = await ieltsRepo.listQuestionsForAdmin(filter);
  return rows.map((r) => ({
    id: r.id,
    testId: r.testId,
    questionType: r.questionType,
    skill: r.skill,
    prompt: r.prompt,
    validationStatus: r.validationStatus,
    difficulty: r.difficulty,
    createdAt: r.createdAt,
    reviewedBy: r.reviewedBy,
    correctAnswer: parseJson<unknown>(r.answerKey, null),
    explanation: r.explanation,
  }));
}

// ============================================
// Test console (admin/teacher UI support)
// ============================================

export interface IeltsAdminTestSummary {
  id: string;
  slug: string;
  title: string;
  testType: string;
  skill: string;
  status: string;
  /** 'CATALOGUE' | 'INSTANT' — instant self-study sets appear in the QA queue. */
  origin: string;
  createdAt: Date;
  questionCount: number;
  statusCounts: Record<string, number>;
}

export async function listAdminIeltsTests(): Promise<IeltsAdminTestSummary[]> {
  const rows = await ieltsRepo.listTestsForAdmin();
  return rows.map((r) => {
    const statusCounts: Record<string, number> = {};
    for (const q of r.questions) {
      statusCounts[q.validationStatus] = (statusCounts[q.validationStatus] ?? 0) + 1;
    }
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      testType: r.testType,
      skill: r.skill,
      status: r.status,
      origin: r.origin,
      createdAt: r.createdAt,
      questionCount: r.questions.length,
      statusCounts,
    };
  });
}
