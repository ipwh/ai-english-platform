// Sprint 8: Student Learning Profile — types

/** Six HKDSE skill dimensions */
export type SkillDimension = 'grammar' | 'vocabulary' | 'writing' | 'reading' | 'speaking' | 'listening';

/** Per-skill dimension stats */
export interface SkillStats {
  dimension: SkillDimension;
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;          // 0-1
  lastPracticedAt?: Date;
  /** Granular breakdown by sub-skill (e.g. 'tenses-simple', 'passive-voice') */
  subSkills: SubSkillStat[];
}

export interface SubSkillStat {
  skillId: string;
  name: string;
  nameZh: string;
  attempts: number;
  correct: number;
  accuracy: number;
  lastPracticedAt?: Date;
}

/** Topic preference tracking */
export interface TopicPreference {
  topic: string;
  category: 'school' | 'society' | 'technology' | 'environment' | 'culture' | 'health' | 'career' | 'hk-local' | 'daily-life' | 'science';
  engagementCount: number;
  averageScore: number;
  lastEngagedAt?: Date;
}

/** Learning speed metrics */
export interface LearningSpeed {
  /** Average questions completed per practice session */
  questionsPerSession: number;
  /** Average time per question (seconds, estimated) */
  avgTimePerQuestion: number;
  /** Sessions completed in last 7 days */
  sessionsLast7Days: number;
  /** Sessions completed in last 30 days */
  sessionsLast30Days: number;
  /** Total practice sessions */
  totalSessions: number;
  /** Words written per week (writing skill) */
  wordsPerWeek: number;
  /** New vocabulary added per week */
  vocabPerWeek: number;
  /** Consistency score (0-1): days active / days in period */
  consistencyScore: number;
}

/** The full student learning profile */
export interface StudentLearningProfile {
  studentId: string;
  gradeLevel: string;
  generatedAt: Date;

  /** Overall stats */
  totalPracticeSessions: number;
  totalQuestionsAnswered: number;
  overallAccuracy: number;

  /** Per-dimension breakdown */
  skills: Record<SkillDimension, SkillStats>;

  /** Topic preferences */
  preferredTopics: TopicPreference[];

  /** Learning speed */
  learningSpeed: LearningSpeed;

  /** Streak */
  currentStreak: number;

  /** Weak areas (from Learning Engine) */
  weakAreas: string[];

  /** Recommended next skills (from Learning Engine) */
  recommendedSkills: string[];

  /** Vocabulary stats */
  vocabulary: {
    total: number;
    mastered: number;
    learning: number;
    dueForReview: number;
  };
}
