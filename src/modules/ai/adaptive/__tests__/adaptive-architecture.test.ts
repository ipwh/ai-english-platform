// ============================================
// Sprint 114: Adaptive Architecture Tests (20 tests)
// ============================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  evaluateAdaptiveLearning, initAdaptiveRegistry, getAllRules, getRuleCount,
  clearRegistry, getAdaptiveMetrics, resetAdaptiveMetrics,
  generateAdaptiveReport, formatAdaptiveReport, allAdaptiveRules,
  createStudentProfile, updateProfileAfterAnswer, getWeakestSkills,
  getStrongestSkills, isSessionFatigued, clearHistory,
} from '@/modules/ai/adaptive';
import { getFullRuntimeReport } from '@/modules/platform/sre/reliability-dashboard';
import fs from 'fs';
import path from 'path';

describe('Sprint 114: Adaptive Learning Architecture', () => {
  beforeEach(() => {
    initAdaptiveRegistry();
    resetAdaptiveMetrics();
    clearHistory();
  });

  afterEach(() => {
    clearRegistry();
    resetAdaptiveMetrics();
    clearHistory();
  });

  // ═══ 1. Engine exists ═══
  it('1. Adaptive Engine exists', () => {
    const profile = createStudentProfile('student-1', 'core');
    const result = evaluateAdaptiveLearning(profile);
    expect(result).toBeDefined();
    expect(result.decision).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.adjustedDifficulty).toBeDefined();
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  // ═══ 2. Registry exists ═══
  it('2. Registry exists with all 12 rules', () => {
    initAdaptiveRegistry();
    expect(getRuleCount()).toBe(12);
    expect(getAllRules()).toHaveLength(12);
  });

  // ═══ 3. Metrics exists ═══
  it('3. Metrics tracks correctly', () => {
    evaluateAdaptiveLearning(createStudentProfile('s1'));
    const m = getAdaptiveMetrics();
    expect(m.totalEvaluations).toBe(1);
    expect(typeof m.avgScore).toBe('number');
    expect(m.ruleStatistics.length).toBeGreaterThan(0);
  });

  // ═══ 4. Report exists ═══
  it('4. Report generates valid Markdown', () => {
    evaluateAdaptiveLearning(createStudentProfile('s1'));
    const report = generateAdaptiveReport();
    const md = formatAdaptiveReport(report);
    expect(md).toContain('# 🧠 Adaptive Learning Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('### Recommendations');
  });

  // ═══ 5. Student profile ═══
  it('5. Creates and updates student profiles', () => {
    const profile = createStudentProfile('s1', 'core', 'B1');
    expect(profile.studentId).toBe('s1');
    expect(profile.currentLevel).toBe('core');
    expect(profile.targetCEFR).toBe('B1');
    expect(profile.skills).toHaveLength(6);
  });

  // ═══ 6. Difficulty adjustment ═══
  it('6. DifficultyAdjustmentRule decreases after repeated failures', () => {
    let profile = createStudentProfile('s1', 'core');
    // Simulate 3 failures
    for (let i = 0; i < 3; i++) {
      profile = updateProfileAfterAnswer(profile, 'reading', false, 0, 'core');
    }
    const result = evaluateAdaptiveLearning(profile);
    const check = result.checks.find(c => c.ruleId === 'adp:difficulty-adjustment');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.detail).toContain('decreased');
  });

  // ═══ 7. Weak skill focus ═══
  it('7. WeakSkillFocusRule identifies weak skills', () => {
    let profile = createStudentProfile('s1');
    // Weaken one skill
    for (let i = 0; i < 10; i++) {
      profile = updateProfileAfterAnswer(profile, 'grammar', false, 0, 'core');
    }
    const weakest = getWeakestSkills(profile, 2);
    expect(weakest).toContain('grammar');
  });

  // ═══ 8. Session fatigue ═══
  it('8. SessionFatigueRule detects fatigued sessions', () => {
    let profile = createStudentProfile('s1');
    // Over-answer
    for (let i = 0; i < 35; i++) {
      profile = updateProfileAfterAnswer(profile, 'reading', false, 0, 'core');
    }
    expect(isSessionFatigued(profile)).toBe(true);
    const result = evaluateAdaptiveLearning(profile);
    const check = result.checks.find(c => c.ruleId === 'adp:session-fatigue');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
  });

  // ═══ 9. Recommendations ═══
  it('9. Produces valid recommendations (review/practice/advance/revision)', () => {
    let profile = createStudentProfile('s1');
    for (let i = 0; i < 20; i++) {
      profile = updateProfileAfterAnswer(profile, 'reading', i < 5 ? false : true, i < 5 ? 0 : 100, 'core');
    }
    const result = evaluateAdaptiveLearning(profile);
    expect(result.recommendations.length).toBeGreaterThan(0);
    const valid = ['review', 'practice', 'advance', 'revision'];
    for (const rec of result.recommendations) {
      expect(valid).toContain(rec);
    }
  });

  // ═══ 10. No Provider imports ═══
  it('10. No Provider imports', () => {
    const dir = path.resolve(__dirname, '../../adaptive');
    const files = getAllTsFiles(dir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"]@\/modules\/ai\/providers/);
    }
  });

  // ═══ 11. No Prisma imports ═══
  it('11. No Prisma imports', () => {
    const dir = path.resolve(__dirname, '../../adaptive');
    const files = getAllTsFiles(dir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"]@prisma\/client/);
      expect(content).not.toMatch(/import\s+\{\s*db\b/);
    }
  });

  // ═══ 12. No Workflow imports ═══
  it('12. No Workflow imports', () => {
    const dir = path.resolve(__dirname, '../../adaptive');
    const files = getAllTsFiles(dir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"]@\/modules\/ai\/workflow/);
    }
  });

  // ═══ 13. Health endpoint ═══
  it('13. Health endpoint exposes runtime.adaptive', () => {
    const report = getFullRuntimeReport();
    expect(report.adaptive).toBeDefined();
    expect(report.adaptive.metrics).toBeDefined();
    expect(typeof report.adaptive.metrics.avgScore).toBe('number');
  });

  // ═══ 14. ADR count ═══
  it('14. ADR count >= 35', () => {
    const adrDir = path.resolve(__dirname, '../../../../../docs/architecture');
    const adrs = fs.readdirSync(adrDir).filter(f => f.startsWith('ADR-') && f.endsWith('.md'));
    expect(adrs.length).toBeGreaterThanOrEqual(35);
  });

  // ═══ 15. All rules auto-register ═══
  it('15. All 12 rules auto-register', () => {
    clearRegistry();
    expect(getRuleCount()).toBe(0);
    evaluateAdaptiveLearning(createStudentProfile('s1'));
    expect(getRuleCount()).toBe(12);
  });

  // ═══ 16. 6 dimensions present ═══
  it('16. Result has all 6 adaptive dimensions', () => {
    const result = evaluateAdaptiveLearning(createStudentProfile('s1'));
    expect(result.dimensions.difficultyMatching).toBeDefined();
    expect(result.dimensions.weakSkillCoverage).toBeDefined();
    expect(result.dimensions.learningProgression).toBeDefined();
    expect(result.dimensions.variety).toBeDefined();
    expect(result.dimensions.studentConfidence).toBeDefined();
    expect(result.dimensions.pedagogicalBalance).toBeDefined();
    expect(result.dimensions.overall).toBeDefined();
  });

  // ═══ 17. Profile update accuracy ═══
  it('17. Profile update tracks accuracy correctly', () => {
    let profile = createStudentProfile('s1');
    profile = updateProfileAfterAnswer(profile, 'reading', true, 1, 'core');
    profile = updateProfileAfterAnswer(profile, 'reading', true, 1, 'core');
    profile = updateProfileAfterAnswer(profile, 'reading', false, 0, 'core');
    expect(profile.totalQuestionsAnswered).toBe(3);
    expect(profile.currentStreak).toBe(0);
    expect(profile.currentLossStreak).toBe(1);
  });

  // ═══ 18. Strongest skills identified ═══
  it('18. Identifies strongest skills', () => {
    let profile = createStudentProfile('s1');
    for (let i = 0; i < 10; i++) {
      profile = updateProfileAfterAnswer(profile, 'writing', true, 1, 'core');
    }
    const strongest = getStrongestSkills(profile, 1);
    expect(strongest).toContain('writing');
  });

  // ═══ 19. Focus skills populated ═══
  it('19. Adaptive result includes focus skills', () => {
    const result = evaluateAdaptiveLearning(createStudentProfile('s1'));
    expect(Array.isArray(result.focusSkills)).toBe(true);
    expect(result.focusSkills.length).toBeGreaterThan(0);
  });

  // ═══ 20. Zero AI imports ═══
  it('20. Zero AI/callLLM references', () => {
    const dir = path.resolve(__dirname, '../../adaptive');
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
