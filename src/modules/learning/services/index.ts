// Sprint 7: Learning Engine — barrel
export type {
  SkillNode, SkillMastery, StudentPracticeSummary,
  LearningRecommendation, LearningPathStep,
} from '../types';

// Knowledge Graph
export {
  GRAMMAR_GRAPH, getAllSkills, getSkill, getAllPrerequisites,
  getDependents, getSkillsForLevel, topologicalSort,
} from './knowledge-graph';

// Mastery Calculator
export {
  calculateMastery, calculateAllMastery, isMastered,
  type PracticeEntry,
} from './mastery-calculator';

// Weakness Analyzer
export {
  analyzeWeaknesses, getTrueWeaknesses,
  type WeaknessResult,
} from './weakness-analyzer';

// Learning Path
export {
  generateLearningPath, getRecommendedSteps, getNextSkill,
} from './learning-path';

// Adaptive Recommendation
export { getRecommendations } from './adaptive-recommendation';
