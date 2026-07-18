// Sprint 7: Adaptive Recommendation Engine
// Combines weakness analysis + learning path to recommend next topics
import type { SkillMastery, LearningRecommendation } from '../types';
import { getTrueWeaknesses } from './weakness-analyzer';
import { generateLearningPath, getRecommendedSteps } from './learning-path';
import { getSkill } from './knowledge-graph';
import { isMastered } from './mastery-calculator';

/**
 * Generate adaptive learning recommendations for a student.
 * Priority order: true weaknesses → next in learning path → reinforcement
 */
export function getRecommendations(
  skillMastery: Map<string, SkillMastery>,
  gradeLevel: string,
  maxRecommendations = 5
): LearningRecommendation[] {
  const results: LearningRecommendation[] = [];

  // 1. True weaknesses (high priority)
  const weaknesses = getTrueWeaknesses(skillMastery, gradeLevel);
  for (const w of weaknesses.slice(0, 3)) {
    const skill = getSkill(w.skillId);
    results.push({
      skillId: w.skillId,
      skillName: skill?.name || w.skillId,
      skillNameZh: skill?.nameZh || w.skillId,
      reason: 'weakness',
      priority: 'high',
      currentMastery: w.currentScore,
      targetMastery: 70,
      estimatedEffort: `${skill?.estimatedHours || 2}-${(skill?.estimatedHours || 2) + 1} 小時`,
    });
  }

  // 2. Next in learning path (medium priority) — skills ready to learn
  const path = generateLearningPath(skillMastery, gradeLevel);
  const recommended = getRecommendedSteps(path);
  for (const step of recommended.slice(0, 2)) {
    if (results.length >= maxRecommendations) break;
    results.push({
      skillId: step.skillId,
      skillName: step.skillName,
      skillNameZh: step.skillNameZh,
      reason: 'next-in-path',
      priority: 'medium',
      currentMastery: step.mastery,
      targetMastery: 70,
      estimatedEffort: `${step.estimatedHours}-${step.estimatedHours + 1} 小時`,
    });
  }

  // 3. Reinforcement (low priority) — skills mastered but decaying
  for (const [skillId, mastery] of skillMastery) {
    if (results.length >= maxRecommendations) break;
    if (!isMastered(mastery)) continue;
    if (mastery.daysSinceLastPractice < 7) continue;

    const skill = getSkill(skillId);
    if (!skill) continue;

    results.push({
      skillId,
      skillName: skill.name,
      skillNameZh: skill.nameZh,
      reason: 'reinforcement',
      priority: 'low',
      currentMastery: mastery.score,
      targetMastery: Math.min(100, mastery.score + 10),
      estimatedEffort: '1-2 小時（複習）',
    });
  }

  return results.slice(0, maxRecommendations);
}
