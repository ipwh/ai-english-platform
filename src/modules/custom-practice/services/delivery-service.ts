// ============================================
// Self-Directed Practice — delivery gating (2026-10-10, Sprint 140)
// ============================================
// SINGLE OWNER of the question "what may this student see, and when?".
// Answer keys, accepted variants, rubrics, explanations and misconception tags
// are server-only until the attempt has been submitted; after submission the
// reference answer and explanation come from the RESPONSE rows (a graded record),
// never from the question row.
//
// Regression guard: `toDeliveredSet` builds a NEW object with an explicit field
// list, so a future column added to the question model cannot leak by default.
// ============================================

import type {
  DeliveredQuestion,
  DeliveredResponse,
  DeliveredResults,
  DeliveredSet,
  PracticeVerdict,
} from '../domain/types';

export interface QuestionRowForDelivery {
  id: string;
  orderIndex: number;
  questionType: string;
  instructions: string;
  prompt: string;
  targetRule: string;
  maxMarks: number;
}

export interface SetRowForDelivery {
  id: string;
  objective: string;
  category: string;
  difficulty: string;
  interpretation: string | null;
  createdAt: Date;
  questions: QuestionRowForDelivery[];
}

export function toDeliveredSet(set: SetRowForDelivery, submitted: boolean): DeliveredSet {
  return {
    id: set.id,
    objective: set.objective,
    category: set.category,
    difficulty: set.difficulty,
    interpretation: set.interpretation,
    createdAt: set.createdAt.toISOString(),
    questionCount: set.questions.length,
    submitted,
    questions: set.questions.map((question): DeliveredQuestion => ({
      id: question.id,
      orderIndex: question.orderIndex,
      questionType: question.questionType,
      instructions: question.instructions,
      prompt: question.prompt,
      targetRule: question.targetRule,
      maxMarks: question.maxMarks,
    })),
  };
}

export interface SubmissionRowForDelivery {
  setId: string;
  submittedAt: Date;
  gradedAt: Date | null;
  awardedMarks: number | null;
  totalMarks: number | null;
  needsReviewCount: number;
  overallFeedback: string | null;
  responses: Array<{
    questionId: string;
    verdict: string;
    awardedMarks: number;
    rationale: string;
    referenceAnswer: string;
    acceptedAlternatives: string;
    improvement: string | null;
    needsReview: boolean;
    question: {
      orderIndex: number;
      maxMarks: number;
      explanationEn: string;
      explanationZh: string | null;
      misconceptionTags: string;
      targetRule: string;
    };
  }>;
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function isVerdict(value: string): value is PracticeVerdict {
  return ['correct', 'partially_correct', 'incorrect', 'needs_review'].includes(value);
}

export function toDeliveredResults(submission: SubmissionRowForDelivery): DeliveredResults {
  const responses = submission.responses
    .slice()
    .sort((a, b) => a.question.orderIndex - b.question.orderIndex)
    .map((response): DeliveredResponse => ({
      questionId: response.questionId,
      orderIndex: response.question.orderIndex,
      verdict: isVerdict(response.verdict) ? response.verdict : 'needs_review',
      awardedMarks: response.awardedMarks,
      maxMarks: response.question.maxMarks,
      rationale: response.rationale,
      referenceAnswer: response.referenceAnswer,
      acceptedAlternatives: parseStringArray(response.acceptedAlternatives),
      improvement: response.improvement,
      explanationEn: response.question.explanationEn,
      explanationZh: response.question.explanationZh,
      misconceptionTags: parseStringArray(response.question.misconceptionTags),
      targetRule: response.question.targetRule,
      needsReview: response.needsReview,
    }));

  const awardedMarks = submission.awardedMarks ?? responses.reduce((sum, r) => sum + r.awardedMarks, 0);
  const totalMarks = submission.totalMarks ?? responses.reduce((sum, r) => sum + r.maxMarks, 0);

  return {
    setId: submission.setId,
    submittedAt: submission.submittedAt.toISOString(),
    gradedAt: submission.gradedAt ? submission.gradedAt.toISOString() : null,
    awardedMarks,
    totalMarks,
    needsReviewCount: submission.needsReviewCount,
    overallFeedback: submission.overallFeedback,
    gradingDegraded: submission.needsReviewCount > 0,
    responses,
  };
}
