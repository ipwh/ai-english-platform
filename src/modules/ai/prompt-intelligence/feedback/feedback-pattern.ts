// ============================================
// Sprint 110: Feedback Pattern Detector
// Detects recurring failure patterns from feedback history.
// 100% deterministic. No AI.
// ============================================

import type { DetectedPattern, FeedbackEvent, PatternType, FeedbackCategory } from './feedback-types';
import { PATTERN_DETECTION_WINDOW, DEFAULT_ACTIVATION_THRESHOLD } from './feedback-types';
import { getRecentEvents, getFailureEvents, getEventsByRule, countEventsBy } from './feedback-history';

// ═══ Pattern Detection Thresholds ═══

const THRESHOLDS = {
  /** Same rule failing this many times triggers RepeatedFailure */
  repeatedFailureCount: 20,
  /** Same category failing this many times triggers a category pattern */
  categoryFailureCount: 50,
  /** Average dimension score below this triggers LowAssessment */
  lowDimensionThreshold: 60,
  /** Repair rate above this (%) triggers HighRepairRate */
  highRepairRatePercent: 30,
  /** Reflection score below this triggers LowReflection */
  lowReflectionThreshold: 70,
  /** Evaluation score below this triggers PoorEvaluation */
  poorEvalThreshold: 60,
};

// ═══ Constraint Suggestions ═══

/** Map of rule patterns to suggested constraints */
const CONSTRAINT_MAP: Record<string, string> = {
  'qual:answer-field': 'Always include an answer field for every question.',
  'qual:mcq-answer': 'Only one option may be correct. Mark exactly one correct answer.',
  'qual:distractor': 'All distractors must be plausible and unique.',
  'qual:explanation': 'Every question MUST include explanationZh and explanationEn fields.',
  'qual:option-count': 'MCQ questions MUST have exactly 4 options (A/B/C/D).',
  'qual:reading-consistency': 'Every answer must be directly supported by the passage.',
  'qual:listening-consistency': 'Every answer must be explicitly supported by the transcript.',
  'qual:writing-task': 'Writing prompts must include Task, Audience, Purpose, and Word limit.',
  'qual:mcq-count': 'MCQ questions MUST have exactly 4 options.',
  'qual:field-presence': 'Do NOT use placeholder values like "N/A", "TBD", "...", or empty strings.',
  'eval:exact-match': 'Student answers should match the reference answer.',
  'eval:semantic': 'The reference answer must be unambiguous.',
  'asm:validity': 'Generated questions must have a single correct answer.',
  'asm:difficulty': 'Questions must match the target CEFR/grade level.',
  'asm:fairness': 'Questions must be free from cultural bias.',
  'opt:wording': 'Use clean, natural language. Avoid awkward phrasing.',
  'opt:duplicate-choices': 'All MCQ options must be unique. No duplicate option text.',
  'opt:readability': 'Use proper paragraph spacing and line breaks.',
  'opt:writing-prompt': 'Writing prompts MUST specify task, audience, purpose, and word count.',
  'ref:answer-presence': 'Every question MUST include an answer field. Never omit the answer.',
  'ref:mcq-option-count': 'MCQ questions MUST have exactly 4 distinct options.',
  'ref:explanation-presence': 'Every question MUST include explanationZh and explanationEn.',
};

/** Category-based defaults */
const CATEGORY_CONSTRAINTS: Record<string, string> = {
  structure: 'Ensure all required fields are present and correctly typed.',
  content: 'Ensure all content is accurate, relevant, and well-formed.',
  consistency: 'Ensure answers are consistent with options and passages.',
  pedagogy: 'Ensure questions are age-appropriate and educationally sound.',
  assessment: 'Ensure questions are fair, valid, and reliably gradeable.',
  answer: 'Ensure every question has a clear, unambiguous correct answer.',
  explanation: 'Ensure every question includes a bilingual explanation.',
  options: 'Ensure all MCQ options are plausible, unique, and balanced.',
  difficulty: 'Ensure questions match the target CEFR or grade level.',
  prompt: 'Ensure prompts are clear, specific, and complete.',
  readability: 'Ensure content uses proper formatting and natural language.',
  reliability: 'Ensure the question produces consistent assessment results.',
};

// ═══ Pattern Detection ═══

