  // Sprint 31: Student Mastery Service — orchestrates repo + formula
import type { MasterySkill, MasteryEntry, ExerciseResult, SkillGroupedMastery, StudentLearningProfile } from '../types';
import { MASTERY_SKILLS } from '../types';
import { calculateMasteryScore } from './mastery-formula';
import { recordPracticeAttempt, upsertMastery, getMasteryBySkill, getWeakestSkills, getStrongestSkills } from '../repositories/student-mastery-repo';

// ============================================
// Service Functions
// ============================================

/** Map exercise skill strings to mastery skill categories */
function mapToMasterySkill(skill: string): MasterySkill {
  const s = skill.toLowerCase();
  if (s.includes('grammar') || s.includes('tense') || s.includes('passive') || s.includes('article') || s.includes('relative') || s.includes('modal') || s.includes('conditional') || s.includes('connector') || s.includes('preposition') || s.includes('gerund')) return 'grammar';
  if (s.includes('vocab') || s.includes('word') || s.includes('collocat')) return 'vocabulary';
  if (s.includes('read') || s.includes('comprehension')) return 'reading';
  if (s.includes('writ') || s.includes('essay') || s.includes('paragraph') || s.includes('organization') || s.includes('register')) return 'writing';
  if (s.includes('listen') || s.includes('integrated')) return 'listening';
  if (s.includes('speak') || s.includes('oral') || s.includes('pronunc')) return 'speaking';
  return 'grammar'; // default
}

/**
 * Update mastery after an exercise session.
 * Called from practice route after recording exercise results.
 */
export async function updateAfterExercise(result: ExerciseResult): Promise<MasteryEntry | null> {
  const { studentId, skill, subSkill, correctCount } = result;
  const isCorrect = correctCount >= Math.ceil(result.totalQuestions / 2);

  // Record the practice attempt
  const entry = await recordPracticeAttempt({ studentId, skill, subSkill, isCorrect });
  if (!entry) return null;

  // Recalculate mastery
  const { masteryScore, confidenceScore, retentionScore } = calculateMasteryScore({
    correctCount: entry.correctCount,
    practiceCount: entry.practiceCount,
    mistakeCount: entry.mistakeCount,
    lastPracticedAt: entry.lastPracticedAt,
  });

  const updated = await upsertMastery({
    studentId, skill, subSkill,
    masteryScore, confidenceScore, retentionScore,
  });

  return updated as MasteryEntry | null;
}

/**
 * Update mastery after a writing exercise.
 */
export async function updateAfterWriting(params: {
  studentId: string;
  subSkill: string;
  score: number; // 0-100 from CLO grading
}): Promise<MasteryEntry | null> {
  return updateAfterExercise({
    studentId: params.studentId,
    skill: 'writing' as MasterySkill,
    subSkill: params.subSkill,
    totalQuestions: 1,
    correctCount: params.score >= 70 ? 1 : 0,
  });
}

/**
 * Update mastery after vocabulary practice.
 */
export async function updateAfterVocabulary(params: {
  studentId: string;
  subSkill: string;
  correctCount: number;
  totalQuestions: number;
}): Promise<MasteryEntry | null> {
  return updateAfterExercise({
    studentId: params.studentId,
    skill: 'vocabulary' as MasterySkill,
    subSkill: params.subSkill,
    totalQuestions: params.totalQuestions,
    correctCount: params.correctCount,
  });
}

/**
 * Get the full learning profile for a student.
 */
export async function getLearningProfile(studentId: string): Promise<StudentLearningProfile> {
  const allEntries = await getMasteryBySkill(studentId);

  const bySkill = {} as Record<MasterySkill, SkillGroupedMastery>;
  for (const skill of MASTERY_SKILLS) {
    const entries = allEntries.filter(e => e.skill === skill);
    const avgScore = entries.length > 0
      ? Math.round(entries.reduce((s, e) => s + e.masteryScore, 0) / entries.length)
      : 0;
    bySkill[skill] = {
      skill,
      overallScore: avgScore,
      totalPractices: entries.reduce((s, e) => s + e.practiceCount, 0),
      totalMistakes: entries.reduce((s, e) => s + e.mistakeCount, 0),
      totalCorrect: entries.reduce((s, e) => s + e.correctCount, 0),
      subSkillCount: entries.length,
      subSkills: entries as MasteryEntry[],
    };
  }

  // Overall mastery: weighted average across all 6 skills
  const practicedSkills = (Object.values(bySkill) as SkillGroupedMastery[]).filter(s => s.subSkillCount > 0);
  const overallMastery = practicedSkills.length > 0
    ? Math.round(practicedSkills.reduce((s, sk) => s + sk.overallScore, 0) / practicedSkills.length)
    : 0;

  const weakestSkills = await getWeakestSkills(studentId, 5);
  const strongestSkills = await getStrongestSkills(studentId, 5);

  return {
    studentId,
    overallMastery,
    bySkill,
    weakestSkills: weakestSkills as MasteryEntry[],
    strongestSkills: strongestSkills as MasteryEntry[],
    totalPractices: practicedSkills.reduce((s, sk) => s + sk.totalPractices, 0),
    generatedAt: new Date(),
  };
}
