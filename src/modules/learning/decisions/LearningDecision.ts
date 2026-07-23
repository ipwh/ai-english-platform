// Sprint 64: Canonical LearningDecision — the ONE output type for all learning decisions
// Every recommendation, strategy, and adaptive path must use this type.

// ============================================
// Canonical DSE Exam Weights (single source of truth)
// Based on HKDSE Paper 1-3 frequency analysis (2012-2025)
// ============================================

export const CANONICAL_DSE_WEIGHTS: Record<string, number> = {
  // Grammar (Paper 1 & 2)
  'tenses': 1.00,           'subject-verb-agreement': 0.95,
  'passive-voice': 0.85,    'conditionals': 0.85,
  'relative-clauses': 0.80, 'connectors': 0.80,
  'articles': 0.65,         'prepositions': 0.60,
  'modal-verbs': 0.60,      'gerunds-infinitives': 0.55,
  'reported-speech': 0.55,  'comparatives': 0.50,
  'inversion': 0.35,        'phrasal-verbs': 0.30,
  'subjunctive': 0.25,
  // Writing (Paper 2)
  'essay-structure': 0.90,  'argument-development': 0.85,
  'coherence-cohesion': 0.80, 'tone-register': 0.70,
  'letter-format': 0.60,    'report-format': 0.55,
  'article-format': 0.50,
  // Reading (Paper 1)
  'skimming-scanning': 0.85, 'inference': 0.80,
  'vocabulary-in-context': 0.75, 'tone-analysis': 0.65,
  'summary-skills': 0.70,
  // Generic fallbacks
  'grammar': 0.50, 'vocabulary': 0.50,
  'writing': 0.50, 'reading': 0.50,
  'listening': 0.50, 'speaking': 0.50,
};

export function getCanonicalDSEWeight(topicId: string): number {
  for (const [key, weight] of Object.entries(CANONICAL_DSE_WEIGHTS)) {
    if (topicId.includes(key)) return weight;
  }
  return 0.40;
}

// ============================================
// Decision weights (single source of truth)
// ============================================

export const DECISION_WEIGHTS = {
  WEAKNESS: 0.35,         // How weak the student is in this area
  EXAM_IMPORTANCE: 0.30,  // How important for DSE
  READINESS: 0.20,        // How ready (prerequisites met)
  RECENCY: 0.15,          // How recently practiced
};

// ============================================
// LearningDecision — complete explainable decision
// ============================================

export interface LearningDecision {
  /** What action to take */
  action: 'practice' | 'review' | 'learn' | 'reinforce' | 'diagnostic';

  /** What to target */
  targetSkill: string;
  targetSkillZh: string;

  /** Difficulty level */
  difficulty: 'remedial' | 'core' | 'challenge';

  /** Priority score (0-1, higher = more urgent) */
  priority: number;

  /** WHY this decision (deterministic, bilingual) */
  reason: string;
  reasonZh: string;

  /** Evidence supporting this decision */
  evidence: {
    masteryBefore: number;
    estimatedMasteryAfter: number;
    mistakeCount: number;
    daysSinceLastPractice: number;
    dseExamWeight: number;
  };

  /** Confidence in this decision (0-1) */
  confidence: number;

  /** Expected mastery gain (0-100) */
  expectedGain: number;

  /** Prerequisite knowledge nodes */
  prerequisites: string[];

  /** How to know if the student succeeded */
  successCriteria: string;

  /** How to verify retention */
  verificationPlan: string;

  /** Estimated time needed (minutes) */
  estimatedDurationMinutes: number;
}

// ============================================
// Convenience builders
// ============================================

export function createLearningDecision(params: {
  targetSkill: string;
  targetSkillZh: string;
  masteryBefore: number;
  mistakeCount: number;
  daysSinceLastPractice: number;
  priorityScore: number;
}): LearningDecision {
  const dseWeight = getCanonicalDSEWeight(params.targetSkill);
  const roomForImprovement = Math.max(0, 100 - params.masteryBefore);
  const expectedGain = Math.round(roomForImprovement * 0.15 * params.priorityScore);
  const estimatedMasteryAfter = Math.min(100, params.masteryBefore + expectedGain);

  const difficulty: LearningDecision['difficulty'] =
    params.masteryBefore < 30 ? 'remedial' :
    params.masteryBefore > 70 ? 'challenge' : 'core';

  const action: LearningDecision['action'] =
    params.masteryBefore < 30 ? 'learn' :
    params.daysSinceLastPractice > 14 ? 'review' :
    params.masteryBefore < 70 ? 'practice' : 'reinforce';

  return {
    action,
    targetSkill: params.targetSkill,
    targetSkillZh: params.targetSkillZh,
    difficulty,
    priority: Math.round(params.priorityScore * 10000) / 10000,
    reason: `${params.targetSkillZh} mastery at ${Math.round(params.masteryBefore)}%. ` +
      `DSE weight: ${Math.round(dseWeight * 100)}%. ` +
      `${params.daysSinceLastPractice} days since last practice.`,
    reasonZh: `${params.targetSkillZh}掌握度為${Math.round(params.masteryBefore)}%。` +
      `DSE權重${Math.round(dseWeight * 100)}%。` +
      `上次練習距今${params.daysSinceLastPractice}天。`,
    evidence: {
      masteryBefore: Math.round(params.masteryBefore),
      estimatedMasteryAfter,
      mistakeCount: params.mistakeCount,
      daysSinceLastPractice: params.daysSinceLastPractice,
      dseExamWeight: dseWeight,
    },
    confidence: Math.round(params.priorityScore * 100) / 100,
    expectedGain,
    prerequisites: [],
    successCriteria: `Score 80%+ on ${params.targetSkillZh} practice`,
    verificationPlan: 'Retry in 3 days to verify retention',
    estimatedDurationMinutes: 15,
  };
}
