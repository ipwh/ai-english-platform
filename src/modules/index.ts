// v4.1: Unified modules barrel — single entry point for all domain modules
// Previously: src/modules/learning-facade/index.ts (Sprint 40)

// === Learning Domain ===
export { getLearningProfile, updateAfterExercise } from './student-mastery/services/student-mastery-service';
export type { StudentLearningProfile, MasteryEntry, SkillGroupedMastery } from './student-mastery/types';

export { buildWeaknessProfile } from './mistake-intelligence/services/mistake-intelligence-service';
export type { WeaknessProfile, WeaknessItem } from './mistake-intelligence/types';

export { getFullRecommendations, recommendGrammar, recommendVocabulary, recommendWritingTopic } from './recommendation/services/recommendation-engine';
export type { RecommendationResult, ScoredRecommendation } from './recommendation/types';

export { knowledgeGraphService } from './knowledge-graph/services/knowledge-graph-service';
export type { KnowledgeNode, LearningPathResult } from './knowledge-graph/types';

export { executePipeline } from './adaptive-learning/services/adaptive-learning-pipeline';
export type { AdaptiveLearningResult, PipelineStage } from './adaptive-learning/types';

// === Student Domain ===
export { buildVocabProfile } from './vocabulary-intelligence/services/vocabulary-intelligence-service';
export type { VocabularyProfile, VocabWordProfile } from './vocabulary-intelligence/types';

export { analyzeEssay } from './writing-coach/services/writing-coach-heuristic';
export type { WritingCoachResult, BandPrediction, WritingDimensions } from './writing-coach/types';

// === Analytics Domain ===
export { buildStudentTrends, buildTeacherDashboard, buildLearningStats } from './learning-analytics/services/learning-analytics-service';
export type { StudentTrends, TeacherDashboard } from './learning-analytics/types';

// === Teacher Domain ===
export { teacherCopilotService } from './teacher-copilot/services/teacher-copilot-service';

/**
 * AI English Platform v4.1 — Unified Module Barrel
 *
 * @example
 * import { getLearningProfile, buildWeaknessProfile, executePipeline } from '@/modules';
 */

// v5: Facades
export * as TeacherFacade from './teacher';
export * as PlatformFacade from './platform';
