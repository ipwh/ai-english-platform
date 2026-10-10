// ============================================
// Self-Directed Practice — submission orchestration (2026-10-10, Sprint 140)
// ============================================
// Phase 2 steps 6–9: submit → grade → persist → deliver results.
// Split of responsibilities: the AI call happens BEFORE the database transaction
// (never inside it), the transaction only writes the graded record, and the
// one-submission-per-set rule is enforced by a unique index on `setId`.
//
// Authorization: every read is owner-scoped (`getOwnedSet` / `getSubmission...`
// take the caller's user id), so another student's attempt is indistinguishable
// from a non-existent one (404, never 403).
// ============================================

import { isUniqueViolation } from '@/shared/db/prisma-errors';
import { CustomPracticeError, isObjectiveQuestionType } from '../domain/types';
import type { DeliveredResults, GradedItem, PracticeSpec } from '../domain/types';
import {
  createSubmissionWithResponses,
  getOwnedSet,
  getSubmissionWithResponses,
} from '../repositories/custom-practice-repo';
import { toDeliveredResults } from './delivery-service';
import { buildOverallFeedback, gradeCustomPracticeAnswers, type OpenEndedQuestionInput } from './grading-service';

function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function parseRejected(raw: string): Array<{ answer: string; why: string }> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is { answer: string; why: string } => {
        if (typeof value !== 'object' || value === null) return false;
        const candidate = value as { answer?: unknown; why?: unknown };
        return typeof candidate.answer === 'string' && typeof candidate.why === 'string';
      })
      .map(value => ({ answer: value.answer, why: value.why }));
  } catch {
    return [];
  }
}

export async function submitCustomPracticeSet(input: {
  setId: string;
  ownerUserId: string;
  answers: Record<string, string>;
}): Promise<DeliveredResults> {
  const { setId, ownerUserId, answers } = input;

  const set = await getOwnedSet(setId, ownerUserId);
  if (!set) {
    throw new CustomPracticeError('NOT_FOUND', 'Practice set not found.');
  }
  if (set.submission) {
    // Fast path; the unique index on setId still decides the real race.
    throw new CustomPracticeError('ALREADY_SUBMITTED', 'This practice set has already been submitted.');
  }

  const questionIds = new Set(set.questions.map(question => question.id));
  const unknownIds = Object.keys(answers).filter(id => !questionIds.has(id));
  if (unknownIds.length > 0) {
    throw new CustomPracticeError('INVALID_REQUEST', 'answers contains unknown question ids', { unknownIds });
  }

  const objective = [];
  const openEnded: OpenEndedQuestionInput[] = [];

  for (const question of set.questions) {
    const answerText = (answers[question.id] ?? '').toString().slice(0, 2000);

    if (isObjectiveQuestionType(question.questionType)) {
      objective.push({
        questionId: question.id,
        answerText,
        answerKey: question.answerKey,
        acceptedAnswers: parseStringArray(question.acceptedAnswers),
        maxMarks: question.maxMarks,
        targetRule: question.targetRule,
      });
      continue;
    }

    openEnded.push({
      questionId: question.id,
      questionType: question.questionType,
      instructions: question.instructions,
      prompt: question.prompt,
      targetRule: question.targetRule,
      rubric: question.rubric,
      maxMarks: question.maxMarks,
      answerKey: question.answerKey,
      acceptedAnswers: parseStringArray(question.acceptedAnswers),
      rejectedAnswers: parseRejected(question.rejectedAnswers),
      explanationEn: question.explanationEn,
      answerText,
    });
  }

  const answered = objective.filter(item => item.answerText.trim().length > 0).length +
    openEnded.filter(item => item.answerText.trim().length > 0).length;
  if (answered === 0) {
    throw new CustomPracticeError('NO_ANSWERS', 'At least one answer is required before submitting.');
  }

  const spec: Pick<PracticeSpec, 'category' | 'difficulty'> = {
    category: set.category as PracticeSpec['category'],
    difficulty: set.difficulty as PracticeSpec['difficulty'],
  };

  const graded = await gradeCustomPracticeAnswers({ spec, questions: openEnded, objective });

  const byId = new Map<string, GradedItem>(graded.items.map(item => [item.questionId, item]));
  const ordered = set.questions.map(question => {
    const item = byId.get(question.id);
    if (!item) {
      // Should be unreachable: every question is either objective or open-ended.
      throw new CustomPracticeError('GENERATION_FAILED', 'Internal grading mismatch for a question.');
    }
    return item;
  });

  const decided = ordered.filter(item => !item.needsReview);
  const awardedMarks = decided.reduce((sum, item) => sum + item.awardedMarks, 0);
  const totalMarks = ordered.reduce((sum, item) => sum + item.maxMarks, 0);
  const needsReviewCount = ordered.filter(item => item.needsReview).length;
  const overallFeedback = buildOverallFeedback(ordered);

  try {
    await createSubmissionWithResponses({
      setId,
      ownerUserId,
      awardedMarks,
      totalMarks,
      needsReviewCount,
      overallFeedback: overallFeedback.en,
      overallFeedbackZh: overallFeedback.zh,
      gradingModel: null,
      gradingPromptVersion: graded.promptVersion ?? 'unavailable',
      responses: set.questions.map(question => {
        const item = byId.get(question.id) as GradedItem;
        return {
          questionId: question.id,
          answerText: (answers[question.id] ?? '').toString().slice(0, 2000),
          verdict: item.verdict,
          awardedMarks: item.awardedMarks,
          rationale: item.rationale,
          rationaleZh: item.rationaleZh,
          referenceAnswer: question.answerKey,
          acceptedAlternatives: parseStringArray(question.acceptedAnswers),
          improvement: item.improvement,
          improvementZh: item.improvementZh,
          needsReview: item.needsReview,
        };
      }),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CustomPracticeError('ALREADY_SUBMITTED', 'This practice set has already been submitted.');
    }
    throw error;
  }

  const submission = await getSubmissionWithResponses(setId, ownerUserId);
  if (!submission) {
    throw new CustomPracticeError('NOT_FOUND', 'Submission was not found after grading.');
  }

  return toDeliveredResults(submission);
}
