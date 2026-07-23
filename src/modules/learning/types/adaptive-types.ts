// Sprint 39: Adaptive Learning Engine — facade over Sprints 31-38

export interface PipelineInput {
  studentId: string;
  gradeLevel: string;
  /** Optional: focus on a specific skill */
  focusSkill?: string;
  /** Max recommendations to return */
  maxRecommendations?: number;
}

export interface PipelineStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  durationMs: number;
  /** Stage-specific output summary */
  summary: Record<string, unknown>;
  error?: string;
}

export interface AdaptiveLearningResult {
  studentId: string;
  /** Pipeline execution stages */
  stages: PipelineStage[];
  /** Current mastery profile */
  mastery: {
    overallMastery: number;
    bySkill: Record<string, number>;
  };
  /** Top weaknesses */
  weaknesses: Array<{
    category: string;
    categoryZh: string;
    masteryScore: number;
    mistakeCount: number;
  }>;
  /** Recommended next actions */
  recommendations: Array<{
    action: string;
    actionZh: string;
    priority: 'high' | 'medium' | 'low';
    type: 'grammar' | 'vocabulary' | 'reading' | 'writing' | 'exercise';
  }>;
  /** Knowledge graph: next skills to learn */
  nextSkills: Array<{
    skillId: string;
    title: string;
    titleZh: string;
    readiness: number;
  }>;
  /** Generated exercise (if applicable) */
  generatedExercise?: {
    type: string;
    topic: string;
    topicZh: string;
    questionCount: number;
    difficulty: string;
  };
  totalTimeMs: number;
  generatedAt: Date;
}
