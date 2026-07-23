// Sprint 26: Curriculum Engine — types
import type { SkillDimension } from '@/modules/student/profile/types';
import type { CEFRLevel, HKDSELevel } from '@/modules/knowledge-graph/types';

export type CurriculumType = 'hkdse' | 'cefr' | 'custom';

// ============================================
// Curriculum Hierarchy
// ============================================

export interface Curriculum {
  id: string;
  name: string;
  nameZh: string;
  type: CurriculumType;
  description: string;
  descriptionZh: string;
  gradeLevels: HKDSELevel[];
  cefrRange: { from: CEFRLevel; to: CEFRLevel };
  courses: Course[];
  metadata: CurriculumMetadata;
}

export interface CurriculumMetadata {
  version: string;
  totalCourses: number;
  totalUnits: number;
  totalLessons: number;
  totalEstimatedHours: number;
  lastUpdated: string;
  standardsAlignment: string[];
}

export interface Course {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  order: number;
  skillFocus: SkillDimension;
  gradeLevel: HKDSELevel;
  cefrLevel: CEFRLevel;
  estimatedHours: number;
  units: Unit[];
  prerequisites: string[];    // Course IDs that must be completed first
  knowledgeNodeIds: string[];  // Links to Knowledge Graph nodes
  completionRule: CompletionRule;
  masteryRule: MasteryRule;
}

export interface Unit {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  order: number;
  estimatedHours: number;
  lessons: Lesson[];
  learningObjectives: LearningObjective[];
  knowledgeMapping: KnowledgeMapping[];
  prerequisites: string[];     // Unit IDs
}

export interface Lesson {
  id: string;
  name: string;
  nameZh: string;
  type: LessonType;
  estimatedMinutes: number;
  content: LessonContent;
  learningObjectives: LearningObjective[];
  knowledgeMapping: KnowledgeMapping[];
  completionRule: CompletionRule;
}

export type LessonType = 'instruction' | 'practice' | 'assessment' | 'review' | 'project';

export interface LessonContent {
  instructions: string;
  instructionsZh: string;
  examples: string[];
  examplesZh: string[];
  keyPoints: string[];
  keyPointsZh: string[];
  commonMistakes: string[];
  commonMistakesZh: string[];
}

export interface LearningObjective {
  id: string;
  description: string;
  descriptionZh: string;
  bloomLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
  measurable: boolean;
}

export interface KnowledgeMapping {
  knowledgeNodeId: string;
  weight: number;         // 0-1, importance within the lesson
  relationship: 'introduces' | 'practices' | 'assesses' | 'reinforces';
}

export interface CompletionRule {
  type: 'all-lessons' | 'min-lessons' | 'min-score' | 'custom';
  threshold?: number;     // For min-lessons or min-score
  requiredLessonIds?: string[];
}

export interface MasteryRule {
  type: 'accuracy' | 'attempts' | 'composite';
  threshold: number;      // e.g., 70 for accuracy, 5 for attempts
  requiredNodeIds?: string[]; // Knowledge Graph nodes that must be mastered
}

// ============================================
// Student Progress within Curriculum
// ============================================

export interface CurriculumProgress {
  studentId: string;
  curriculumId: string;
  startedAt: string;
  lastActivityAt: string;
  overallProgress: number;        // 0-100
  courseProgress: CourseProgress[];
  recommendations: CurriculumRecommendation[];
}

export interface CourseProgress {
  courseId: string;
  completed: boolean;
  progress: number;               // 0-100
  completedUnits: number;
  totalUnits: number;
  completedLessons: number;
  totalLessons: number;
  masteryScore: number;
  timeSpentMinutes: number;
  startedAt?: string;
  completedAt?: string;
}

export interface CurriculumRecommendation {
  type: 'next-lesson' | 'review' | 'challenge' | 'skip';
  courseId: string;
  unitId: string;
  lessonId: string;
  reason: string;
  reasonZh: string;
  priority: 'must-do' | 'should-do' | 'could-do';
}
