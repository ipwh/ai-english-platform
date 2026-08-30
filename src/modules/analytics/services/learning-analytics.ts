import type { SkillDimension } from '@/modules/student/profile/types';

const SKILL_DIMS: SkillDimension[] = ['grammar', 'vocabulary', 'reading', 'writing', 'listening', 'speaking'];
// Sprint 23: Learning Analytics Service — main facade
import type {
  TimeGranularity, ProgressTimeline, TimelinePoint,
  LearningStatistics, MasteryTrend, MasteryTrendPoint,
  WeaknessTrend, WeaknessTrendPoint,
  VocabularyGrowth, VocabularyGrowthPoint,
  WritingGrowth, WritingGrowthPoint,
  ReadingGrowth, ReadingGrowthPoint,
  Prediction, HeatmapData, RadarChartData,
  TrendLineData, LearningVelocity,
  SkillStatistics,
} from '../types';


// ============================================
// Input Interfaces
// ============================================

export interface AnalyticsInput {
  studentId: string;
  gradeLevel: string;
  practiceHistory: PracticeRecord[];
  mistakeHistory: MistakeRecord[];
  vocabularyHistory: VocabRecord[];
  writingHistory: WritingRecord[];
  readingHistory: ReadingRecord[];
  sessionHistory: SessionRecord[];
  masterySnapshots: MasterySnapshot[];
}

export interface PracticeRecord {
  date: string; skillId: string; skill: SkillDimension;
  correct: boolean; difficulty: string; timeSpentSeconds: number;
  xpEarned: number;
}

export interface MistakeRecord {
  date: string; category: string; categoryZh: string;
  grammarPoint?: string; severity: 'critical' | 'major' | 'minor';
}

export interface VocabRecord {
  date: string; word: string; action: 'added' | 'reviewed' | 'mastered';
  masteryStars: number;
}

export interface WritingRecord {
  date: string; essayId: string;
  contentScore: number; languageScore: number; organizationScore: number;
  wordCount: number; chinglishIssues: number; vocabUpgrades: number;
}

export interface ReadingRecord {
  date: string; passageId: string;
  questionsAnswered: number; correctCount: number;
  readTimeSeconds: number; comprehensionScore: number;
}

export interface SessionRecord {
  date: string; durationMinutes: number;
  questionsAnswered: number; correctCount: number;
}

export interface MasterySnapshot {
  date: string; skillId: string; skillName: string; skillNameZh: string;
  dimension: SkillDimension; masteryScore: number; accuracy: number;
  totalAttempts: number;
}

// ============================================
// Helpers
// ============================================

function filterByPeriod<T extends { date: string }>(
  records: T[], start: string, end: string
): T[] {
  return records.filter(r => r.date >= start && r.date <= end);
}

function getDateRange(granularity: TimeGranularity, now: Date): { start: string; end: string } {
  const d = new Date(now);
  const end = d.toISOString().slice(0, 10);
  const start = new Date(d);
  switch (granularity) {
    case 'daily': start.setDate(d.getDate() - 1); break;
    case 'weekly': start.setDate(d.getDate() - 7); break;
    case 'monthly': start.setMonth(d.getMonth() - 1); break;
    case 'semester': start.setMonth(d.getMonth() - 6); break;
    case 'yearly': start.setFullYear(d.getFullYear() - 1); break;
  }
  return { start: start.toISOString().slice(0, 10), end };
}

function generateTimelineLabels(
  granularity: TimeGranularity, start: string, end: string
): { dates: string[]; labels: string[] } {
  const dates: string[] = [];
  const labels: string[] = [];
  const s = new Date(start), e = new Date(end);
  const current = new Date(s);

  while (current <= e) {
    const iso = current.toISOString().slice(0, 10);
    dates.push(iso);
    switch (granularity) {
      case 'daily': labels.push(`${current.getMonth() + 1}/${current.getDate()}`); break;
      case 'weekly': labels.push(`W${Math.ceil(current.getDate() / 7)}`); break;
      default: labels.push(`${current.getMonth() + 1}/${current.getDate()}`); break;
    }
    switch (granularity) {
      case 'daily': current.setDate(current.getDate() + 1); break;
      case 'weekly': current.setDate(current.getDate() + 7); break;
      case 'monthly': current.setMonth(current.getMonth() + 1); break;
      case 'semester': current.setMonth(current.getMonth() + 1); break;
      case 'yearly': current.setMonth(current.getMonth() + 3); break;
    }
  }
  return { dates, labels };
}

