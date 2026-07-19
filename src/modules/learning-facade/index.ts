// Sprint 40: LearningFacade — unified entry point for the Learning Intelligence Platform v4
// Aggregates all public APIs from Sprints 31-39. No new business logic.

// === Student Mastery (S31) ===
export { getLearningProfile, updateAfterExercise } from '@/modules/student-mastery/services/student-mastery-service';
export type { StudentLearningProfile, MasteryEntry, SkillGroupedMastery } from '@/modules/student-mastery/types';

// === Mistake Intelligence (S32) ===
export { buildWeaknessProfile } from '@/modules/mistake-intelligence/services/mistake-intelligence-service';
export type { WeaknessProfile, WeaknessItem } from '@/modules/mistake-intelligence/types';

// === Recommendation V2 (S33) ===
export { getFullRecommendations, recommendGrammar, recommendVocabulary, recommendWritingTopic } from '@/modules/recommendation-v2/services/recommendation-engine';
export type { RecommendationResult, ScoredRecommendation } from '@/modules/recommendation-v2/types';

// === Knowledge Graph (S34) ===
export { knowledgeGraphService } from '@/modules/knowledge-graph/services/knowledge-graph-service';
export type { KnowledgeNode, LearningPathResult } from '@/modules/knowledge-graph/types';

// === Vocabulary Intelligence (S35) ===
export { buildVocabProfile } from '@/modules/vocabulary-intelligence/services/vocabulary-intelligence-service';
export type { VocabularyProfile, VocabWordProfile } from '@/modules/vocabulary-intelligence/types';

// === Writing Coach V2 (S36) ===
export { analyzeEssay } from '@/modules/writing-coach-v2/services/writing-coach-v2-service';
export type { WritingCoachResult, BandPrediction, WritingDimensions } from '@/modules/writing-coach-v2/types';

// === Learning Analytics (S37) ===
export { buildStudentTrends, buildTeacherDashboard, buildLearningStats } from '@/modules/learning-analytics/services/learning-analytics-service';
export type { StudentTrends, TeacherDashboard } from '@/modules/learning-analytics/types';

// === Teacher Copilot (S38) ===
export { teacherCopilotService } from '@/modules/teacher-copilot/services/teacher-copilot-service';

// === Adaptive Learning Pipeline (S39) ===
export { executePipeline } from '@/modules/adaptive-learning/services/adaptive-learning-pipeline';
export type { AdaptiveLearningResult, PipelineStage } from '@/modules/adaptive-learning/types';

/**
 * Learning Intelligence Platform v4
 *
 * Unified facade for all learning modules.
 * Import from here for any learning-related functionality.
 *
 * @example
 * import { getLearningProfile, buildWeaknessProfile, executePipeline } from '@/modules/learning-facade';
 */
