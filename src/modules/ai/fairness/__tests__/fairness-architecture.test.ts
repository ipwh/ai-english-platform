// ============================================
// Sprint 112: Fairness Architecture Tests (20 tests)
// ============================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  evaluateFairness, initFairnessRegistry, getAllRules, getRule,
  getRuleCount, clearRegistry, getFairnessMetrics, resetFairnessMetrics,
  generateFairnessReport, formatFairnessReport,
  allFairnessRules,
} from '@/modules/ai/fairness';
import { getFullRuntimeReport } from '@/modules/platform/sre/reliability-dashboard';
import fs from 'fs';
import path from 'path';

describe('Sprint 112: Grading Fairness Architecture', () => {
  beforeEach(() => {
    initFairnessRegistry();
    resetFairnessMetrics();
  });

  afterEach(() => {
    clearRegistry();
    resetFairnessMetrics();
  });

  // ═══ 1. Fairness Engine exists ═══
  it('1. Fairness Engine exists and evaluates answers', () => {
    const result = evaluateFairness({
      studentAnswer: 'The cat is big',
      referenceAnswer: 'The cat is large',
    });
    expect(result).toBeDefined();
    expect(result.decision).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.dimensions).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  // ═══ 2. Registry exists ═══
  it('2. Fairness Registry exists with all 14 rules', () => {
    initFairnessRegistry();
    expect(getRuleCount()).toBe(14);
    expect(getAllRules()).toHaveLength(14);
  });

  // ═══ 3. Metrics exists ═══
  it('3. Fairness Metrics exists and tracks correctly', () => {
    evaluateFairness({ studentAnswer: 'hello', referenceAnswer: 'hello' });
    const metrics = getFairnessMetrics();
    expect(metrics.totalEvaluations).toBe(1);
    expect(typeof metrics.avgScore).toBe('number');
    expect(metrics.ruleStatistics.length).toBeGreaterThan(0);
  });

  // ═══ 4. Report exists ═══
  it('4. Fairness Report generates valid Markdown', () => {
    evaluateFairness({ studentAnswer: 'test', referenceAnswer: 'test' });
    const report = generateFairnessReport();
    const md = formatFairnessReport(report);
    expect(md).toContain('# ⚖️ Grading Fairness Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Rule Statistics');
  });

  // ═══ 5. Article tolerance works ═══
  it('5. ArticleToleranceRule ignores a/an/the', () => {
    const result = evaluateFairness({
      studentAnswer: 'a cat',
      referenceAnswer: 'cat',
    });
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.decision).not.toBe('incorrect');
  });

  // ═══ 6. Case tolerance works ═══
  it('6. CaseToleranceRule ignores capitalization', () => {
    const result = evaluateFairness({
      studentAnswer: 'HELLO WORLD',
      referenceAnswer: 'hello world',
    });
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  // ═══ 7. British/American normalization works ═══
  it('7. BritishAmericanRule normalizes British to American', () => {
    const result = evaluateFairness({
      studentAnswer: 'The colour is grey',
      referenceAnswer: 'The color is gray',
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  // ═══ 8. Spelling tolerance works ═══
  it('8. SpellingToleranceRule allows minor spelling errors', () => {
    const result = evaluateFairness({
      studentAnswer: 'recieve',
      referenceAnswer: 'receive',
      maxSpellingDistance: 2,
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  // ═══ 9. Synonym expansion works ═══
  it('9. SynonymExpansionRule normalizes synonyms', () => {
    const result = evaluateFairness({
      studentAnswer: 'big',
      referenceAnswer: 'large',
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  // ═══ 10. Keyword coverage works ═══
  it('10. KeywordCoverageRule uses weighted keywords', () => {
    const result = evaluateFairness({
      studentAnswer: 'photosynthesis produces oxygen',
      referenceAnswer: 'photosynthesis produces oxygen and glucose',
      keywords: [
        { word: 'photosynthesis', weight: 1, category: 'core' },
        { word: 'oxygen', weight: 1, category: 'core' },
        { word: 'glucose', weight: 0.5, category: 'supporting' },
      ],
    });
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  // ═══ 11. Partial credit awarded ═══
  it('11. PartialCreditRule awards partial credit', () => {
    const result = evaluateFairness({
      studentAnswer: 'cat',
      referenceAnswer: 'dog',
    });
    expect(result.partialCredit).toBeGreaterThanOrEqual(0.5);
    expect(result.partialCredit).toBeLessThanOrEqual(1.0);
  });

  // ═══ 12. No Provider imports ═══
  it('12. Fairness module does NOT import AI providers', () => {
    const dir = path.resolve(__dirname, '../../fairness');
    const files = getAllTsFiles(dir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"]@\/modules\/ai\/providers/);
    }
  });

  // ═══ 13. No Prisma imports ═══
  it('13. Fairness module does NOT import Prisma', () => {
    const dir = path.resolve(__dirname, '../../fairness');
    const files = getAllTsFiles(dir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"]@prisma\/client/);
      expect(content).not.toMatch(/import\s+\{\s*db\b/);
    }
  });

  // ═══ 14. No Workflow imports ═══
  it('14. Fairness module does NOT import Workflow', () => {
    const dir = path.resolve(__dirname, '../../fairness');
    const files = getAllTsFiles(dir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"]@\/modules\/ai\/workflow/);
    }
  });

  // ═══ 15. Health endpoint ═══
  it('15. Health endpoint exposes runtime.fairness', () => {
    const report = getFullRuntimeReport();
    expect(report.fairness).toBeDefined();
    expect(report.fairness.metrics).toBeDefined();
    expect(typeof report.fairness.metrics.avgScore).toBe('number');
  });

  // ═══ 16. ADR count >= 33 ═══
  it('16. ADR count is >= 33', () => {
    const adrDir = path.resolve(__dirname, '../../../../../docs/architecture');
    const adrs = fs.readdirSync(adrDir).filter(f => f.startsWith('ADR-') && f.endsWith('.md'));
    expect(adrs.length).toBeGreaterThanOrEqual(33);
  });

  // ═══ 17. Verb tense tolerance ═══
  it('17. VerbTenseToleranceRule accepts equivalent tenses', () => {
    const result = evaluateFairness({
      studentAnswer: 'he is happy',
      referenceAnswer: 'he was happy',
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  // ═══ 18. Singular/plural tolerance ═══
  it('18. SingularPluralRule accepts number variations', () => {
    const result = evaluateFairness({
      studentAnswer: 'one child',
      referenceAnswer: 'two children',
    });
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  // ═══ 19. Number normalization ═══
  it('19. NumberNormalizationRule normalizes number words', () => {
    const result = evaluateFairness({
      studentAnswer: 'five',
      referenceAnswer: '5',
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  // ═══ 20. Zero AI imports ═══
  it('20. Fairness module has zero AI/callLLM references', () => {
    const dir = path.resolve(__dirname, '../../fairness');
    const files = getAllTsFiles(dir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/callLLM/);
      expect(content).not.toMatch(/deepseek/i);
      expect(content).not.toMatch(/gemini/i);
    }
  });
});

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      results.push(...getAllTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
      results.push(fullPath);
    }
  }
  return results;
}