// ============================================
// Progress Timeline
// ============================================

export function buildProgressTimeline(
  input: AnalyticsInput, granularity: TimeGranularity, now = new Date()
): ProgressTimeline {
  const { start, end } = getDateRange(granularity, now);
  const { dates, labels } = generateTimelineLabels(granularity, start, end);

  const points: TimelinePoint[] = dates.map((date, i) => {
    const practices = filterByPeriod(input.practiceHistory, date, dates[i + 1] || end);
    const sessions = filterByPeriod(input.sessionHistory, date, dates[i + 1] || end);
    const vocab = filterByPeriod(input.vocabularyHistory, date, dates[i + 1] || end);
    const mistakes = filterByPeriod(input.mistakeHistory, date, dates[i + 1] || end);

    const correct = practices.filter(p => p.correct).length;
    return {
      date,
      label: labels[i] || date,
      questionsAnswered: practices.length,
      correctCount: correct,
      accuracy: practices.length > 0 ? correct / practices.length : 0,
      xpEarned: practices.reduce((s, p) => s + p.xpEarned, 0),
      timeSpentMinutes: Math.round(practices.reduce((s, p) => s + p.timeSpentSeconds, 0) / 60),
      sessionsCompleted: sessions.length,
      newVocabulary: vocab.filter(v => v.action === 'added').length,
      mistakesMade: mistakes.length,
    };
  });

  const allPractices = filterByPeriod(input.practiceHistory, start, end);
  const allCorrect = allPractices.filter(p => p.correct).length;

  return {
    studentId: input.studentId, granularity, startDate: start, endDate: end,
    points,
    summary: {
      totalQuestions: allPractices.length,
      totalCorrect: allCorrect,
      overallAccuracy: allPractices.length > 0 ? allCorrect / allPractices.length : 0,
      totalXp: allPractices.reduce((s, p) => s + p.xpEarned, 0),
      totalTimeMinutes: Math.round(allPractices.reduce((s, p) => s + p.timeSpentSeconds, 0) / 60),
      totalSessions: filterByPeriod(input.sessionHistory, start, end).length,
      totalVocabulary: filterByPeriod(input.vocabularyHistory, start, end).filter(v => v.action === 'added').length,
      totalMistakes: filterByPeriod(input.mistakeHistory, start, end).length,
    },
  };
}

// ============================================
// Learning Statistics
// ============================================

export function buildLearningStatistics(
  input: AnalyticsInput, granularity: TimeGranularity, now = new Date()
): LearningStatistics {
  const { start, end } = getDateRange(granularity, now);
  const practices = filterByPeriod(input.practiceHistory, start, end);
  const sessions = filterByPeriod(input.sessionHistory, start, end);
  const correct = practices.filter(p => p.correct).length;

  const bySkill = {} as Record<SkillDimension, SkillStatistics>;
  const skillDims = SKILL_DIMS;
  for (const dim of skillDims) {
    const dimP = practices.filter(p => p.skill === dim);
    const dimC = dimP.filter(p => p.correct).length;
    const masteryPoints = input.masterySnapshots.filter(m => m.dimension === dim);
    const latest = masteryPoints[masteryPoints.length - 1];
    const earliest = masteryPoints[0];
    const trend: SkillStatistics['trend'] = latest && earliest
      ? (latest.masteryScore > earliest.masteryScore + 5 ? 'improving' : latest.masteryScore < earliest.masteryScore - 5 ? 'declining' : 'stable')
      : 'stable';
    bySkill[dim] = {
      questions: dimP.length, correct: dimC,
      accuracy: dimP.length > 0 ? dimC / dimP.length : 0,
      masteryScore: latest?.masteryScore ?? 0,
      trend,
      timeSpentMinutes: Math.round(dimP.reduce((s, p) => s + p.timeSpentSeconds, 0) / 60),
    };
  }

  const byDifficulty: Record<string, { questions: number; correct: number; accuracy: number }> = {};
  for (const diff of ['remedial', 'core', 'challenge']) {
    const dP = practices.filter(p => p.difficulty === diff);
    const dC = dP.filter(p => p.correct).length;
    byDifficulty[diff] = { questions: dP.length, correct: dC, accuracy: dP.length > 0 ? dC / dP.length : 0 };
  }

  return {
    studentId: input.studentId,
    generatedAt: now,
    period: { start, end, granularity },
    overview: {
      totalQuestions: practices.length, totalCorrect: correct,
      overallAccuracy: practices.length > 0 ? correct / practices.length : 0,
      totalSessions: sessions.length,
      totalTimeMinutes: Math.round(practices.reduce((s, p) => s + p.timeSpentSeconds, 0) / 60),
      activeDays: new Set(practices.map(p => p.date)).size,
      streakDays: 0, totalXp: 0, currentLevel: 1,
    },
    bySkill,
    byDifficulty,
    comparisons: {
      vsPreviousPeriod: { accuracyChange: 0, questionsChange: 0, sessionsChange: 0, masteryChange: 0 },
      vsPeers: null,
    },
  };
}

