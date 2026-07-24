// ============================================
// Sprint 114: Adaptive Engine
// ============================================

import type { AdaptiveResult, AdaptiveCheck, StudentProfile, AdaptiveContext, RecommendationType, SkillDomain, DifficultyLevel } from './adaptive-types';
import { calculateAdaptiveScore, determineAdaptiveDecision, createAdaptiveDimensions, DIFFICULTY_ORDER } from './adaptive-types';
import { initAdaptiveRegistry, getRulesByPriority } from './adaptive-registry';
import { getWeakestSkills, getStrongestSkills } from './adaptive-profile';
import { recordAdaptiveEvaluation, recordRuleExecution } from './adaptive-metrics';

export function evaluateAdaptiveLearning(
  profile: StudentProfile,
  context?: AdaptiveContext,
): AdaptiveResult {
  const start = Date.now();

  initAdaptiveRegistry();
  const rules = getRulesByPriority();
  const allChecks: AdaptiveCheck[] = [];

  for (const rule of rules) {
    const check = rule.evaluate(profile, context);
    allChecks.push(check);
    recordRuleExecution(rule.id, !check.passed);
  }

  const dims = createAdaptiveDimensions();
  const failedChecks = allChecks.filter(c => !c.passed);

  for (const check of failedChecks) {
    const penalty = (1 - check.score) * 100;
    switch (check.ruleId) {
      case 'adp:difficulty-adjustment':
      case 'adp:confidence-adjustment':
        dims.difficultyMatching = Math.max(0, dims.difficultyMatching - penalty);
        break;
      case 'adp:weak-skill-focus':
        dims.weakSkillCoverage = Math.max(0, dims.weakSkillCoverage - penalty);
        break;
      case 'adp:mastery-progression':
      case 'adp:repeated-mistake':
        dims.learningProgression = Math.max(0, dims.learningProgression - penalty);
        break;
      case 'adp:vocabulary-recycling':
      case 'adp:grammar-recycling':
      case 'adp:question-variety':
        dims.variety = Math.max(0, dims.variety - penalty);
        break;
      case 'adp:session-fatigue':
      case 'adp:confidence-adjustment':
        dims.studentConfidence = Math.max(0, dims.studentConfidence - penalty);
        break;
      case 'adp:challenge-balance':
      case 'adp:learning-objective':
      case 'adp:adaptive-recommendation':
        dims.pedagogicalBalance = Math.max(0, dims.pedagogicalBalance - penalty);
        break;
    }
  }

  const dimensions = calculateAdaptiveScore(dims);
  const decision = determineAdaptiveDecision(dimensions.overall);

  // Determine adjusted difficulty
  let adjustedDifficulty = profile.currentLevel;
  const diffCheck = failedChecks.find(c => c.ruleId === 'adp:difficulty-adjustment');
  if (diffCheck?.detail?.includes('decreased')) {
    const idx = DIFFICULTY_ORDER.indexOf(profile.currentLevel);
    if (idx > 0) adjustedDifficulty = DIFFICULTY_ORDER[idx - 1];
  } else if (diffCheck?.detail?.includes('increased')) {
    const idx = DIFFICULTY_ORDER.indexOf(profile.currentLevel);
    if (idx < DIFFICULTY_ORDER.length - 1) adjustedDifficulty = DIFFICULTY_ORDER[idx + 1];
  }

  // Determine focus skills
  const focusSkills: SkillDomain[] = [];
  const weakCheck = failedChecks.find(c => c.ruleId === 'adp:weak-skill-focus');
  if (weakCheck) focusSkills.push(...getWeakestSkills(profile, 2));
  else focusSkills.push(...getStrongestSkills(profile, 1));

  // Determine recommendations
  const recommendations: RecommendationType[] = [];
  const recCheck = failedChecks.find(c => c.ruleId === 'adp:adaptive-recommendation');
  if (recCheck?.detail?.includes('REVISION')) recommendations.push('revision');
  else if (recCheck?.detail?.includes('REVIEW')) recommendations.push('review');
  else if (recCheck?.detail?.includes('PRACTICE')) recommendations.push('practice');
  else if (recCheck?.detail?.includes('ADVANCE')) recommendations.push('advance');

  const warnings = failedChecks
    .filter(c => c.priority === 'high' || c.priority === 'critical')
    .map(c => `[${c.ruleId}] ${c.detail || 'failed'}`);

  const result: AdaptiveResult = {
    decision,
    dimensions,
    score: dimensions.overall,
    checks: allChecks,
    recommendations: recommendations.length > 0 ? recommendations : ['practice'],
    adjustedDifficulty,
    focusSkills,
    warnings,
    metadata: {
      totalChecks: allChecks.length,
      passed: allChecks.filter(c => c.passed).length,
      failed: failedChecks.length,
      durationMs: Date.now() - start,
    },
  };

  recordAdaptiveEvaluation(result);
  return result;
}
