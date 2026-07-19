// Sprint 26: Curriculum Engine — barrel exports
export type {
  Curriculum, Course, Unit, Lesson, LessonContent, LessonType,
  LearningObjective, KnowledgeMapping, CompletionRule, MasteryRule,
  CurriculumType, CurriculumMetadata,
  CurriculumProgress, CourseProgress, CurriculumRecommendation,
} from './types';

export { curriculumEngine } from './services/curriculum-engine';
export { HKDSE_CURRICULUM } from './data/hkdse-curriculum';