// ============================================
// Mastery Trend
// ============================================

export function buildMasteryTrend(
  input: AnalyticsInput, granularity: TimeGranularity, now = new Date()
): MasteryTrend {
  const { start, end } = getDateRange(granularity, now);
  const snapshots = filterByPeriod(input.masterySnapshots, start, end);

  const points: MasteryTrendPoint[] = snapshots.map(s => ({
    date: s.date, skillId: s.skillId, skillName: s.skillName,
    skillNameZh: s.skillNameZh, dimension: s.dimension,
    masteryScore: s.masteryScore, accuracy: s.accuracy, totalAttempts: s.totalAttempts,
  }));

  const bySkill = new Map<string, MasteryTrendPoint[]>();
  for (const p of points) {
    if (!bySkill.has(p.skillId)) bySkill.set(p.skillId, []);
    bySkill.get(p.skillId)!.push(p);
  }

  const changes: Array<{ skillId: string; name: string; nameZh: string; change: number }> = [];
  for (const [skillId, pts] of bySkill) {
    if (pts.length >= 2) {
      const change = pts[pts.length - 1].masteryScore - pts[0].masteryScore;
      changes.push({ skillId, name: pts[0].skillName, nameZh: pts[0].skillNameZh, change });
    }
  }
  changes.sort((a, b) => b.change - a.change);

  const improving = changes.filter(c => c.change > 0).slice(0, 3);
  const declining = changes.filter(c => c.change < 0).slice(0, 3);
  const avgChange = changes.length > 0 ? changes.reduce((s, c) => s + c.change, 0) / changes.length : 0;

  return {
    studentId: input.studentId, granularity, points,
    topImproving: improving.map(c => ({ skillId: c.skillId, name: c.name, nameZh: c.nameZh, change: c.change })),
    topDeclining: declining.map(c => ({ skillId: c.skillId, name: c.name, nameZh: c.nameZh, change: c.change })),
    overallTrend: avgChange > 3 ? 'improving' : avgChange < -3 ? 'declining' : 'stable',
  };
}

// ============================================
// Weakness Trend
// ============================================

