// ============================================
// Sprint 111: Calibration Engine
// Coordinates all calibration rules over question batches.
// ============================================

import type { CalibrationResult, CalibrationCheck } from './calibration-types';
import { calculateCalibrationScore, determineCalibrationDecision, createCalibrationDimensions } from './calibration-types';
import { initCalibrationRegistry, getAllRules, getRulesByPriority } from './calibration-registry';
import { recordCalibration, recordRuleExecution as recordRuleMetric } from './calibration-metrics';

/** Calibrate a batch of questions through all rules */
export function calibrate(questions: Record<string, unknown>[]): CalibrationResult {
  const start = Date.now();

  // Ensure registry is initialized
  initCalibrationRegistry();
  const rules = getRulesByPriority();

  if (!questions || questions.length === 0) {
    return {
      decision: 'PASS',
      dimensions: { ...createCalibrationDimensions(), overall: 100 },
      score: 100,
      checks: [],
      modifiedCount: 0,
      totalChanges: 0,
      warnings: [],
      metadata: { totalChecks: 0, passed: 0, failed: 0, durationMs: Date.now() - start, questionCount: 0 },
    };
  }

  let calibratedQuestions = [...questions];
  const allChecks: CalibrationCheck[] = [];
  let totalChanges = 0;

  // Apply each rule
  for (const rule of rules) {
    const { questions: result, checks } = rule.calibrate(calibratedQuestions);
    calibratedQuestions = result;
    allChecks.push(...checks);

    const changes = checks.filter((c: CalibrationCheck) => !c.passed).length;
    if (changes > 0) totalChanges += changes;
    recordRuleMetric(rule.id, changes > 0, checks.length);
  }

  // Compute dimensions from checks
  const dims = createCalibrationDimensions();
  const failedChecks = allChecks.filter(c => !c.passed);

  // Deduct from dimensions based on rule categories
  for (const check of failedChecks) {
    const penalty = (1 - check.score) * 100;
    switch (check.ruleId) {
      case 'cal:answer-length':
      case 'cal:writing-completeness':
        dims.completeness = Math.max(0, dims.completeness - penalty);
        break;
      case 'cal:natural-language':
      case 'cal:vocabulary-naturalness':
        dims.naturalness = Math.max(0, dims.naturalness - penalty);
        break;
      case 'cal:option-length':
      case 'cal:placeholder-removal':
        dims.readability = Math.max(0, dims.readability - penalty);
        break;
      case 'cal:mcq-distribution':
        dims.balance = Math.max(0, dims.balance - penalty);
        break;
      case 'cal:explanation-quality':
      case 'cal:grammar-example':
        dims.pedagogy = Math.max(0, dims.pedagogy - penalty);
        break;
      case 'cal:reading-support':
      case 'cal:listening-support':
        dims.supportability = Math.max(0, dims.supportability - penalty);
        break;
    }
  }

  const dimensions = calculateCalibrationScore(dims);
  const decision = determineCalibrationDecision(dimensions.overall);

  const modifiedCount = new Set(failedChecks.map(c => c.questionIndex).filter(i => i >= 0)).size;
  const warnings = failedChecks
    .filter(c => c.priority === 'high' || c.priority === 'critical')
    .map(c => `[${c.ruleId}] ${c.changes.join('; ')}`);

  const result: CalibrationResult = {
    decision,
    dimensions,
    score: dimensions.overall,
    checks: allChecks,
    modifiedCount,
    totalChanges,
    warnings,
    metadata: {
      totalChecks: allChecks.length,
      passed: allChecks.filter(c => c.passed).length,
      failed: failedChecks.length,
      durationMs: Date.now() - start,
      questionCount: questions.length,
    },
  };

  recordCalibration(result);
  return result;
}
