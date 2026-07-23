// Sprint 38: Teacher Copilot — type definitions

export type GenerationType =
  | 'homework'
  | 'worksheet'
  | 'class-quiz'
  | 'revision-paper'
  | 'remedial-exercises'
  | 'marking-scheme';

export type ActivityType = 'pair-work' | 'group-discussion' | 'game' | 'presentation' | 'role-play' | 'debate';

export interface GenerationRequest {
  type: GenerationType;
  teacherId: string;
  /** Target class/grade */
  gradeLevel: string;
  /** Grammar topic or skill focus */
  topic: string;
  topicZh: string;
  /** Number of questions */
  questionCount?: number;
  /** Difficulty level */
  difficulty?: 'remedial' | 'core' | 'challenge';
  /** Additional instructions */
  instructions?: string;
}

export interface GeneratedMaterial {
  type: GenerationType;
  title: string;
  titleZh: string;
  /** Generated content (questions, tasks, etc.) */
  content: string;
  /** Marking scheme if applicable */
  markingScheme?: string;
  /** Suggested answers */
  suggestedAnswers?: string;
  /** Estimated completion time (minutes) */
  estimatedTime: number;
  /** Metadata */
  metadata: {
    gradeLevel: string;
    topic: string;
    difficulty: string;
    questionCount: number;
  };
  generatedAt: Date;
}

export interface WeakTopicSuggestion {
  topic: string;
  topicZh: string;
  /** Average class mastery */
  avgMastery: number;
  /** Number of students weak in this topic */
  weakStudentCount: number;
  /** Priority for teaching */
  priority: 'high' | 'medium' | 'low';
}

export interface ClassroomActivity {
  type: ActivityType;
  title: string;
  titleZh: string;
  description: string;
  descriptionZh: string;
  durationMinutes: number;
  materials: string[];
  materialsZh: string[];
}

export interface TeacherCopilotResult {
  teacherId: string;
  /** Generated materials */
  materials: GeneratedMaterial[];
  /** Weakest topics in class */
  weakestTopics: WeakTopicSuggestion[];
  /** Suggested classroom activities */
  activities: ClassroomActivity[];
  generatedAt: Date;
}