export function buildWeaknessTrend(
  input: AnalyticsInput, granularity: TimeGranularity, now = new Date()
): WeaknessTrend {
  const { start, end } = getDateRange(granularity, now);
  const mistakes = filterByPeriod(input.mistakeHistory, start, end);
  const { dates } = generateTimelineLabels(granularity, start, end);

  const points: WeaknessTrendPoint[] = [];
  const byCategory = new Map<string, { mistakes: number; total: number }>();

  for (let i = 0; i < dates.length; i++) {
    const periodEnd = dates[i + 1] || end;
    const periodMistakes = mistakes.filter(m => m.date >= dates[i] && m.date < periodEnd);
    const periodPractices = filterByPeriod(input.practiceHistory, dates[i], periodEnd);

    // Group by category
    const catMap = new Map<string, { count: number; zh: string; severity: string }>();
    for (const m of periodMistakes) {
      const existing = catMap.get(m.category) || { count: 0, zh: m.categoryZh, severity: m.severity };
      existing.count++;
      catMap.set(m.category, existing);
    }

    for (const [cat, info] of catMap) {
      const existing = byCategory.get(cat) || { mistakes: 0, total: 0 };
      existing.mistakes += info.count;
      byCategory.set(cat, existing);

      points.push({
        date: dates[i], category: cat, categoryZh: info.zh,
        mistakeCount: info.count,
        totalAttempts: periodPractices.length,
        errorRate: periodPractices.length > 0 ? info.count / periodPractices.length : 0,
        severity: info.severity as 'critical' | 'major' | 'minor',
      });
    }

    for (const [cat, info] of byCategory) {
      info.total += periodPractices.length;
    }
  }

  const persistent: WeaknessTrend['persistentWeaknesses'] = [];
  const resolved: WeaknessTrend['resolvedWeaknesses'] = [];
  for (const [cat, info] of byCategory) {
    if (info.mistakes >= 5) {
      persistent.push({ category: cat, categoryZh: '', duration: dates.length, avgErrorRate: info.total > 0 ? info.mistakes / info.total : 0 });
    } else if (info.mistakes === 0) {
      resolved.push({ category: cat, categoryZh: '', resolvedAt: end });
    }
  }

  return { studentId: input.studentId, granularity, points, persistentWeaknesses: persistent, resolvedWeaknesses: resolved, emergingWeaknesses: [] };
}

// ============================================
// Vocabulary Growth
// ============================================

export function buildVocabularyGrowth(
  input: AnalyticsInput, granularity: TimeGranularity, now = new Date()
): VocabularyGrowth {
  const { start, end } = getDateRange(granularity, now);
  const vocab = filterByPeriod(input.vocabularyHistory, start, end);
  const { dates } = generateTimelineLabels(granularity, start, end);

  let runningTotal = 0, runningMastered = 0, runningLearning = 0;
  const points: VocabularyGrowthPoint[] = [];

  for (let i = 0; i < dates.length; i++) {
    const periodEnd = dates[i + 1] || end;
    const periodVocab = vocab.filter(v => v.date >= dates[i] && v.date < periodEnd);

    const added = periodVocab.filter(v => v.action === 'added').length;
    const reviewed = periodVocab.filter(v => v.action === 'reviewed').length;
    const mastered = periodVocab.filter(v => v.action === 'mastered').length;
    const avgMastery = periodVocab.length > 0
      ? periodVocab.reduce((s, v) => s + v.masteryStars, 0) / periodVocab.length : 0;

    runningTotal += added;
    runningMastered += mastered;
    runningLearning = runningTotal - runningMastered;

    points.push({
      date: dates[i], totalWords: runningTotal, newWords: added,
      masteredWords: runningMastered, learningWords: runningLearning,
      reviewedWords: reviewed, averageMastery: avgMastery,
    });
  }

  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const weeksActive = Math.max(1, (new Date(end).getTime() - new Date(start).getTime()) / (7 * 86400000));

  return {
    studentId: input.studentId, granularity, points,
    summary: {
      totalVocabulary: lastPoint?.totalWords ?? 0,
      masteredCount: lastPoint?.masteredWords ?? 0,
      learningCount: lastPoint?.learningWords ?? 0,
      newCount: firstPoint?.newWords ?? 0,
      averageMasteryStars: lastPoint?.averageMastery ?? 0,
      reviewsDue: 0,
      growthRate: Math.round(((lastPoint?.totalWords ?? 0) - (firstPoint?.totalWords ?? 0)) / weeksActive),
    },
    topWords: [],
  };
}

// ============================================
// Writing Growth
// ============================================

