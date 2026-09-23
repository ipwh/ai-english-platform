// Sprint 8: Student Learning Profile — barrel
export type {
  StudentLearningProfile, SkillDimension, SkillStats, SubSkillStat,
  TopicPreference, LearningSpeed,
} from '../types';

// 2026-09-23：「generateProfile」已刪除 —— 零 runtime consumer（只有 facade 轉出
// 與自身的測試），而且它的 `overallAccuracy: … : 0` 容許用 0 冒充「無資料」，
// 正是本專案明文禁止的模式。以下元件仍各有自身測試與 facade 轉出。
export { aggregateSkillStats, mapToDimension, type PracticeRecord } from './skill-tracker';
export { analyzeTopicPreferences, type TopicEngagement } from './topic-preferences';
export { calculateLearningSpeed, type SessionRecord } from './learning-speed';
