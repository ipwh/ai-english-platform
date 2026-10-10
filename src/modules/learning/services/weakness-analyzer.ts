// Sprint 7: Weakness Analyzer
// Identifies true weaknesses (low mastery + prerequisites mastered)
import type { SkillMastery } from '../types';
import { getSkill, getAllPrerequisites } from './knowledge-graph';
import { isMastered } from './mastery-calculator';

export interface WeaknessResult {
  skillId: string;
  skillName: string;
  skillNameZh: string;
  currentScore: number;
  /** True weakness = prerequisites mastered but this skill is weak */
  isTrueWeakness: boolean;
  /** Missing prerequisites that might explain the weakness */
  missingPrerequisites: string[];
  /** Recommended priority */
  priority: 'high' | 'medium' | 'low';
}

/**
 * Analyze student weaknesses from mastery data.
 * A "true weakness" is a skill where:
 * 1. The skill itself is not mastered (score < 70)
 * 2. ALL prerequisites ARE mastered (so it's not "haven't learned prerequisites yet")
 */
export function analyzeWeaknesses(
  skillMastery: Map<string, SkillMastery>,
  gradeLevel: string
): WeaknessResult[] {
  const results: WeaknessResult[] = [];

  // Get all skills appropriate for this grade level
  const levels = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
  const maxLevelIndex = levels.indexOf(gradeLevel);

  for (const [skillId, mastery] of skillMastery) {
    const skill = getSkill(skillId);
    if (!skill) continue;

    const skillLevelIndex = levels.indexOf(skill.dseLevel);
    if (skillLevelIndex > maxLevelIndex) continue; // Skip skills above grade level

    if (isMastered(mastery)) continue; // Skip mastered skills

    const prereqs = getAllPrerequisites(skillId);
    const missingPrereqs = prereqs.filter(p => {
      const pm = skillMastery.get(p);
      return !pm || !isMastered(pm);
    });

    const isTrue = missingPrereqs.length === 0;

    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (isTrue && mastery.score < 40) priority = 'high';
    else if (isTrue) priority = 'medium';
    else priority = 'low';

    results.push({
      skillId,
      skillName: skill.name,
      skillNameZh: skill.nameZh,
      currentScore: mastery.score,
      isTrueWeakness: isTrue,
      missingPrerequisites: missingPrereqs,
      priority,
    });
  }

  // Sort: true weaknesses first, then by score ascending
  results.sort((a, b) => {
    if (a.isTrueWeakness !== b.isTrueWeakness) return a.isTrueWeakness ? -1 : 1;
    return a.currentScore - b.currentScore;
  });

  return results;
}

/** Get only true weaknesses */
export function getTrueWeaknesses(mastery: Map<string, SkillMastery>, gradeLevel: string): WeaknessResult[] {
  return analyzeWeaknesses(mastery, gradeLevel).filter(w => w.isTrueWeakness);
}
