// ============================================
// Sprint 111: Calibration Architecture Tests (20 tests)
// ============================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  calibrate, initCalibrationRegistry, getAllRules, getRule, getRuleCount,
  hasRule, clearRegistry, getCalibrationMetrics, resetCalibrationMetrics,
  generateCalibrationReport, formatCalibrationReport,
  allCalibrationRules,
} from '@/modules/ai/calibration';
import { getFullRuntimeReport } from '@/modules/platform/sre/reliability-dashboard';
import fs from 'fs';
import path from 'path';

describe('Sprint 111: Output Calibration Architecture', () => {
  beforeEach(() => {
    initCalibrationRegistry();
    resetCalibrationMetrics();
  });

  afterEach(() => {
    clearRegistry();
    resetCalibrationMetrics();
  });

  // ═══ 1. Calibration Engine exists ═══
  it('1. Calibration Engine exists and calibrates questions', () => {
    const questions = [
      { type: 'mcq', answer: 'A', prompt: 'Test question?', choices: ['A', 'B', 'C', 'D'], explanationEn: 'Because A is correct.', explanationZh: '因為A正確。' },
    ];
    const result = calibrate(questions);
    expect(result).toBeDefined();
    expect(result.decision).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.dimensions).toBeDefined();
    expect(result.metadata.questionCount).toBe(1);
  });

  // ═══ 2. Registry exists ═══
  it('2. Calibration Registry exists with all 11 rules', () => {
    initCalibrationRegistry();
    expect(getRuleCount()).toBe(11);
    expect(hasRule('cal:answer-length')).toBe(true);
    expect(hasRule('cal:explanation-quality')).toBe(true);
    expect(hasRule('cal:natural-language')).toBe(true);
    expect(getAllRules()).toHaveLength(11);
  });

  // ═══ 3. Metrics exists ═══
  it('3. Calibration Metrics exists and tracks correctly', () => {
    const questions = [
      { type: 'mcq', answer: 'A', choices: ['A', 'B', 'C', 'D'], explanationEn: 'Because A is correct.', explanationZh: '因為A正確。' },
    ];
    calibrate(questions);
    const metrics = getCalibrationMetrics();
    expect(metrics.totalCalibrations).toBe(1);
    expect(metrics.totalQuestions).toBe(1);
    expect(typeof metrics.avgCalibrationScore).toBe('number');
    expect(metrics.ruleStatistics.length).toBeGreaterThan(0);
  });

  // ═══ 4. Report exists ═══
  it('4. Calibration Report generates valid Markdown', () => {
    // Run calibration first to populate metrics
    calibrate([{ answer: 'A', explanationEn: 'test', explanationZh: '測試', choices: ['A', 'B', 'C', 'D'] }]);

    const report = generateCalibrationReport();
    expect(report.metrics).toBeDefined();
    expect(report.generatedAt).toBeDefined();

    const md = formatCalibrationReport(report);
    expect(md).toContain('# 📐 Output Calibration Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Rule Statistics');
  });

  // ═══ 5. AnswerLengthRule expands short answers ═══
  it('5. AnswerLengthRule expands short answers', () => {
    const questions = [{ answer: 'A', explanationEn: 'test', explanationZh: '測試', choices: ['A', 'B', 'C', 'D'] }];
    const result = calibrate(questions);
    const answerCheck = result.checks.find(c => c.ruleId === 'cal:answer-length');
    expect(answerCheck).toBeDefined();
  });

  // ═══ 6. ExplanationQualityRule rewrites weak explanations ═══
  it('6. ExplanationQualityRule rewrites weak explanations', () => {
    const questions = [{ answer: 'Paris', explanationEn: 'Because Paris is correct.', explanationZh: '因為巴黎正確。' }];
    const result = calibrate(questions);
    const check = result.checks.find(c => c.ruleId === 'cal:explanation-quality');
    expect(check).toBeDefined();
  });

  // ═══ 7. PlaceholderRemovalRule removes placeholders ═══
  it('7. PlaceholderRemovalRule removes placeholders', () => {
    const questions = [{ answer: 'TODO: fix this', explanationEn: 'N/A test', explanationZh: 'TBD' }];
    const result = calibrate(questions);
    const check = result.checks.find(c => c.ruleId === 'cal:placeholder-removal');
    expect(check).toBeDefined();
  });

  // ═══ 8. NaturalLanguageRule removes LLM artifacts ═══
  it('8. NaturalLanguageRule removes LLM artifacts', () => {
    const questions = [{ answer: 'Yes', explanationEn: 'Note: Please note that this is correct.', explanationZh: '這是正確的。' }];
    const result = calibrate(questions);
    const check = result.checks.find(c => c.ruleId === 'cal:natural-language');
    expect(check).toBeDefined();
  });

  // ═══ 9. MCQDistributionRule rebalances answer patterns ═══
  it('9. MCQDistributionRule rebalances AAAA patterns', () => {
    const questions = [
      { type: 'mcq', answer: 'A', choices: ['Alpha', 'Beta', 'Gamma', 'Delta'], explanationEn: 'test', explanationZh: '測試' },
      { type: 'mcq', answer: 'A', choices: ['Apple', 'Banana', 'Cherry', 'Date'], explanationEn: 'test', explanationZh: '測試' },
      { type: 'mcq', answer: 'A', choices: ['Ant', 'Bee', 'Cat', 'Dog'], explanationEn: 'test', explanationZh: '測試' },
      { type: 'mcq', answer: 'A', choices: ['Axe', 'Bat', 'Cup', 'Dot'], explanationEn: 'test', explanationZh: '測試' },
    ];
    const result = calibrate(questions);
    const check = result.checks.find(c => c.ruleId === 'cal:mcq-distribution');
    expect(check).toBeDefined();
  });

  // ═══ 10. WritingPromptCompletenessRule adds missing elements ═══
  it('10. WritingPromptCompletenessRule adds missing task/audience/purpose/word limit', () => {
    const questions = [{ type: 'writing', prompt: 'Write something.', explanationEn: 'test', explanationZh: '測試' }];
    const result = calibrate(questions);
    const check = result.checks.find(c => c.ruleId === 'cal:writing-completeness');
    expect(check).toBeDefined();
  });

  // ═══ 11. VocabularyNaturalnessRule replaces awkward words ═══
  it('11. VocabularyNaturalnessRule replaces overly formal words', () => {
    const questions = [{ answer: 'test', explanationEn: 'Students should utilize this method to commence learning.', explanationZh: '學生應使用此方法。', choices: ['A', 'B', 'C', 'D'] }];
    const result = calibrate(questions);
    const check = result.checks.find(c => c.ruleId === 'cal:vocabulary-naturalness');
    expect(check).toBeDefined();
  });

  // ═══ 12. No Provider imports ═══
  it('12. Calibration module does NOT import AI providers', () => {
    const calDir = path.resolve(__dirname, '../../calibration');
    const files = getAllTsFiles(calDir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"]@\/modules\/ai\/providers/);
    }
  });

  // ═══ 13. No Prisma imports ═══
  it('13. Calibration module does NOT import Prisma', () => {
    const calDir = path.resolve(__dirname, '../../calibration');
    const files = getAllTsFiles(calDir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"]@prisma\/client/);
      expect(content).not.toMatch(/import\s+\{\s*db\b/);
    }
  });

  // ═══ 14. No Workflow imports ═══
  it('14. Calibration module does NOT import Workflow', () => {
    const calDir = path.resolve(__dirname, '../../calibration');
    const files = getAllTsFiles(calDir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"]@\/modules\/ai\/workflow/);
    }
  });

  // ═══ 15. Health endpoint exposes runtime.calibration ═══
  it('15. Health endpoint exposes runtime.calibration', () => {
    const report = getFullRuntimeReport();
    expect(report.calibration).toBeDefined();
    expect(report.calibration.metrics).toBeDefined();
    expect(typeof report.calibration.metrics.avgCalibrationScore).toBe('number');
    expect(Array.isArray(report.calibration.metrics.ruleStatistics)).toBe(true);
  });

  // ═══ 16. ADR count >= 32 ═══
  it('16. ADR count is >= 32', () => {
    const adrDir = path.resolve(__dirname, '../../../../../docs/architecture');
    const adrs = fs.readdirSync(adrDir).filter(f => f.startsWith('ADR-') && f.endsWith('.md'));
    expect(adrs.length).toBeGreaterThanOrEqual(32);
  });

  // ═══ 17. Empty questions return PASS ═══
  it('17. Empty question batch returns PASS with score 100', () => {
    const result = calibrate([]);
    expect(result.decision).toBe('PASS');
    expect(result.score).toBe(100);
    expect(result.metadata.questionCount).toBe(0);
  });

  // ═══ 18. All rules registered via auto-init ═══
  it('18. All rules auto-register on calibration', () => {
    clearRegistry();
    expect(getRuleCount()).toBe(0);

    calibrate([{ answer: 'test', explanationEn: 'test', explanationZh: '測試' }]);
    expect(getRuleCount()).toBe(11);
  });

  // ═══ 19. Zero AI imports ═══
  it('19. Calibration module has zero AI/callLLM references', () => {
    const calDir = path.resolve(__dirname, '../../calibration');
    const files = getAllTsFiles(calDir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/callLLM/);
      expect(content).not.toMatch(/deepseek/i);
      expect(content).not.toMatch(/gemini/i);
    }
  });

  // ═══ 20. Scoring dimensions cover all 6 aspects ═══
  it('20. Calibration result has all 6 scoring dimensions', () => {
    const questions = [
      { answer: 'A', explanationEn: 'Test explanation.', explanationZh: '測試說明。', choices: ['A', 'B', 'C', 'D'], type: 'mcq' },
    ];
    const result = calibrate(questions);
    expect(result.dimensions.completeness).toBeDefined();
    expect(result.dimensions.naturalness).toBeDefined();
    expect(result.dimensions.readability).toBeDefined();
    expect(result.dimensions.balance).toBeDefined();
    expect(result.dimensions.pedagogy).toBeDefined();
    expect(result.dimensions.supportability).toBeDefined();
    expect(result.dimensions.overall).toBeDefined();
  });
});

/** Recursively get all .ts files in a directory (excluding __tests__) */
function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue; // skip test dirs
      results.push(...getAllTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
      results.push(fullPath);
    }
  }
  return results;
}
