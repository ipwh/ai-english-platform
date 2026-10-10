// ============================================
// Custom Practice — grading evaluation runner (Sprint 143)
// ============================================
// Scores the versioned fixture dataset against the ACTUAL production grading path
// (`gradeCustomPracticeAnswers`), not a test-only reimplementation.
//
// Denominators are explicit and split by grading path:
//   · DETERMINISTIC fixtures  — the production path decides without any AI call
//     (objective items, and blank open-ended answers, which are deliberately left
//     unmarked). These are the ONLY fixtures CI may score.
//   · PROVIDER-DEPENDENT fixtures — open-ended answers that require the AI marker.
//     They are NEVER scored here (no provider, no credentials, no flakiness): they
//     are counted and reported as skipped so the denominator cannot be inflated.
//
// Human review: every fixture currently carries `reviewStatus: unreviewed`, so the
// report's `reviewedCoverage` is 0 and agreement figures are PROVISIONAL. A green
// run proves the contract is stable; it does NOT prove grading validity.
// ============================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PracticeCategory, PracticeDifficulty, PracticeVerdict } from '../domain/types';
import { gradeCustomPracticeAnswers } from '../services/grading-service';

export const GRADING_BASELINE_VERSION = 'custom-practice-grading-baseline-v1';

export interface BaselineQuestion {
  instructions: string;
  prompt: string;
  answerKey: string;
  acceptedAnswers: string[];
  rubric: { marks: number; criteria: string[] };
  targetRule: string;
  maxMarks: number;
}

export interface BaselineCase {
  id: string;
  category: PracticeCategory;
  errorCategory: string;
  questionType: string;
  question: BaselineQuestion;
  studentResponse: string;
  expected: { verdict: PracticeVerdict; scoreRange: [number, number]; needsReview: boolean };
  deterministic: boolean;
  provenance: string;
  rationale: string;
}

export interface BaselineDataset {
  datasetVersion: string;
  createdAt: string;
  gradingPromptVersion: string;
  reviewStatusSummary: { reviewed: number; unreviewed: number; reviewedBy: string | null; reviewedAt: string | null; note?: string | null };
  cases: BaselineCase[];
}

export interface CaseResult {
  id: string;
  questionType: string;
  errorCategory: string;
  expectedVerdict: PracticeVerdict;
  actualVerdict: PracticeVerdict;
  expectedRange: [number, number];
  awardedMarks: number;
  expectedNeedsReview: boolean;
  actualNeedsReview: boolean;
  /** True when the verdict and the review flag both match and the marks are in range. */
  passed: boolean;
  /** Credit awarded where the expectation was a negative outcome (over-crediting). */
  falseAccept: boolean;
  /** A positive expectation was marked negative. */
  falseReject: boolean;
  scoreRangeViolation: boolean;
}

export interface EvaluationReport {
  datasetVersion: string;
  gradingPromptVersion: string;
  fixtureCount: number;
  reviewedCount: number;
  unreviewedCount: number;
  /** reviewed / total — 0 today, which is why no validity claim is made. */
  reviewedCoverage: number;
  deterministic: {
    denominator: number;
    passed: number;
    agreement: number;
    falseAccept: number;
    falseReject: number;
    scoreRangeViolations: number;
    needsReviewCount: number;
    needsReviewRate: number;
    byQuestionType: Record<string, { denominator: number; passed: number; agreement: number }>;
  };
  providerDependent: {
    denominator: number;
    skipped: number;
    reason: string;
    byQuestionType: Record<string, number>;
  };
  byErrorCategory: Record<string, { denominator: number; passed: number; agreement: number }>;
  results: CaseResult[];
}

const OBJECTIVE_TYPES = new Set(['mc', 'fill_blank']);

export function loadGradingBaseline(path?: string): BaselineDataset {
  const file = path ?? join(import.meta.dirname ?? __dirname, 'fixtures', 'grading-baseline-v1.json');
  return JSON.parse(readFileSync(file, 'utf8')) as BaselineDataset;
}

