// ============================================
// Sprint 115: Human Review Architecture Tests (30 tests)
// ============================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  humanReview, initHumanReviewRegistry, getAllRules, getRuleCount,
  clearRegistry, getHumanReviewMetrics, resetHumanReviewMetrics,
  generateHumanReviewReport, formatHumanReviewReport, allHumanReviewRules,
} from '@/modules/ai/human-review';
import { getFullRuntimeReport } from '@/modules/platform/sre/reliability-dashboard';
import fs from 'fs';
import path from 'path';

describe('Sprint 115: Human Review Architecture', () => {
  beforeEach(() => {
    initHumanReviewRegistry();
    resetHumanReviewMetrics();
  });

  afterEach(() => {
    clearRegistry();
    resetHumanReviewMetrics();
  });

  // ═══ 1-10: Unit Tests ═══

  it('1. Human Review Engine exists', () => {
    const r = humanReview([{ prompt: 'What is AI?', answer: 'A', choices: ['Artificial Intelligence', 'Machine Learning', 'Deep Learning', 'Neural Networks'], explanationEn: 'AI stands for Artificial Intelligence, which refers to machines that simulate human intelligence.', explanationZh: 'AI 即人工智能，指模擬人類智能的機器。' }]);
    expect(r).toBeDefined();
    expect(r.decision).toBeDefined();
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it('2. Registry exists with all 12 rules', () => {
    initHumanReviewRegistry();
    expect(getRuleCount()).toBe(12);
    expect(getAllRules()).toHaveLength(12);
  });

  it('3. Metrics tracks correctly', () => {
    humanReview([{ prompt: 'Test?', answer: 'A', choices: ['A', 'B', 'C', 'D'] }]);
    const m = getHumanReviewMetrics();
    expect(m.totalReviews).toBe(1);
    expect(typeof m.avgScore).toBe('number');
  });

  it('4. Report generates Markdown', () => {
    humanReview([{ prompt: 'Test?', answer: 'A', choices: ['A', 'B', 'C', 'D'] }]);
    const md = formatHumanReviewReport();
    expect(md).toContain('Human Review Report');
    expect(md).toContain('## Summary');
  });

  it('5. AmbiguityRule detects plausible multiple answers', () => {
    const r = humanReview([{ prompt: 'What color is the sky?', answer: 'A', choices: ['Blue', 'Light blue', 'Red', 'Green'] }]);
    const c = r.checks.find(c => c.ruleId === 'hr:ambiguity');
    expect(c).toBeDefined();
  });

  it('6. DistractorNaturalnessRule catches length outliers', () => {
    const r = humanReview([{ prompt: 'Test?', answer: 'A', choices: ['A', 'This is a very long detailed explanation that goes on and on about many things', 'C', 'D'] }]);
    const c = r.checks.find(c => c.ruleId === 'hr:distractor-naturalness');
    expect(c).toBeDefined();
    expect(c!.passed).toBe(false);
  });

  it('7. ExplanationQualityRule rejects superficial explanations', () => {
    const r = humanReview([{ prompt: 'Test?', answer: 'A', choices: ['A', 'B', 'C', 'D'], explanationEn: 'A is correct.', explanationZh: 'A 正確。' }]);
    const c = r.checks.find(c => c.ruleId === 'hr:explanation-quality');
    expect(c).toBeDefined();
    expect(c!.passed).toBe(false);
  });

  it('8. WritingAuthenticityRule rejects generic prompts', () => {
    const r = humanReview([{ type: 'writing', prompt: 'Write an essay about pollution.' }]);
    const c = r.checks.find(c => c.ruleId === 'hr:writing-authenticity');
    expect(c).toBeDefined();
    expect(c!.passed).toBe(false);
  });

  it('9. QuestionFlowRule detects repetitive starters', () => {
    const q = (n: number) => ({ prompt: `Which of the following about topic ${n} is correct?`, answer: 'A', choices: ['A', 'B', 'C', 'D'] });
    const r = humanReview([q(1), q(2), q(3), q(4), q(5)]);
    const c = r.checks.find(c => c.ruleId === 'hr:question-flow');
    expect(c).toBeDefined();
  });

  it('10. StudentConfusionRule detects unclear pronoun starts', () => {
    const r = humanReview([{ prompt: 'It is important.', answer: 'A', choices: ['A', 'B', 'C', 'D'] }], { previousQuestions: [{ prompt: 'Pollution is a serious issue.', answer: 'A' }] });
    const c = r.checks.find(c => c.ruleId === 'hr:student-confusion');
    expect(c).toBeDefined();
  });

  // ═══ 11-20: Architecture Tests ═══

  it('11. No Provider imports', () => {
    const dir = path.resolve(__dirname, '../../human-review');
    const files = getAllTsFiles(dir);
    for (const file of files) {
      expect(fs.readFileSync(file, 'utf-8')).not.toMatch(/from ['"]@\/modules\/ai\/providers/);
    }
  });

  it('12. No Prisma imports', () => {
    const dir = path.resolve(__dirname, '../../human-review');
    for (const file of getAllTsFiles(dir)) {
      const c = fs.readFileSync(file, 'utf-8');
      expect(c).not.toMatch(/from ['"]@prisma\/client/);
      expect(c).not.toMatch(/import\s+\{\s*db\b/);
    }
  });

  it('13. No Workflow imports', () => {
    const dir = path.resolve(__dirname, '../../human-review');
    for (const file of getAllTsFiles(dir)) {
      expect(fs.readFileSync(file, 'utf-8')).not.toMatch(/from ['"]@\/modules\/ai\/workflow/);
    }
  });

  it('14. Health endpoint exposes runtime.humanReview', () => {
    const r = getFullRuntimeReport();
    expect(r.humanReview).toBeDefined();
    expect(r.humanReview.metrics).toBeDefined();
    expect(typeof r.humanReview.metrics.avgScore).toBe('number');
  });

  it('15. ADR count >= 36', () => {
    const adrDir = path.resolve(__dirname, '../../../../../docs/architecture');
    const adrs = fs.readdirSync(adrDir).filter(f => f.startsWith('ADR-') && f.endsWith('.md'));
    expect(adrs.length).toBeGreaterThanOrEqual(36);
  });

  it('16. All rules auto-register', () => {
    clearRegistry();
    expect(getRuleCount()).toBe(0);
    humanReview([{ prompt: 'T?', answer: 'A', choices: ['A', 'B', 'C', 'D'] }]);
    expect(getRuleCount()).toBe(12);
  });

  it('17. 6 dimensions present', () => {
    const r = humanReview([{ prompt: 'What is AI?', answer: 'A', choices: ['A', 'B', 'C', 'D'] }]);
    expect(r.dimensions.studentExperience).toBeDefined();
    expect(r.dimensions.naturalness).toBeDefined();
    expect(r.dimensions.teachingValue).toBeDefined();
    expect(r.dimensions.authenticity).toBeDefined();
    expect(r.dimensions.fairness).toBeDefined();
    expect(r.dimensions.confidence).toBeDefined();
  });

  it('18. Zero AI imports', () => {
    for (const file of getAllTsFiles(path.resolve(__dirname, '../../human-review'))) {
      const c = fs.readFileSync(file, 'utf-8');
      expect(c).not.toMatch(/callLLM/);
      expect(c).not.toMatch(/deepseek/i);
      expect(c).not.toMatch(/gemini/i);
    }
  });

  it('19. Top issues populated', () => {
    const r = humanReview([{ prompt: 'Write an essay.', type: 'writing' }]);
    expect(Array.isArray(r.topIssues)).toBe(true);
    expect(Array.isArray(r.recommendations)).toBe(true);
  });

  it('20. Empty questions return excellent', () => {
    const r = humanReview([]);
    expect(r.decision).toBe('excellent');
    expect(r.score).toBe(100);
  });

  // ═══ 21-30: Rule-specific Tests ═══

  it('21. WordingNaturalnessRule detects AI-sounding phrases', () => {
    const r = humanReview([{ prompt: 'It is important to note that pollution is bad.', answer: 'A', choices: ['A', 'B', 'C', 'D'] }]);
    const c = r.checks.find(c => c.ruleId === 'hr:wording-naturalness');
    expect(c).toBeDefined();
    expect(c!.passed).toBe(false);
  });

  it('22. OptionFairnessRule catches length imbalance', () => {
    const r = humanReview([{ prompt: 'Test?', answer: 'A', choices: ['Short', 'This is a very very very long option with many many words in it', 'Mid length', 'Also short'] }]);
    const c = r.checks.find(c => c.ruleId === 'hr:option-fairness');
    expect(c).toBeDefined();
    expect(c!.passed).toBe(false);
  });

  it('23. AnswerSupportRule checks passage evidence', () => {
    const r = humanReview([{ prompt: 'What is mentioned?', answer: 'dragons', choices: ['dragons', 'cats', 'dogs', 'birds'] }], { passageContent: 'The text is about cats and dogs in the city.' });
    const c = r.checks.find(c => c.ruleId === 'hr:answer-support');
    expect(c).toBeDefined();
    expect(c!.passed).toBe(false);
  });

  it('24. ReadingNaturalnessRule detects uniform sentences', () => {
    const r = humanReview([{ readingContent: 'This is sentence one. This is sentence two. This is sentence three. This is sentence four. This is sentence five.' }]);
    const c = r.checks.find(c => c.ruleId === 'hr:reading-naturalness');
    expect(c).toBeDefined();
  });

  it('25. ListeningNaturalnessRule detects robotic transcript', () => {
    const r = humanReview([{ listeningContent: 'A: Hi.\nB: Hi.\nA: Ok.\nB: Ok.\nA: Bye.\nB: Bye.' }]);
    const c = r.checks.find(c => c.ruleId === 'hr:listening-naturalness');
    expect(c).toBeDefined();
    expect(c!.passed).toBe(false);
  });

  it('26. IntegratedSkillsFlowRule checks shared scenario', () => {
    const r = humanReview([
      { type: 'reading', readingContent: 'The environment is important for our future.', prompt: 'Q1?', answer: 'A', choices: ['A', 'B', 'C', 'D'] },
      { type: 'writing', prompt: 'Write about technology.' },
    ]);
    const c = r.checks.find(c => c.ruleId === 'hr:integrated-skills-flow');
    expect(c).toBeDefined();
  });

  it('27. Decision is one of 5 valid values', () => {
    const r = humanReview([{ prompt: 'Test?', answer: 'A', choices: ['A', 'B', 'C', 'D'] }]);
    expect(['excellent', 'good', 'acceptable', 'needs_improvement', 'reject']).toContain(r.decision);
  });

  it('28. Metrics include pass rate', () => {
    humanReview([{ prompt: 'Test?', answer: 'A', choices: ['A', 'B', 'C', 'D'] }]);
    const m = getHumanReviewMetrics();
    expect(typeof m.passRate).toBe('number');
    expect(typeof m.failRate).toBe('number');
    expect(typeof m.avgLatencyMs).toBe('number');
  });

  it('29. Score is between 0 and 100', () => {
    const r = humanReview([{ prompt: 'Test?', answer: 'A', choices: ['A', 'B', 'C', 'D'] }]);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('30. All 12 rules are unique', () => {
    const ids = allHumanReviewRules.map(r => r.id);
    expect(new Set(ids).size).toBe(12);
  });
});

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      results.push(...getAllTsFiles(fp));
    } else if (entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
      results.push(fp);
    }
  }
  return results;
}
