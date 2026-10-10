// ============================================
// Grading evaluation baseline — contract + regression tests (Sprint 143)
// ============================================
// Two jobs:
//   1. lock the DATASET's shape and honesty (unique ids, declared review status,
//      mandated coverage) so it cannot quietly degrade into a weaker artefact;
//   2. score every deterministic fixture through the REAL grading path and assert
//      the contract holds — while a provider that THROWS if it is ever called
//      proves the deterministic run needs no AI and cannot become flaky in CI.
//
// Human review status is asserted explicitly: if the dataset claims reviewed
// fixtures, the summary must agree — and today it is 0, so the printed report says
// PROVISIONAL. A green run here is NOT evidence of grading validity.
// ============================================

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({ gradeAI: vi.fn() }));

vi.mock('@/modules/ai', () => ({
  gradeCustomPracticeWithAI: mocks.gradeAI,
}));

import {
  GRADING_BASELINE_VERSION,
  formatEvaluationReport,
  loadGradingBaseline,
  runGradingEvaluation,
} from '../evaluation/grading-evaluation-runner';

const dataset = loadGradingBaseline();

describe('grading baseline dataset', () => {
  it('declares a version and a consistent review summary', () => {
    expect(dataset.datasetVersion).toBe(GRADING_BASELINE_VERSION);
    expect(dataset.cases.length).toBeGreaterThanOrEqual(20);
    expect(dataset.reviewStatusSummary.reviewed + dataset.reviewStatusSummary.unreviewed).toBe(dataset.cases.length);
  });

  it('has unique case ids and complete expected values', () => {
    const ids = dataset.cases.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const item of dataset.cases) {
      expect(item.question.answerKey.length).toBeGreaterThan(0);
      expect(item.question.maxMarks).toBeGreaterThan(0);
      expect(item.rationale.length).toBeGreaterThan(10);
      expect(item.provenance).toContain('2026-10-10');
      const [min, max] = item.expected.scoreRange;
      expect(min).toBeLessThanOrEqual(max);
      expect(max).toBeLessThanOrEqual(item.question.maxMarks);
    }
  });

  it('covers every category the mandate requires', () => {
    const categories = new Set(dataset.cases.map(item => item.errorCategory));
    for (const required of [
      'tense-selection',
      'past-perfect-sequencing',
      'conditional-pattern',
      'target-rule-compliance',
      'word-order',
      'equivalent-wording',
      'contextual-unsuitability',
      'common-learner-error',
      'ambiguous-question',
      'incomplete-response',
      'system-failure-behaviour',
    ]) {
      expect(categories, `missing coverage for ${required}`).toContain(required);
    }

    // The three practice categories from the feature spec must all appear.
    expect(new Set(dataset.cases.map(item => item.category))).toEqual(
      new Set(['grammar', 'sentence_pattern', 'vocabulary'])
    );
  });

  it('labels unreviewed fixtures as provisional and never as human ground truth', () => {
    expect(dataset.reviewStatusSummary.reviewed).toBe(0);
    expect(dataset.reviewStatusSummary.reviewedBy).toBeNull();
    expect(dataset.reviewStatusSummary.note).toContain('PROVISIONAL');
    for (const item of dataset.cases) {
      expect(item.provenance).toContain('unreviewed');
    }
  });

  it('stays isolated from HKDSE scores and IELTS scoring data', () => {
    // The dataset is Custom Practice grading only: no official DSE marks, no band
    // conversions, no cross-subsystem evidence may leak into it.
    const raw = readFileSync(new URL('../evaluation/fixtures/grading-baseline-v1.json', import.meta.url), 'utf8').toLowerCase();
    for (const forbidden of ['hkdse', 'dse ', 'ielts', 'band', 'overallaccuracy', 'hkeaa', 'clo']) {
      expect(raw, `dataset must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('proves the runner uses the production grading path and never a provider', () => {
    // Source scan (repo convention): the evaluation must call the SAME function the
    // submission service calls — not a test-only re-implementation — and must not be
    // able to reach a provider or the network at all.
    const runner = readFileSync(new URL('../evaluation/grading-evaluation-runner.ts', import.meta.url), 'utf8');
    expect(runner).toContain("import { gradeCustomPracticeAnswers } from '../services/grading-service'");
    expect(runner).not.toContain('executeAI');
    expect(runner).not.toContain('fetch(');
    expect(runner).not.toContain('@/modules/ai');

    const submission = readFileSync(new URL('../services/submission-service.ts', import.meta.url), 'utf8');
    expect(submission).toContain('gradeCustomPracticeAnswers');
  });
});

describe('deterministic evaluation against the real grading path', () => {
  it('scores every deterministic fixture with full agreement and no provider call', async () => {
    mocks.gradeAI.mockImplementation(() => {
      throw new Error('the deterministic evaluation must never call the AI provider');
    });

    const report = await runGradingEvaluation(dataset);

    // eslint-disable-next-line no-console
    console.log(`\n${formatEvaluationReport(report)}\n`);

    expect(mocks.gradeAI).not.toHaveBeenCalled();
    expect(report.deterministic.denominator).toBeGreaterThanOrEqual(15);
    expect(report.deterministic.falseAccept).toBe(0);
    expect(report.deterministic.falseReject).toBe(0);
    expect(report.deterministic.scoreRangeViolations).toBe(0);
    expect(report.deterministic.agreement).toBe(1);
  });

  it('reports provider-dependent fixtures as skipped with their own denominator', async () => {
    const report = await runGradingEvaluation(dataset);

    expect(report.providerDependent.denominator).toBeGreaterThan(5);
    expect(report.providerDependent.skipped).toBe(report.providerDependent.denominator);
    expect(report.deterministic.denominator + report.providerDependent.denominator).toBe(dataset.cases.length);
  });

  it('is reproducible: two runs produce identical per-case outcomes', async () => {
    const first = await runGradingEvaluation(dataset);
    const second = await runGradingEvaluation(dataset);

    expect(second.results.map(result => [result.id, result.actualVerdict, result.awardedMarks, result.actualNeedsReview])).toEqual(
      first.results.map(result => [result.id, result.actualVerdict, result.awardedMarks, result.actualNeedsReview])
    );
  });

  it('marks an unanswered open-ended item as needs_review and never as incorrect', async () => {
    const report = await runGradingEvaluation(dataset);
    const blankOpenEnded = report.results.find(result => result.id === 'requirement-002-all-blank-open-ended');

    expect(blankOpenEnded).toBeDefined();
    expect(blankOpenEnded!.actualVerdict).toBe('needs_review');
    expect(blankOpenEnded!.actualNeedsReview).toBe(true);
    expect(blankOpenEnded!.awardedMarks).toBe(0);
  });

  it('reports reviewed coverage honestly (0 today) and says so in the report text', async () => {
    const report = await runGradingEvaluation(dataset);
    const text = formatEvaluationReport(report);

    expect(report.reviewedCoverage).toBe(0);
    expect(text).toContain('PROVISIONAL');
    expect(text).toContain('denominator');
    expect(text).toContain('false accept');
  });
});
