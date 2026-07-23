// Sprint 35: Adaptive AI Tutor — types
import type { SkillDimension } from '@/modules/student/profile/types';
import type { CEFRLevel, HKDSELevel } from '@/modules/knowledge-graph/types';
import type { LearningMemory } from '@/modules/learning/memory/types';
import type { ReviewScheduleEntry, LearningStrategy } from '@/modules/learning/science/types';

// ============================================
// PersonalizationContext — unified input
// ============================================

export interface PersonalizationContext {
  studentId: string;
  gradeLevel: HKDSELevel;
  cefrLevel?: CEFRLevel;
  /** Student's learning memory (long-term profile) */
  learningMemory?: LearningMemory;
  /** Current mastery scores per knowledge node */
  masteryScores: Record<string, number>;
  /** Recent practice sessions */
  recentSessions: SessionSummary[];
  /** Due review schedule items */
  reviewSchedule: ReviewScheduleEntry[];
  /** Recent mistakes */
  recentMistakes: MistakeSummary[];
  /** Preferred topics from engagement analysis */
  preferredTopics: string[];
  /** Optional: student's self-reported mood (1-5 energy/focus) */
  mood?: number;
  /** Available study time in minutes */
  availableTimeMinutes: number;
}

export interface SessionSummary {
  sessionId: string;
  startedAt: string;
  skillFocus?: SkillDimension;
  correctCount: number;
  totalCount: number;
  durationMinutes: number;
}

export interface MistakeSummary {
  mistakeId: string;
  questionText: string;
  questionTextZh?: string;
  studentAnswer: string;
  correctAnswer: string;
  mistakeType: string;
  nodeId?: string;
  skillDimension?: SkillDimension;
}

// ============================================
// Tutor Actions
// ============================================

export type TutorActionType =
  | 'exercise' | 'hint' | 'feedback' | 'explanation'
  | 'review' | 'challenge' | 'support';

// ============================================
// Adaptive Parameters
// ============================================

export interface AdaptiveDifficulty {
  level: 'remedial' | 'core' | 'challenge';
  adjustedFrom?: string;
  reason: string;
  reasonZh: string;
  targetAccuracy: number;
}

export interface AdaptiveHintLevel {
  level: 1 | 2 | 3; // 1=gentle nudge, 2=partial guidance, 3=near-answer
  hint: string;
  hintZh: string;
  /** When to escalate to next hint level */
  escalationCondition: string;
}

export interface AdaptiveVocabulary {
  words: string[];
  complexity: 'basic' | 'intermediate' | 'advanced';
  definitions: Record<string, { en: string; zh: string }>;
}

export interface AdaptiveGrammar {
  focusItem: string;
  focusItemZh: string;
  subItems: string[];
  complexity: 'basic' | 'intermediate' | 'advanced';
}

export interface AdaptiveReading {
  passageLength: number; // words
  complexity: CEFRLevel;
  topic: string;
  topicZh: string;
  questionTypes: string[];
}

export interface AdaptiveWriting {
  taskType: string;
  wordLimit: number;
  expectedComplexity: CEFRLevel;
  promptHints: string[];
  promptHintsZh: string[];
}

// ============================================
// Tutor Output
// ============================================

export interface TutorOutput {
  studentId: string;
  sessionId: string;
  generatedAt: string;
  action: TutorActionType;

  // Core content
  content: string;
  contentZh: string;

  // Personalization metadata
  personalization: {
    difficulty: AdaptiveDifficulty;
    hintLevel?: AdaptiveHintLevel;
    vocabulary?: AdaptiveVocabulary;
    grammar?: AdaptiveGrammar;
    reading?: AdaptiveReading;
    writing?: AdaptiveWriting;
  };

  // Confidence & rationale
  confidence: number;        // 0-1
  reason: string;
  reasonZh: string;
  learningGain: number;      // estimated 0-1
  estimatedCompletionTime: number; // minutes

  // Follow-up
  followUp?: {
    nextAction: TutorActionType;
    nextActionDescription: string;
    nextActionDescriptionZh: string;
  };
}

// ============================================
// Exercise types for the selector
// ============================================

export type ExerciseFormat = 'mcq' | 'fill-blank' | 'error-correction' | 'short-writing' | 'matching' | 'listening-comprehension';

export interface ExerciseSpec {
  format: ExerciseFormat;
  difficulty: 'remedial' | 'core' | 'challenge';
  topicNodeId: string;
  questionCount: number;
  estimatedTime: number;
  skillFocus: SkillDimension;
}

// ============================================
// Feedback levels
// ============================================

export type FeedbackLevel = 'minimal' | 'balanced' | 'detailed';

export interface FeedbackSpec {
  level: FeedbackLevel;
  includeRubric: boolean;
  includeSuggestions: boolean;
  includeModelAnswer: boolean;
  highlightErrors: boolean;
  positiveReinforcement: boolean;
}

// ============================================
// Tutor session record (for persistence)
// ============================================

export interface TutorSessionRecord {
  id?: string;
  studentId: string;
  sessionId: string;
  action: TutorActionType;
  inputContext: string;  // JSON
  outputContent: string; // JSON
  confidence: number;
  learningGain: number;
  createdAt: string;
}
