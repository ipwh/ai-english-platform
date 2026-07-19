// Sprint 26: Curriculum Engine — barrel exports
export type {
  Curriculum, Course, Unit, Lesson, LessonContent, LessonType,
  LearningObjective, KnowledgeMapping, CompletionRule, MasteryRule,
  CurriculumType, CurriculumMetadata,
  CurriculumProgress, CourseProgress, CurriculumRecommendation,
} from './types';

export { curriculumEngine } from './services/curriculum-engine';
export { HKDSE_CURRICULUM } from './data/hkdse-curriculum';

// Enhanced data — official CEFR + HKDSE specifications
export {
  CEFR_GLOBAL_SCALE, CEFR_CAN_DO_DESCRIPTORS,
  getCEFRDescriptors, getCEFRLevelProfile,
} from './data/cefr-descriptors';
export type { CEFRGlobalDescriptor, CEFRCanDo, CEFRSkill } from './data/cefr-descriptors';

export {
  DSE_PAPER_WEIGHTINGS, DSE_LEVEL_DESCRIPTORS, DSE_TEXT_TYPES,
  DSE_PAPER3_TASK_TYPES, DSE_COMMON_TOPICS,
  HKDSE_CEFR_ALIGNMENT, GRADE_EXPECTATIONS,
} from './data/hkdse-enhanced';
export type { DSELevelDescriptor, DSETextType, SkillExpectation } from './data/hkdse-enhanced';
