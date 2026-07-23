// Sprint 31: Student Mastery Model — type definitions

export const MASTERY_SKILLS = ['grammar', 'vocabulary', 'reading', 'writing', 'listening', 'speaking'] as const;
export type MasterySkill = typeof MASTERY_SKILLS[number];

/** Sub-skill identifiers used across DSE English Language curriculum */
export type MasterySubSkill = string;

/** Core mastery data for a single skill/sub-skill */
export interface MasteryEntry {
  id: string;
  studentId: string;
  skill: MasterySkill;
  subSkill: MasterySubSkill;
  masteryScore: number;    // 0-100
  confidenceScore: number;  // 0-100
  retentionScore: number;   // 0-100
  lastPracticedAt: Date | null;
  practiceCount: number;
  mistakeCount: number;
  correctCount: number;
  updatedAt: Date;
}

/** Grouped mastery — aggregated by skill */
export interface SkillGroupedMastery {
  skill: MasterySkill;
  /** Weighted average mastery across sub-skills */
  overallScore: number;
  totalPractices: number;
  totalMistakes: number;
  totalCorrect: number;
  subSkillCount: number;
  subSkills: MasteryEntry[];
}

/** Full learning profile for one student */
export interface StudentLearningProfile {
  studentId: string;
  overallMastery: number;           // 0-100 weighted average
  bySkill: Record<MasterySkill, SkillGroupedMastery>;
  weakestSkills: MasteryEntry[];    // lowest mastery sub-skills
  strongestSkills: MasteryEntry[];  // highest mastery sub-skills
  totalPractices: number;
  generatedAt: Date;
}

/** Input for updating mastery after an exercise */
export interface ExerciseResult {
  studentId: string;
  skill: MasterySkill;
  subSkill: MasterySubSkill;
  totalQuestions: number;
  correctCount: number;
}