function isNegative(verdict: PracticeVerdict): boolean {
  return verdict === 'incorrect' || verdict === 'needs_review';
}

/**
 * Evaluates the deterministic fixtures through the production grading path.
 * `gradeCustomPracticeAnswers` is called even for a single item so the code under
 * evaluation is exactly the code students hit.
 */
export async function runGradingEvaluation(dataset: BaselineDataset): Promise<EvaluationReport> {
  const deterministicCases = dataset.cases.filter(item => item.deterministic);
  const providerCases = dataset.cases.filter(item => !item.deterministic);

  const results: CaseResult[] = [];

  for (const item of deterministicCases) {
    const isObjective = OBJECTIVE_TYPES.has(item.questionType);

    const graded = await gradeCustomPracticeAnswers({
      spec: { category: item.category, difficulty: 'intermediate' as PracticeDifficulty },
      objective: isObjective
        ? [
            {
              questionId: item.id,
              answerText: item.studentResponse,
              answerKey: item.question.answerKey,
              acceptedAnswers: item.question.acceptedAnswers,
              maxMarks: item.question.maxMarks,
            },
          ]
        : [],
      questions: isObjective
        ? []
        : [
            {
              questionId: item.id,
              questionType: item.questionType,
              instructions: item.question.instructions,
              prompt: item.question.prompt,
              targetRule: item.question.targetRule,
              rubric: JSON.stringify(item.question.rubric),
              maxMarks: item.question.maxMarks,
              answerKey: item.question.answerKey,
              acceptedAnswers: item.question.acceptedAnswers,
              rejectedAnswers: [],
              explanationEn: '',
              // A blank answer is the only open-ended case this runner may score
              // without a provider — it never reaches the model.
              answerText: item.studentResponse,
            },
          ],
    });

    const gradedItem = graded.items.find(entry => entry.questionId === item.id);
    if (!gradedItem) throw new Error(`grading produced no result for fixture ${item.id}`);

    const [min, max] = item.expected.scoreRange;
    const inRange = gradedItem.awardedMarks >= min && gradedItem.awardedMarks <= max;
    const verdictMatches = gradedItem.verdict === item.expected.verdict;
    const reviewMatches = gradedItem.needsReview === item.expected.needsReview;
    const passed = verdictMatches && reviewMatches && inRange;

    results.push({
      id: item.id,
      questionType: item.questionType,
      errorCategory: item.errorCategory,
      expectedVerdict: item.expected.verdict,
      actualVerdict: gradedItem.verdict,
      expectedRange: item.expected.scoreRange,
      awardedMarks: gradedItem.awardedMarks,
      expectedNeedsReview: item.expected.needsReview,
      actualNeedsReview: gradedItem.needsReview,
      passed,
      falseAccept: isNegative(item.expected.verdict) && !isNegative(gradedItem.verdict),
      falseReject: !isNegative(item.expected.verdict) && isNegative(gradedItem.verdict),
      scoreRangeViolation: !inRange,
    });
  }

  const passed = results.filter(result => result.passed).length;
  const byQuestionType: EvaluationReport['deterministic']['byQuestionType'] = {};
  for (const result of results) {
    const bucket = (byQuestionType[result.questionType] ??= { denominator: 0, passed: 0, agreement: 0 });
    bucket.denominator += 1;
    if (result.passed) bucket.passed += 1;
  }
  for (const bucket of Object.values(byQuestionType)) {
    bucket.agreement = bucket.denominator === 0 ? 0 : bucket.passed / bucket.denominator;
  }

  const byErrorCategory: EvaluationReport['byErrorCategory'] = {};
  for (const result of results) {
    const bucket = (byErrorCategory[result.errorCategory] ??= { denominator: 0, passed: 0, agreement: 0 });
    bucket.denominator += 1;
    if (result.passed) bucket.passed += 1;
  }
  for (const bucket of Object.values(byErrorCategory)) {
    bucket.agreement = bucket.denominator === 0 ? 0 : bucket.passed / bucket.denominator;
  }

  const providerByType: Record<string, number> = {};
  for (const item of providerCases) {
    providerByType[item.questionType] = (providerByType[item.questionType] ?? 0) + 1;
  }

  const needsReviewCount = results.filter(result => result.actualNeedsReview).length;

  return {
    datasetVersion: dataset.datasetVersion,
    gradingPromptVersion: dataset.gradingPromptVersion,
    fixtureCount: dataset.cases.length,
    reviewedCount: dataset.reviewStatusSummary.reviewed,
    unreviewedCount: dataset.reviewStatusSummary.unreviewed,
    reviewedCoverage:
      dataset.cases.length === 0 ? 0 : dataset.reviewStatusSummary.reviewed / dataset.cases.length,
    deterministic: {
      denominator: results.length,
      passed,
      agreement: results.length === 0 ? 0 : passed / results.length,
      falseAccept: results.filter(result => result.falseAccept).length,
      falseReject: results.filter(result => result.falseReject).length,
      scoreRangeViolations: results.filter(result => result.scoreRangeViolation).length,
      needsReviewCount,
      needsReviewRate: results.length === 0 ? 0 : needsReviewCount / results.length,
      byQuestionType,
    },
    providerDependent: {
      denominator: providerCases.length,
      skipped: providerCases.length,
      reason:
        'Open-ended answers need the AI marker. This runner never calls a provider (no credentials, no flakiness); these fixtures are counted, not scored.',
      byQuestionType: providerByType,
    },
    byErrorCategory,
    results,
  };
}

