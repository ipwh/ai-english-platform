// Sprint 7: Learning Engine — shared types

/** A skill node in the grammar dependency graph */
export interface SkillNode {
  id: string;
  name: string;
  nameZh: string;
  /** HKDSE level this skill is typically introduced */
  dseLevel: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';
  /** Skill category for grouping */
  category: 'grammar' | 'writing' | 'reading' | 'listening' | 'speaking' | 'vocabulary';
  /** Prerequisite skill IDs that must be mastered first */
  prerequisites: string[];
  /** Estimated hours to achieve basic mastery */
  estimatedHours: number;
}

/** Student's mastery data for a specific skill */
export interface SkillMastery {
  skillId: string;
  /** 0-100 mastery score */
  score: number;
  /** Total practice attempts */
  totalAttempts: number;
  /** Correct attempts */
  correctAttempts: number;
  /** Accuracy rate (0-1) */
  accuracy: number;
  /** Days since last practice */
  daysSinceLastPractice: number;
  /** When the student first practiced this skill */
  firstPracticedAt?: Date;
  /** When the student last practiced this skill */
  lastPracticedAt?: Date;
}

/** Student's practice record summary */
export interface StudentPracticeSummary {
  studentId: string;
  gradeLevel: string;
  skillMastery: Map<string, SkillMastery>;
}

/** A learning recommendation */
export interface LearningRecommendation {
  skillId: string;
  skillName: string;
  skillNameZh: string;
  reason: 'weakness' | 'prerequisite' | 'next-in-path' | 'reinforcement';
  priority: 'high' | 'medium' | 'low';
  currentMastery: number;
  targetMastery: number;
  estimatedEffort: string;
}

/** A step in the learning path */
export interface LearningPathStep {
  order: number;
  skillId: string;
  skillName: string;
  skillNameZh: string;
  status: 'mastered' | 'in-progress' | 'locked' | 'recommended';
  mastery: number;
  prerequisites: string[];
  estimatedHours: number;
}
