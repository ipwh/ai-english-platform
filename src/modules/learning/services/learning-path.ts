// Sprint 7: Learning Path Generator
// Generates personalized learning paths respecting prerequisites
import type { SkillMastery, LearningPathStep } from '../types';
import { getSkillsForLevel, getAllPrerequisites, topologicalSort } from './knowledge-graph';
import { isMastered } from './mastery-calculator';

/**
 * Generate a personalized learning path for a student.
 * Shows what's mastered, in-progress, locked (missing prereqs), and recommended next.
 */
export function generateLearningPath(
  skillMastery: Map<string, SkillMastery>,
  gradeLevel: string
): LearningPathStep[] {
  const sorted = topologicalSort();
  const levelSkills = new Set(getSkillsForLevel(gradeLevel).map(s => s.id));
  const steps: LearningPathStep[] = [];

  // Track which skills are unlocked (prerequisites satisfied or mastered)
  const unlocked = new Set<string>();

  for (const skill of sorted) {
    if (!levelSkills.has(skill.id)) continue;

    const mastery = skillMastery.get(skill.id);
    const mastered = mastery ? isMastered(mastery) : false;
    const prereqs = getAllPrerequisites(skill.id);

    // A skill is unlocked if all prereqs are mastered
    const allPrereqsMastered = prereqs.every(p => {
      const pm = skillMastery.get(p);
      return pm && isMastered(pm);
    });

    let status: LearningPathStep['status'];
    if (mastered) {
      status = 'mastered';
      unlocked.add(skill.id);
    } else if (allPrereqsMastered && mastery && mastery.totalAttempts > 0) {
      status = 'in-progress';
      unlocked.add(skill.id);
    } else if (allPrereqsMastered) {
      status = 'recommended';
      unlocked.add(skill.id);
    } else {
      status = 'locked';
    }

    steps.push({
      order: steps.length + 1,
      skillId: skill.id,
      skillName: skill.name,
      skillNameZh: skill.nameZh,
      status,
      mastery: mastery?.score ?? 0,
      prerequisites: prereqs,
      estimatedHours: skill.estimatedHours,
    });
  }

  return steps;
}

/** Get only the "recommended" steps (ready to learn, not yet started) */
export function getRecommendedSteps(path: LearningPathStep[]): LearningPathStep[] {
  return path.filter(s => s.status === 'recommended');
}

/** Get the next skill to learn */
export function getNextSkill(path: LearningPathStep[]): LearningPathStep | undefined {
  return path.find(s => s.status === 'recommended' || s.status === 'in-progress');
}
