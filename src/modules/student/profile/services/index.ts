// Sprint 8: Student Learning Profile — barrel
export type {
  StudentLearningProfile, SkillDimension, SkillStats, SubSkillStat,
  TopicPreference, LearningSpeed,
} from '../types';

export { generateProfile, type ProfileInput } from './profile-service';
export { aggregateSkillStats, mapToDimension, type PracticeRecord } from './skill-tracker';
export { analyzeTopicPreferences, type TopicEngagement } from './topic-preferences';
export { calculateLearningSpeed, type SessionRecord } from './learning-speed';
