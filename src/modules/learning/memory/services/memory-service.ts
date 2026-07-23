// Sprint 25: Memory Service — business logic for learning memory
import { memoryRepo } from '../repositories/memory-repository';
import { generateLearningContext, shouldUpdateMemory, decayScore } from './memory-scoring';
import type { LearningMemory, LearningContext, GrammarMemory, VocabularyMemory, WritingStyleMemory, ReadingPreferenceMemory, LearningSpeedMemory, PreferredTopicsMemory, WeaknessMemory, StrengthMemory, RecentErrorsMemory, ReviewHistoryMemory } from '../types';
import type { SkillDimension } from '@/modules/profile/types';

export function createEmptyMemory(studentId: string): LearningMemory {
  return {
    studentId, createdAt: new Date(), updatedAt: new Date(), version: 1,
    grammar: createEmptyGrammar(),
    vocabulary: createEmptyVocabulary(),
    writingStyle: createEmptyWritingStyle(),
    readingPreference: createEmptyReadingPreference(),
    learningSpeed: createEmptyLearningSpeed(),
    preferredTopics: createEmptyPreferredTopics(),
    weaknesses: createEmptyWeaknesses(),
    strengths: createEmptyStrengths(),
    recentErrors: createEmptyRecentErrors(),
    reviewHistory: createEmptyReviewHistory(),
  };
}

function createEmptyGrammar(): GrammarMemory {
  return { masteredTopics: [], strugglingTopics: [], recommendedFocus: [], commonMistakeTypes: [], overallGrammarLevel: 'A2' };
}
function createEmptyVocabulary(): VocabularyMemory {
  return { knownWords: 0, activeWords: 0, passiveWords: 0, recentlyLearned: [], frequentlyConfused: [], preferredDifficulty: 'core', vocabularyGrowthRate: 0 };
}
function createEmptyWritingStyle(): WritingStyleMemory {
  return { averageEssayLength: 0, preferredTextTypes: [], commonChinglishPatterns: [], vocabularyRichness: 0, sentenceComplexity: 0, organizationalStyle: 'basic', frequentMistakes: [] };
}
function createEmptyReadingPreference(): ReadingPreferenceMemory {
  return { preferredTopics: [], preferredTextTypes: [], averageReadingSpeed: 0, comprehensionLevel: 'A2', challengingTopics: [], preferredDifficulty: 'core' };
}
function createEmptyLearningSpeed(): LearningSpeedMemory {
  return { questionsPerDay: 0, sessionsPerWeek: 0, averageSessionDuration: 0, consistencyScore: 0, bestStudyTime: 'afternoon', streakRecord: 0, completionRate: 0 };
}
function createEmptyPreferredTopics(): PreferredTopicsMemory {
  return { topTopics: [], avoidedTopics: [], topicDiversity: 0, recommendedNewTopics: [] };
}
function createEmptyWeaknesses(): WeaknessMemory {
  return { persistentWeaknesses: [], emergingWeaknesses: [], resolvedWeaknesses: [], weakestSkills: [] };
}
function createEmptyStrengths(): StrengthMemory {
  return { strongestSkills: [], topPerformingTopics: [], consistentStrengths: [] };
}
function createEmptyRecentErrors(): RecentErrorsMemory {
  return { last10Errors: [], errorFrequency: {}, mostRecentErrorCategory: '', errorTrend: 'stable' };
}
function createEmptyReviewHistory(): ReviewHistoryMemory {
  return { totalReviews: 0, reviewsThisWeek: 0, averageReviewScore: 0, overdueReviews: 0, nextReviewDates: [], reviewStreak: 0 };
}

// ============================================
// Memory Service
// ============================================

class MemoryService {
  /** Get or create memory for a student */
  getMemory(studentId: string): LearningMemory {
    return memoryRepo.get(studentId);
  }

  /** Save updated memory */
  saveMemory(studentId: string, memory: LearningMemory): void {
    memoryRepo.save(studentId, memory);
  }

  /** Generate learning context for prompt injection */
  getContext(studentId: string, recentAccuracy = 0.7, recentStreak = 0, recentQuestions = 0): LearningContext {
    const memory = this.getMemory(studentId);
    return generateLearningContext(memory, recentAccuracy, recentStreak, recentQuestions);
  }

  // ============================================
  // Update Methods
  // ============================================

  /** Record a grammar practice result */
  recordGrammarResult(studentId: string, topic: string, topicZh: string, correct: boolean): void {
    const mem = this.getMemory(studentId);
    const existing = mem.grammar.strugglingTopics.find(t => t.topic === topic);
    if (!correct) {
      if (existing) {
        existing.errorRate = Math.round(((existing.errorRate * 10) + 1) / 11 * 100) / 100;
        existing.lastPracticed = new Date().toISOString().slice(0, 10);
      } else {
        mem.grammar.strugglingTopics.push({ topic, topicZh, errorRate: 1, lastPracticed: new Date().toISOString().slice(0, 10) });
      }
    } else {
      if (existing) {
        existing.errorRate = Math.round((existing.errorRate * 10) / 11 * 100) / 100;
        if (existing.errorRate < 0.2) {
          mem.grammar.strugglingTopics = mem.grammar.strugglingTopics.filter(t => t.topic !== topic);
          if (!mem.grammar.masteredTopics.includes(topic)) {
            mem.grammar.masteredTopics.push(topic);
          }
        }
      } else {
        if (!mem.grammar.masteredTopics.includes(topic)) {
          mem.grammar.masteredTopics.push(topic);
        }
      }
    }
    this.saveMemory(studentId, mem);
  }