export function buildWritingGrowth(
  input: AnalyticsInput, granularity: TimeGranularity, now = new Date()
): WritingGrowth {
  const { start, end } = getDateRange(granularity, now);
  const writings = filterByPeriod(input.writingHistory, start, end);
  const { dates } = generateTimelineLabels(granularity, start, end);

  const points: WritingGrowthPoint[] = dates.map((date, i) => {
    const periodEnd = dates[i + 1] || end;
    const periodW = writings.filter(w => w.date >= date && w.date < periodEnd);
    const n = periodW.length || 1;
    return {
      date,
      essaysSubmitted: periodW.length,
      averageContentScore: periodW.reduce((s, w) => s + w.contentScore, 0) / n,
      averageLanguageScore: periodW.reduce((s, w) => s + w.languageScore, 0) / n,
      averageOrganizationScore: periodW.reduce((s, w) => s + w.organizationScore, 0) / n,
      averageTotalScore: periodW.reduce((s, w) => s + w.contentScore + w.languageScore + w.organizationScore, 0) / n,
      wordCount: periodW.reduce((s, w) => s + w.wordCount, 0),
      chinglishIssuesFound: periodW.reduce((s, w) => s + w.chinglishIssues, 0),
      vocabularyUpgradesSuggested: periodW.reduce((s, w) => s + w.vocabUpgrades, 0),
    };
  });

  const scores = writings.map(w => w.contentScore + w.languageScore + w.organizationScore);
  const bestScore = scores.length > 0 ? Math.max(...scores) : 0;
  const firstScore = writings.length > 0 ? scores[0] : 0;
  const lastScore = writings.length > 0 ? scores[scores.length - 1] : 0;

  return {
    studentId: input.studentId, granularity, points,
    summary: {
      totalEssays: writings.length,
      averageCLOScore: scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length * 10) / 10 : 0,
      bestScore,
      totalWordsWritten: writings.reduce((s, w) => s + w.wordCount, 0),
      improvementRate: writings.length >= 2 ? Math.round((lastScore - firstScore) / writings.length * 10) / 10 : 0,
    },
  };
}

// ============================================
// Reading Growth
// ============================================

export function buildReadingGrowth(
  input: AnalyticsInput, granularity: TimeGranularity, now = new Date()
): ReadingGrowth {
  const { start, end } = getDateRange(granularity, now);
  const readings = filterByPeriod(input.readingHistory, start, end);
  const { dates } = generateTimelineLabels(granularity, start, end);

  const points: ReadingGrowthPoint[] = dates.map((date, i) => {
    const periodEnd = dates[i + 1] || end;
    const periodR = readings.filter(r => r.date >= date && r.date < periodEnd);
    const correct = periodR.reduce((s, r) => s + r.correctCount, 0);
    const total = periodR.reduce((s, r) => s + r.questionsAnswered, 0);
    return {
      date, passagesRead: periodR.length,
      questionsAnswered: total,
      correctCount: correct,
      accuracy: total > 0 ? correct / total : 0,
      averageReadTime: periodR.length > 0 ? Math.round(periodR.reduce((s, r) => s + r.readTimeSeconds, 0) / periodR.length) : 0,
      comprehensionScore: periodR.length > 0 ? Math.round(periodR.reduce((s, r) => s + r.comprehensionScore, 0) / periodR.length) : 0,
    };
  });

  return {
    studentId: input.studentId, granularity, points,
    summary: {
      totalPassages: readings.length,
      totalQuestions: readings.reduce((s, r) => s + r.questionsAnswered, 0),
      overallAccuracy: (() => { const c = readings.reduce((s, r) => s + r.correctCount, 0); const t = readings.reduce((s, r) => s + r.questionsAnswered, 0); return t > 0 ? c / t : 0; })(),
      comprehensionScore: readings.length > 0 ? Math.round(readings.reduce((s, r) => s + r.comprehensionScore, 0) / readings.length) : 0,
      readingSpeed: 0,
    },
  };
}

// ============================================
// Prediction Engine
// ============================================