export function formatEvaluationReport(report: EvaluationReport): string {
  const lines = [
    `Grading evaluation — dataset ${report.datasetVersion} (grading prompt ${report.gradingPromptVersion})`,
    `fixtures: ${report.fixtureCount} · human-reviewed: ${report.reviewedCount} · unreviewed: ${report.unreviewedCount} (reviewed coverage ${(report.reviewedCoverage * 100).toFixed(0)}%)`,
    '',
    `DETERMINISTIC path (denominator = ${report.deterministic.denominator} fixtures scored without any AI call)`,
    `  agreement           : ${report.deterministic.passed}/${report.deterministic.denominator} (${(report.deterministic.agreement * 100).toFixed(1)}%)`,
    `  false accept        : ${report.deterministic.falseAccept}`,
    `  false reject        : ${report.deterministic.falseReject}`,
    `  score-range breach  : ${report.deterministic.scoreRangeViolations}`,
    `  needs_review rate   : ${report.deterministic.needsReviewCount}/${report.deterministic.denominator} (${(report.deterministic.needsReviewRate * 100).toFixed(1)}%)`,
    ...Object.entries(report.deterministic.byQuestionType).map(
      ([type, bucket]) => `    · ${type}: ${bucket.passed}/${bucket.denominator} (${(bucket.agreement * 100).toFixed(1)}%)`
    ),
    '',
    `PROVIDER-DEPENDENT fixtures (denominator = ${report.providerDependent.denominator})`,
    `  scored: 0 · skipped: ${report.providerDependent.skipped}`,
    `  by question type: ${JSON.stringify(report.providerDependent.byQuestionType)}`,
    `  reason: ${report.providerDependent.reason}`,
    '',
    'By error category (deterministic only):',
    ...Object.entries(report.byErrorCategory).map(
      ([category, bucket]) => `  · ${category}: ${bucket.passed}/${bucket.denominator}`
    ),
    '',
    report.reviewedCount === 0
      ? 'VALIDITY: no fixture has been reviewed by a qualified human — these figures are PROVISIONAL and must not be reported as grading validity.'
      : 'VALIDITY: partially human-reviewed; see the dataset review summary.',
  ];
  return lines.join('\n');
}