/** Detect all patterns from feedback history */
export function detectPatterns(
  options?: { activationThreshold?: number },
): DetectedPattern[] {
  const threshold = options?.activationThreshold ?? DEFAULT_ACTIVATION_THRESHOLD;
  const window = Math.min(PATTERN_DETECTION_WINDOW, threshold * 25);
  const patterns: DetectedPattern[] = [];

  // 1. RepeatedFailure: same rule failed many times
  const failures = getFailureEvents();
  const failuresByRule = countEventsBy(e => e.rule);
  for (const [rule, count] of Object.entries(failuresByRule)) {
    if (count >= THRESHOLDS.repeatedFailureCount) {
      patterns.push({
        type: 'RepeatedFailure',
        rule,
        occurrenceCount: count,
        confidence: Math.min(1, count / threshold),
        suggestedConstraint: CONSTRAINT_MAP[rule] || `Repeated failures for rule: ${rule}. Review and strengthen related constraints.`,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // 2. Category failures
  const failuresByCategory = countEventsBy(e => e.category);
  for (const [category, count] of Object.entries(failuresByCategory)) {
    if (count >= THRESHOLDS.categoryFailureCount) {
      patterns.push({
        type: 'PromptWeakness',
        category: category as FeedbackCategory,
        occurrenceCount: count,
        confidence: Math.min(1, count / (THRESHOLDS.categoryFailureCount * 2)),
        suggestedConstraint: CATEGORY_CONSTRAINTS[category] || `Improve ${category} quality.`,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // 3. HighRepairRate: repair rate > 30%
  const totalFailures = failures.length;
  const repairable = failures.filter(e => e.repairable).length;
  const repairRate = totalFailures > 0 ? (repairable / totalFailures) * 100 : 0;
  if (repairRate > THRESHOLDS.highRepairRatePercent && totalFailures >= 10) {
    const topRepairRule = Object.entries(failuresByRule)
      .filter(([r]) => failures.filter(e => e.rule === r && e.repairable).length > 0)
      .sort((a, b) => b[1] - a[1])[0];

    patterns.push({
      type: 'HighRepairRate',
      rule: topRepairRule?.[0],
      occurrenceCount: repairable,
      repairRate: repairRate / 100,
      confidence: Math.min(1, repairRate / 60),
      suggestedConstraint: 'Ensure generated output requires minimal repair. Produce complete, correct output on first attempt.',
      detectedAt: new Date().toISOString(),
    });
  }

  // 4. LowAssessment: dimension average < 60
  const assessmentEvents = failures.filter(e => e.source === 'assessment');
  if (assessmentEvents.length >= 10) {
    const dimScores = new Map<string, number[]>();
    for (const e of assessmentEvents) {
      if (e.dimension && e.score !== undefined) {
        if (!dimScores.has(e.dimension)) dimScores.set(e.dimension, []);
        dimScores.get(e.dimension)!.push(e.score);
      }
    }
    for (const [dim, scores] of dimScores) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg < THRESHOLDS.lowDimensionThreshold) {
        patterns.push({
          type: 'LowAssessment',
          dimension: dim,
          occurrenceCount: scores.length,
          avgScore: Math.round(avg),
          confidence: Math.min(1, (THRESHOLDS.lowDimensionThreshold - avg) / THRESHOLDS.lowDimensionThreshold),
          suggestedConstraint: `Improve "${dim}" dimension score (current avg: ${Math.round(avg)}).`,
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  // 5. LowReflection: reflection score < 70
  const reflectionEvents = failures.filter(e => e.source === 'self-reflection');
  const refScores = reflectionEvents.filter(e => e.score !== undefined);
  if (refScores.length >= 5) {
    const avgRefScore = refScores.reduce((a, e) => a + e.score!, 0) / refScores.length;
    if (avgRefScore < THRESHOLDS.lowReflectionThreshold) {
      const topMiss = countEventsBy(e => e.rule || 'unknown');
      const topEntry = Object.entries(topMiss).sort((a, b) => b[1] - a[1])[0];
      patterns.push({
        type: 'LowReflection',
        rule: topEntry?.[0],
        occurrenceCount: refScores.length,
        avgScore: Math.round(avgRefScore),
        confidence: Math.min(1, (THRESHOLDS.lowReflectionThreshold - avgRefScore) / THRESHOLDS.lowReflectionThreshold),
        suggestedConstraint: CONSTRAINT_MAP[topEntry?.[0] || ''] || 'Improve prompt quality for better reflection scores.',
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // 6. PoorEvaluation: evaluation score < 60
  const evalEvents = failures.filter(e => e.source === 'evaluation');
  const evalScores = evalEvents.filter(e => e.score !== undefined);
  if (evalScores.length >= 5) {
    const avgEvalScore = evalScores.reduce((a, e) => a + e.score!, 0) / evalScores.length;
    if (avgEvalScore < THRESHOLDS.poorEvalThreshold) {
      patterns.push({
        type: 'PoorEvaluation',
        occurrenceCount: evalScores.length,
        avgScore: Math.round(avgEvalScore),
        confidence: Math.min(1, (THRESHOLDS.poorEvalThreshold - avgEvalScore) / THRESHOLDS.poorEvalThreshold),
        suggestedConstraint: 'Ensure evaluation reference answers are accurate and unambiguous for reliable grading.',
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // Sort by confidence descending
  return patterns.sort((a, b) => b.confidence - a.confidence);
}

/** Detect patterns for a specific rule */
export function detectPatternsForRule(rule: string): DetectedPattern[] {
  return detectPatterns().filter(p => p.rule === rule);
}
