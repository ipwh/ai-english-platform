// Sprint 25: Memory Scoring — decay, relevance, and importance algorithms
import type { LearningMemory, LearningContext } from '../types';
import type { SkillDimension } from '@/modules/profile/types';

// ============================================
// Decay Functions
// ============================================

/** Exponential decay: newer items have higher weight */
export function decayScore(daysAgo: number, halfLife = 7): number {
  return Math.pow(0.5, daysAgo / halfLife);
}

/** Linear recency: 1.0 if today, 0.0 after maxDays */
export function recencyScore(daysAgo: number, maxDays = 30): number {
  return Math.max(0, 1 - daysAgo / maxDays);
}

// ============================================
// Importance Scoring
// ============================================

/** Score a weakness by severity and duration */
export function weaknessSeverity(durationDays: number, errorRate: number): number {
  return Math.min(1, (durationDays / 30) * 0.4 + errorRate * 0.6);
}

/** Score a strength by consistency */
export function strengthConfidence(accuracy: number, consistency: number): number {
  return accuracy * 0.7 + consistency * 0.3;
}

// ============================================
// Memory Context Generation
// ============================================

export function generateLearningContext(
  memory: LearningMemory,
  recentAccuracy: number,
  recentStreak: number,
  recentQuestions: number,
): LearningContext {
  const needsFocus: SkillDimension[] = [];
  const activeSkills: SkillDimension[] = [];

  for (const w of memory.weaknesses.persistentWeaknesses) {
    if (!needsFocus.includes(w.skill)) needsFocus.push(w.skill);
  }
  for (const s of memory.strengths.strongestSkills) {
    if (!activeSkills.includes(s)) activeSkills.push(s);
  }

  const personalizationHints: string[] = [];

  // Grammar hints
  if (memory.grammar.strugglingTopics.length > 0) {
    personalizationHints.push(`Student struggles with: ${memory.grammar.strugglingTopics.map(t => t.topic).join(', ')}`);
  }
  if (memory.grammar.masteredTopics.length > 0) {
    personalizationHints.push(`Student has mastered: ${memory.grammar.masteredTopics.slice(0, 5).join(', ')}`);
  }

  // Vocabulary hints
  personalizationHints.push(`Vocabulary level: ${memory.vocabulary.activeWords} active words, learning at ${memory.vocabulary.vocabularyGrowthRate} words/week`);

  // Writing hints
  if (memory.writingStyle.commonChinglishPatterns.length > 0) {
    personalizationHints.push(`Common Chinglish patterns: ${memory.writingStyle.commonChinglishPatterns.map(p => p.pattern).join(', ')}`);
  }

  // Reading hints
  if (memory.readingPreference.preferredTopics.length > 0) {
    personalizationHints.push(`Preferred reading topics: ${memory.readingPreference.preferredTopics.join(', ')}`);
  }

  // Error hints
  if (memory.recentErrors.errorTrend === 'increasing') {
    personalizationHints.push('Error rate is increasing — recommend review mode');
  }

  const avoidTopics = [
    ...memory.preferredTopics.avoidedTopics,
    ...memory.weaknesses.resolvedWeaknesses.map(w => w.topic),
  ];

  let suggestedDifficulty = 'core';
  if (recentAccuracy < 0.5) suggestedDifficulty = 'remedial';
  else if (recentAccuracy > 0.85) suggestedDifficulty = 'challenge';

  const summary = [
    `Student ${memory.studentId}:`,
    `Grammar: ${memory.grammar.overallGrammarLevel}, mastered ${memory.grammar.masteredTopics.length} topics`,
    `Vocabulary: ${memory.vocabulary.knownWords} words (${memory.vocabulary.activeWords} active)`,
    `Writing: ${memory.writingStyle.organizationalStyle} style, ${memory.writingStyle.averageEssayLength} words avg`,
    `Learning speed: ${memory.learningSpeed.questionsPerDay} Q/day, ${memory.learningSpeed.sessionsPerWeek} sessions/week`,
    `Strengths: ${memory.strengths.strongestSkills.join(', ') || 'none yet'}`,
    `Weaknesses: ${needsFocus.join(', ') || 'none identified'}`,
  ].join('. ');

  return {
    studentId: memory.studentId,
    summary,
    summaryZh: generateChineseSummary(memory),
    keyMetrics: { overallAccuracy: recentAccuracy, streakDays: recentStreak, totalQuestions: recentQuestions, activeSkills, needsFocus },
    personalizationHints,
    avoidTopics,
    suggestedDifficulty,
  };
}

function generateChineseSummary(memory: LearningMemory): string {
  return [
    `學生 ${memory.studentId}：`,
    `文法程度：${memory.grammar.overallGrammarLevel}，已掌握 ${memory.grammar.masteredTopics.length} 個課題`,
    `詞彙量：${memory.vocabulary.knownWords} 個（活躍 ${memory.vocabulary.activeWords} 個）`,
    `寫作風格：${memory.writingStyle.organizationalStyle}，平均 ${memory.writingStyle.averageEssayLength} 字`,
    `學習速度：每日 ${memory.learningSpeed.questionsPerDay} 題，每週 ${memory.learningSpeed.sessionsPerWeek} 次`,
    `強項：${memory.strengths.strongestSkills.join('、') || '暫無'}`,
    `弱項：${memory.weaknesses.persistentWeaknesses.map(w => w.topicZh).join('、') || '暫無'}`,
  ].join('。');
}

// ============================================
// Memory Update Helpers
// ============================================

export function shouldUpdateMemory(memory: LearningMemory, threshold = 7): boolean {
  const daysSinceUpdate = (Date.now() - memory.updatedAt.getTime()) / 86400000;
  return daysSinceUpdate >= threshold;
}

export function calculateMemoryFreshness(memory: LearningMemory): number {
  const daysSinceUpdate = (Date.now() - memory.updatedAt.getTime()) / 86400000;
  return Math.max(0, 1 - daysSinceUpdate / 30);
}

export function estimateMemorySize(memory: LearningMemory): number {
  const json = JSON.stringify(memory);
  return json.length; // bytes
}
