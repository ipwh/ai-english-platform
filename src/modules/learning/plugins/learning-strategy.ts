// Sprint 86: Learning Strategy Plugin — interface for pluggable learning strategies
// LearningDecisionEngine delegates to registered strategy plugins.

import type { PlatformPlugin } from '@/modules/platform/plugins/plugin';

export interface LearningDecision {
  action: string;
  targetSkill: string;
  targetSkillZh: string;
  priority: number;
  reason: string;
  evidence: Record<string, unknown>;
}

export interface StrategyInput {
  mastery: Record<string, number>;
  weaknesses: string[];
  strengths: string[];
  dseWeights: Record<string, number>;
  daysSinceLastPractice: Record<string, number>;
}

export interface LearningStrategyPlugin extends PlatformPlugin {
  /** Strategy priority weight (higher = more weight in merging) */
  weight: number;
  /** Evaluate and produce learning decisions */
  evaluate(input: StrategyInput): LearningDecision[];
}