export function buildPrediction(
  input: AnalyticsInput, targetDays = 30, now = new Date()
): Prediction {
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + targetDays);

  const practices = input.practiceHistory;
  const totalCorrect = practices.filter(p => p.correct).length;
  const currentAccuracy = practices.length > 0 ? totalCorrect / practices.length : 0;

  // Simple linear projection
  const questionsPerDay = practices.length > 0
    ? practices.length / Math.max(1, (now.getTime() - new Date(practices[0].date).getTime()) / 86400000)
    : 0;
  const accuracyGainPerDay = 0.001; // Conservative estimate
  const estimatedAccuracy = Math.min(0.95, currentAccuracy + accuracyGainPerDay * targetDays);
  const estimatedMastery = Math.min(100, 50 + accuracyGainPerDay * targetDays * 50);

  // Vocabulary projection
  const newVocabPerDay = input.vocabularyHistory.filter(v => v.action === 'added').length /
    Math.max(1, (now.getTime() - new Date(input.vocabularyHistory[0]?.date || now).getTime()) / 86400000);
  const currentVocab = input.vocabularyHistory.filter(v => v.action === 'added').length;
  const estimatedVocab = Math.round(currentVocab + newVocabPerDay * targetDays);

  // Risk detection
  const risks = detectRisks(input, practices, now);

  // Achievement forecast
  const achievements = forecastAchievements(input, targetDays);

  return {
    studentId: input.studentId,
    generatedAt: now,
    targetDate: targetDate.toISOString().slice(0, 10),
    predictions: {
      estimatedAccuracy: Math.round(estimatedAccuracy * 100) / 100,
      estimatedMastery: Math.round(estimatedMastery),
      // 2026-08-30 audit: 改名避免與 HKDSE Level (1-5) 混淆 —
      // 這是 1-20 的平台掌握度指數，不是 HKDSE 等級。
      platformMasteryIndex: Math.min(20, Math.floor(estimatedMastery / 5) + 1),
      estimatedVocabulary: estimatedVocab,
      confidenceScore: Math.round((0.5 + Math.min(practices.length / 100, 0.4)) * 100) / 100,
    },
    risks,
    achievements,
    recommendations: [],
  };
}

function detectRisks(
  input: AnalyticsInput, practices: AnalyticsInput['practiceHistory'], now: Date
): Prediction['risks'] {
  const risks: Prediction['risks'] = [];
  const daysSinceLastPractice = practices.length > 0
    ? (now.getTime() - new Date(practices[practices.length - 1].date).getTime()) / 86400000 : 999;

  if (daysSinceLastPractice > 7) {
    risks.push({
      type: 'disengagement', severity: daysSinceLastPractice > 14 ? 'high' : 'medium',
      description: `No practice in ${Math.round(daysSinceLastPractice)} days`,
      descriptionZh: `已 ${Math.round(daysSinceLastPractice)} 天沒有練習`,
      probability: Math.min(0.9, daysSinceLastPractice / 30),
      affectedSkills: ['grammar', 'vocabulary', 'reading', 'writing'],
      mitigationSteps: ['Complete a short practice session today', 'Set a daily reminder'],
    });
  }

  if (input.vocabularyHistory.filter(v => v.action === 'reviewed').length > 10) {
    risks.push({
      type: 'overdue-review', severity: 'medium',
      description: 'Multiple vocabulary items pending review',
      descriptionZh: '多個詞彙項目待複習',
      probability: 0.7, affectedSkills: ['vocabulary'],
      mitigationSteps: ['Start a vocabulary review session', 'Focus on SRS due items'],
    });
  }

  return risks;
}

function forecastAchievements(
  input: AnalyticsInput, targetDays: number
): Prediction['achievements'] {
  const achievements: Prediction['achievements'] = [];
  const practices = input.practiceHistory;
  const correct = practices.filter(p => p.correct).length;

  if (correct < 50) {
    const daysTo50 = Math.max(1, Math.round((50 - correct) / Math.max(1, correct / Math.max(1, practices.length))));
    achievements.push({
      achievement: '50 Correct Answers', achievementZh: '50 題正確',
      estimatedDate: new Date(Date.now() + daysTo50 * 86400000).toISOString().slice(0, 10),
      confidence: 0.6, daysToAchieve: daysTo50,
      progressPercent: Math.round((correct / 50) * 100),
    });
  }

  return achievements;
}

// ============================================
// Chart Generators
// ============================================

