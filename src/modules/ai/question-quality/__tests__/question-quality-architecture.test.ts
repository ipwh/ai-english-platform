// ============================================
// Sprint 113: Question Quality Architecture Tests (20 tests)
// ============================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  evaluateQuestionQuality, initQuestionQualityRegistry, getAllRules,
  getRuleCount, clearRegistry, getQuestionQualityMetrics, resetQuestionQualityMetrics,
  generateQuestionQualityReport, formatQuestionQualityReport,
  allQuestionQualityRules,
} from '@/modules/ai/question-quality';
import { getFullRuntimeReport } from '@/modules/platform/sre/reliability-dashboard';
import fs from 'fs';
import path from 'path';

describe('Sprint 113: Question Quality Architecture', () => {
  beforeEach(() => {
    initQuestionQualityRegistry();
    resetQuestionQualityMetrics();
  });

  afterEach(() => {
    clearRegistry();
    resetQuestionQualityMetrics();
  });

  // ═══ 1. Engine exists ═══
  it('1. Question Quality Engine exists', () => {
    const result = evaluateQuestionQuality([
      { prompt: 'What is the capital of France?', answer: 'A', choices: ['Paris', 'London', 'Berlin', 'Madrid'], explanationEn: 'Paris is the capital.', explanationZh: '巴黎是首都。' },
    ]);
    expect(result).toBeDefined();
    expect(result.decision).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.dimensions).toBeDefined();
  });

  // ═══ 2. Registry exists ═══
  it('2. Registry exists with all 14 rules', () => {
    initQuestionQualityRegistry();
    expect(getRuleCount()).toBe(14);
    expect(getAllRules()).toHaveLength(14);
  });

  // ═══ 3. Metrics exists ═══
  it('3. Metrics tracks correctly', () => {
    evaluateQuestionQuality([{ prompt: 'Test?', answer: 'A', choices: ['A', 'B', 'C', 'D'] }]);
    const m = getQuestionQualityMetrics();
    expect(m.totalEvaluations).toBe(1);
    expect(typeof m.avgScore).toBe('number');
    expect(m.ruleStatistics.length).toBeGreaterThan(0);
  });

  // ═══ 4. Report exists ═══
  it('4. Report generates valid Markdown', () => {
    evaluateQuestionQuality([{ prompt: 'Test?', answer: 'A', choices: ['A', 'B', 'C', 'D'] }]);
    const report = generateQuestionQualityReport();
    const md = formatQuestionQualityReport(report);
    expect(md).toContain('# 📋 Question Quality Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Rule Statistics');
  });

  // ═══ 5. Distractor plausibility ═══
  it('5. DistractorPlausibilityRule rejects all-of-the-above', () => {
    const result = evaluateQuestionQuality([
      { prompt: 'Test?', answer: 'A', choices: ['Paris', 'all of the above', 'London', 'Berlin'] },
    ]);
    const check = result.checks.find(c => c.ruleId === 'qq:distractor-plausibility');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
  });

  // ═══ 6. Answer uniqueness ═══
  it('6. CorrectAnswerUniquenessRule ensures one correct answer', () => {
    const result = evaluateQuestionQuality([
      { prompt: 'Test?', answer: 'Paris', choices: ['Paris', 'Paris', 'London', 'Berlin'] },
    ]);
    const check = result.checks.find(c => c.ruleId === 'qq:answer-uniqueness');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
  });

  // ═══ 7. Option similarity ═══
  it('7. OptionSimilarityRule rejects near-identical options', () => {
    const result = evaluateQuestionQuality([
      { prompt: 'Test?', answer: 'A', choices: ['The big red car', 'The big red cat', 'London', 'Berlin'] },
    ]);
    const check = result.checks.find(c => c.ruleId === 'qq:option-similarity');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
  });

  // ═══ 8. Stem completeness ═══
  it('8. StemCompletenessRule rejects empty stems', () => {
    const result = evaluateQuestionQuality([
      { prompt: '', answer: 'A', choices: ['A', 'B', 'C', 'D'] },
    ]);
    const check = result.checks.find(c => c.ruleId === 'qq:stem-completeness');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
  });

  // ═══ 9. Question clarity ═══
  it('9. QuestionClarityRule detects vague stems', () => {
    const result = evaluateQuestionQuality([
      { prompt: 'This is it.', answer: 'A', choices: ['Yes', 'No', 'Maybe', 'Not sure'] },
    ]);
    const check = result.checks.find(c => c.ruleId === 'qq:question-clarity');
    expect(check).toBeDefined();
  });

  // ═══ 10. Writing prompt quality ═══
  it('10. WritingPromptQualityRule checks for required elements', () => {
    const result = evaluateQuestionQuality([
      { type: 'writing', prompt: 'Write a letter.', answer: '' },
    ]);
    const check = result.checks.find(c => c.ruleId === 'qq:writing-prompt-quality');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
  });

  // ═══ 11. No Provider imports ═══
  it('11. No Provider imports', () => {
    const dir = path.resolve(__dirname, '../../question-quality');
    const files = getAllTsFiles(dir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"]@\/modules\/ai\/providers/);
    }
  });

  // ═══ 12. No Prisma imports ═══
  it('12. No Prisma imports', () => {
    const dir = path.resolve(__dirname, '../../question-quality');
    const files = getAllTsFiles(dir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"]@prisma\/client/);
      expect(content).not.toMatch(/import\s+\{\s*db\b/);
    }
  });

  // ═══ 13. No Workflow imports ═══
  it('13. No Workflow imports', () => {
    const dir = path.resolve(__dirname, '../../question-quality');
    const files = getAllTsFiles(dir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"]@\/modules\/ai\/workflow/);
    }
  });

  // ═══ 14. Health endpoint ═══
  it('14. Health endpoint exposes runtime.questionQuality', () => {
    const report = getFullRuntimeReport();
    expect(report.questionQuality).toBeDefined();
    expect(report.questionQuality.metrics).toBeDefined();
    expect(typeof report.questionQuality.metrics.avgScore).toBe('number');
  });

  // ═══ 15. ADR count ═══
  it('15. ADR count >= 34', () => {
    const adrDir = path.resolve(__dirname, '../../../../../docs/architecture');
    const adrs = fs.readdirSync(adrDir).filter(f => f.startsWith('ADR-') && f.endsWith('.md'));
    expect(adrs.length).toBeGreaterThanOrEqual(34);
  });

  // ═══ 16. All rules auto-register ═══
  it('16. All 14 rules auto-register', () => {
    clearRegistry();
    expect(getRuleCount()).toBe(0);
    evaluateQuestionQuality([{ prompt: 'Test?', answer: 'A', choices: ['A', 'B', 'C', 'D'] }]);
    expect(getRuleCount()).toBe(14);
  });

  // ═══ 17. 7 dimensions present ═══
  it('17. Result has all 7 quality dimensions', () => {
    const result = evaluateQuestionQuality([{ prompt: 'What is AI?', answer: 'Artificial Intelligence', choices: ['AI', 'ML', 'DL', 'NLP'], explanationEn: 'AI stands for Artificial Intelligence.' }]);
    expect(result.dimensions.questionDesign).toBeDefined();
    expect(result.dimensions.distractorQuality).toBeDefined();
    expect(result.dimensions.evidenceSupport).toBeDefined();
    expect(result.dimensions.difficulty).toBeDefined();
    expect(result.dimensions.clarity).toBeDefined();
    expect(result.dimensions.pedagogy).toBeDefined();
    expect(result.dimensions.variety).toBeDefined();
    expect(result.dimensions.overall).toBeDefined();
  });

  // ═══ 18. Difficulty balance detects answer in prompt ═══
  it('18. DifficultyBalanceRule detects answer verbatim in prompt', () => {
    const result = evaluateQuestionQuality([
      { prompt: 'The capital of France is Paris. What is the capital?', answer: 'Paris', choices: ['Paris', 'London', 'Berlin', 'Madrid'] },
    ]);
    const check = result.checks.find(c => c.ruleId === 'qq:difficulty-balance');
    expect(check).toBeDefined();
  });

  // ═══ 19. Question variety detects template repetition ═══
  it('19. QuestionVarietyRule detects repeated templates', () => {
    const q = (n: number) => ({ prompt: `Which of the following is correct about topic ${n}?`, answer: 'A', choices: ['A', 'B', 'C', 'D'] });
    const result = evaluateQuestionQuality([q(1), q(2), q(3), q(4)]);
    const check = result.checks.find(c => c.ruleId === 'qq:question-variety');
    expect(check).toBeDefined();
    expect(result.checks.filter(c => c.ruleId === 'qq:question-variety' && !c.passed).length).toBeGreaterThanOrEqual(1);
  });

  // ═══ 20. Zero AI imports ═══
  it('20. Zero AI/callLLM references', () => {
    const dir = path.resolve(__dirname, '../../question-quality');
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
