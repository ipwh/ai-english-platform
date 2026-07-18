// Sprint 11: Domain Events — types

// ============================================
// Event Types
// ============================================

export type DomainEventType =
  | 'exercise:completed'
  | 'essay:submitted'
  | 'vocabulary:learned'
  | 'assessment:finished'
  | 'streak:updated'
  | 'achievement:unlocked';

// ============================================
// Event Payloads
// ============================================

export interface ExerciseCompletedPayload {
  studentId: string;
  skill: string;
  skillZh?: string;
  difficulty: 'remedial' | 'core' | 'challenge';
  totalQuestions: number;
  correctCount: number;
  grammarPoint?: string;
  topic?: string;
  completedAt: Date;
}

export interface EssaySubmittedPayload {
  studentId: string;
  title: string;
  textType: string;
  wordCount: number;
  overallScore: number;
  grammarErrors: number;
  chinglishInstances: number;
  submittedAt: Date;
}

export interface VocabularyLearnedPayload {
  studentId: string;
  word: string;
  partOfSpeech?: string;
  source?: string;
  learnedAt: Date;
}

export interface AssessmentFinishedPayload {
  studentId: string;
  assessmentType: 'diagnostic' | 'practice' | 'exam' | 'daily-challenge';
  skill: string;
  score: number;
  totalQuestions: number;
  correctCount: number;
  completedAt: Date;
}

export interface StreakUpdatedPayload {
  studentId: string;
  streakDays: number;
  updatedAt: Date;
}

export interface AchievementUnlockedPayload {
  studentId: string;
  achievementId: string;
  achievementName: string;
  achievementNameZh: string;
  unlockedAt: Date;
}

// ============================================
// Domain Event
// ============================================

export interface DomainEvent<T = unknown> {
  type: DomainEventType;
  payload: T;
  timestamp: Date;
  /** Unique event ID for deduplication */
  eventId: string;
}

export type EventPayloadMap = {
  'exercise:completed': ExerciseCompletedPayload;
  'essay:submitted': EssaySubmittedPayload;
  'vocabulary:learned': VocabularyLearnedPayload;
  'assessment:finished': AssessmentFinishedPayload;
  'streak:updated': StreakUpdatedPayload;
  'achievement:unlocked': AchievementUnlockedPayload;
};

// ============================================
// Handler
// ============================================

export type EventHandler<T extends DomainEventType> = (event: DomainEvent<EventPayloadMap[T]>) => void | Promise<void>;