export function generateHeatmap(input: AnalyticsInput): HeatmapData {
  const skills = SKILL_DIMS;
  const weeks = ['W1', 'W2', 'W3', 'W4'];
  const data: number[][] = skills.map(skill => {
    const skillPractices = input.practiceHistory.filter(p => p.skill === skill);
    return weeks.map((_, wi) => {
      const weekPractices = skillPractices.filter(p => {
        const d = new Date(p.date);
        return Math.ceil(d.getDate() / 7) === wi + 1;
      });
      const correct = weekPractices.filter(p => p.correct).length;
      return weekPractices.length > 0 ? correct / weekPractices.length : 0;
    });
  });

  return {
    studentId: input.studentId, title: 'Learning Heatmap',
    xLabels: weeks, yLabels: skills,
    data, colorScale: ['#fef0d9', '#fdcc8a', '#d7301f'],
  };
}

export function generateRadarChart(input: AnalyticsInput): RadarChartData {
  const skills = SKILL_DIMS;
  const labels = ['Grammar', 'Vocabulary', 'Reading', 'Writing', 'Listening', 'Speaking'];
  const labelZh = ['文法', '詞彙', '閱讀', '寫作', '聆聽', '口語'];

  const values = skills.map(skill => {
    const sp = input.practiceHistory.filter(p => p.skill === skill);
    const correct = sp.filter(p => p.correct).length;
    return sp.length > 0 ? Math.round((correct / sp.length) * 100) : 0;
  });

  const masteryValues = skills.map(skill => {
    const ms = input.masterySnapshots.filter(m => m.dimension === skill);
    return ms.length > 0 ? ms[ms.length - 1].masteryScore : 0;
  });

  return {
    studentId: input.studentId, labels, labelZh,
    datasets: [
      { label: 'Accuracy', values, color: '#1976d2' },
      { label: 'Mastery', values: masteryValues, color: '#388e3c' },
    ],
    maxValue: 100,
  };
}

export function generateTrendLines(input: AnalyticsInput, granularity: TimeGranularity): TrendLineData {
  const timeline = buildProgressTimeline(input, granularity);
  const masteryTrend = buildMasteryTrend(input, granularity);

  return {
    studentId: input.studentId,
    title: `Learning Trends (${granularity})`,
    xAxis: timeline.points.map(p => p.label),
    series: [
      {
        name: 'Accuracy', nameZh: '正確率',
        data: timeline.points.map(p => Math.round(p.accuracy * 100)),
        trend: 'flat', slope: 0,
      },
      {
        name: 'Questions', nameZh: '題目數',
        data: timeline.points.map(p => p.questionsAnswered),
        trend: 'flat', slope: 0,
      },
    ],
  };
}

export function generateLearningVelocity(input: AnalyticsInput): LearningVelocity {
  const practices = input.practiceHistory;
  const vocab = input.vocabularyHistory;
  const writings = input.writingHistory;

  const daysActive = new Set(practices.map(p => p.date)).size || 1;
  const weeksActive = Math.max(1, daysActive / 7);

  const questionsPerDay = Math.round((practices.length / daysActive) * 10) / 10;
  const vocabularyPerWeek = Math.round((vocab.filter(v => v.action === 'added').length / weeksActive) * 10) / 10;
  const essaysPerMonth = Math.round((writings.length / Math.max(1, weeksActive / 4)) * 10) / 10;

  return {
    studentId: input.studentId,
    metrics: {
      questionsPerDay,
      accuracyGainPerWeek: 1.5,
      masteryGainPerWeek: 2.0,
      vocabularyPerWeek,
      essaysPerMonth,
      xpPerDay: Math.round(practices.reduce((s, p) => s + p.xpEarned, 0) / daysActive),
    },
    vsAverage: {
      questionsPerDay: { value: questionsPerDay, percentile: 50 },
      accuracyGainPerWeek: { value: 1.5, percentile: 50 },
      masteryGainPerWeek: { value: 2.0, percentile: 50 },
    },
    trajectory: questionsPerDay > 5 ? 'accelerating' : questionsPerDay > 2 ? 'steady' : 'decelerating',
  };
}