  /** Record vocabulary learned */
  recordVocabulary(studentId: string, word: string, masteryStars: number): void {
    const mem = this.getMemory(studentId);
    mem.vocabulary.recentlyLearned.unshift({ word, addedAt: new Date().toISOString(), masteryStars });
    mem.vocabulary.recentlyLearned = mem.vocabulary.recentlyLearned.slice(0, 50);
    mem.vocabulary.knownWords++;
    if (masteryStars >= 3) mem.vocabulary.activeWords++;
    if (masteryStars < 3) mem.vocabulary.passiveWords++;
    this.saveMemory(studentId, mem);
  }

  /** Record a writing submission */
  recordWriting(studentId: string, wordCount: number, textType: string): void {
    const mem = this.getMemory(studentId);
    const prev = mem.writingStyle;
    const total = prev.averageEssayLength * 0.7 + wordCount * 0.3;
    mem.writingStyle.averageEssayLength = Math.round(total);
    if (!mem.writingStyle.preferredTextTypes.includes(textType)) {
      mem.writingStyle.preferredTextTypes.push(textType);
    }
    this.saveMemory(studentId, mem);
  }

  /** Record a reading session */
  recordReading(studentId: string, topic: string, wpm: number): void {
    const mem = this.getMemory(studentId);
    if (!mem.readingPreference.preferredTopics.includes(topic)) {
      mem.readingPreference.preferredTopics.push(topic);
    }
    mem.readingPreference.averageReadingSpeed = Math.round(mem.readingPreference.averageReadingSpeed * 0.7 + wpm * 0.3);
    this.saveMemory(studentId, mem);
  }

  /** Record learning session stats */
  recordSession(studentId: string, durationMinutes: number, questionsAnswered: number): void {
    const mem = this.getMemory(studentId);
    mem.learningSpeed.averageSessionDuration = Math.round(mem.learningSpeed.averageSessionDuration * 0.7 + durationMinutes * 0.3);
    mem.learningSpeed.questionsPerDay = Math.round(mem.learningSpeed.questionsPerDay * 0.7 + questionsAnswered * 0.3);
    mem.learningSpeed.sessionsPerWeek = Math.min(7, mem.learningSpeed.sessionsPerWeek + 1);
    this.saveMemory(studentId, mem);
  }

  /** Record an error */
  recordError(studentId: string, question: string, studentAnswer: string, correctAnswer: string, category: string): void {
    const mem = this.getMemory(studentId);
    mem.recentErrors.last10Errors.unshift({
      question: question.slice(0, 100), studentAnswer: studentAnswer.slice(0, 50),
      correctAnswer, category, timestamp: new Date().toISOString(),
    });
    mem.recentErrors.last10Errors = mem.recentErrors.last10Errors.slice(0, 10);
    mem.recentErrors.errorFrequency[category] = (mem.recentErrors.errorFrequency[category] || 0) + 1;
    mem.recentErrors.mostRecentErrorCategory = category;
    this.saveMemory(studentId, mem);
  }

  /** Update weaknesses based on practice data */
  updateWeaknesses(studentId: string, skillAccuracy: Record<SkillDimension, number>): void {
    const mem = this.getMemory(studentId);
    const weakSkills: SkillDimension[] = [];
    for (const [skill, acc] of Object.entries(skillAccuracy) as [SkillDimension, number][]) {
      if (acc < 0.6) {
        weakSkills.push(skill);
        const existing = mem.weaknesses.persistentWeaknesses.find(w => w.topic === skill);
        if (!existing) {
          mem.weaknesses.persistentWeaknesses.push({
            skill, topic: skill, topicZh: skill, duration: 1, severity: acc < 0.4 ? 'critical' : 'major',
          });
        }
      }
    }
    mem.weaknesses.weakestSkills = weakSkills;
    mem.strengths.strongestSkills = (Object.entries(skillAccuracy) as [SkillDimension, number][])
      .filter(([, acc]) => acc >= 0.8)
      .map(([skill]) => skill);
    this.saveMemory(studentId, mem);
  }

  /** Check if memory needs refresh */
  needsRefresh(studentId: string): boolean {
    const mem = this.getMemory(studentId);
    return shouldUpdateMemory(mem);
  }

  /** Get memory freshness score */
  getFreshness(studentId: string): number {
    const mem = this.getMemory(studentId);
    return Math.round((Date.now() - mem.updatedAt.getTime()) / 3600000);
  }

  /** Delete a student's memory */
  deleteMemory(studentId: string): void {
    memoryRepo.delete(studentId);
  }
}

export const memoryService = new MemoryService();
