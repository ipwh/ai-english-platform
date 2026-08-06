// ============================================
// Student Enrichment — shared helper for AI prompt enrichment
//
// Builds a student context section from real student data
// (StudentLearningProfile + optional metadata) for injection
// into AI system prompts.
//
// Depends on: @/modules/student (canonical mastery source)
// ============================================

import type { StudentLearningProfile } from '@/modules/student';

/** Optional metadata for enrichment beyond mastery data */
export interface EnrichmentOptions {
  /** Student grade level (e.g. "S4") */
  gradeLevel?: string;
  /** Target DSE band (e.g. "Level 4") */
  targetLevel?: string;
  /** Recent mistake summaries (question text or topic) */
  recentMistakes?: string[];
}

/**
 * Build a student context section for AI system prompts.
 * Enriches the AI with knowledge of the student's current mastery,
 * weak areas, strong areas, and learning context.
 *
 * Returns an empty string if the profile is null/undefined.
 */
export function buildStudentContextSection(
  profile: StudentLearningProfile | null,
  options?: EnrichmentOptions,
): string {
  if (!profile) return '';

  const lines: string[] = [];

  lines.push('');
  lines.push('═══ 學生個人化背景（請在批改時參考） ═══');

  if (options?.gradeLevel) {
    lines.push(`年級：${options.gradeLevel}`);
  }
  if (options?.targetLevel) {
    lines.push(`目標等級：${options.targetLevel}`);
  }
  lines.push(`整體掌握度：${profile.overallMastery}%`);

  // Weak areas (score < 60)
  const weakAreas = Object.entries(profile.bySkill)
    .filter(([, m]) => m.overallScore < 60)
    .map(([area]) => area);
  if (weakAreas.length > 0) {
    lines.push(`已知弱項：${weakAreas.join('、')}`);
  }

  // Strong areas (score >= 80)
  const strongAreas = Object.entries(profile.bySkill)
    .filter(([, m]) => m.overallScore >= 80)
    .map(([area]) => area);
  if (strongAreas.length > 0) {
    lines.push(`已知強項：${strongAreas.join('、')}`);
  }

  // Recent mistakes
  const mistakes = options?.recentMistakes;
  if (mistakes && mistakes.length > 0) {
    lines.push(`近期錯題：${mistakes.slice(0, 5).join('、')}`);
  }

  lines.push('══════════════════════════════');
  return lines.join('\n');
}
