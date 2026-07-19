// Sprint 23: Learning Analytics Platform — barrel exports
export type {
  TimeGranularity, ProgressTimeline, TimelinePoint,
  LearningStatistics, SkillStatistics,
  MasteryTrend, MasteryTrendPoint,
  WeaknessTrend, WeaknessTrendPoint,
  VocabularyGrowth, VocabularyGrowthPoint,
  WritingGrowth, WritingGrowthPoint,
  ReadingGrowth, ReadingGrowthPoint,
  Prediction, RiskAssessment, AchievementForecast,
  HeatmapData, RadarChartData, TrendLineData, LearningVelocity,
} from './types';

export {
  buildProgressTimeline, buildLearningStatistics,
  buildMasteryTrend, buildWeaknessTrend,
  buildVocabularyGrowth, buildWritingGrowth,
  buildReadingGrowth, buildPrediction,
  generateHeatmap, generateRadarChart,
  generateTrendLines, generateLearningVelocity,
} from './services/learning-analytics';

export type {
  AnalyticsInput, PracticeRecord, MistakeRecord,
  VocabRecord, WritingRecord, ReadingRecord,
  SessionRecord, MasterySnapshot,
} from './services/learning-analytics';
