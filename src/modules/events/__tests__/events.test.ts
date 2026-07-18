// Sprint 11: Domain Events Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { on, emit, subscriberCount, clearAllSubscriptions } from '../event-bus';
import {
  emitExerciseCompleted, emitEssaySubmitted,
  emitVocabularyLearned, emitAssessmentFinished,
} from '../events/event-emitters';
import { initProgressHandler, getProgressStats, resetProgressStore } from '../handlers/progress-handler';
import { initAchievementHandler, getAchievements, resetAchievementStore } from '../handlers/achievement-handler';

beforeEach(() => {
  clearAllSubscriptions();
  resetProgressStore();
  resetAchievementStore();
});

// ============================================
// Event Bus Tests
// ============================================

describe('EventBus', () => {
  it('should subscribe and receive events', async () => {
    const received: string[] = [];
    on('exercise:completed', (event) => {
      received.push(event.payload.studentId);
    });

    await emitExerciseCompleted({
      studentId: 's1', skill: 'grammar', skillZh: '文法',
      difficulty: 'core', totalQuestions: 10, correctCount: 7,
      completedAt: new Date(),
    });

    expect(received).toEqual(['s1']);
  });

  it('should support multiple subscribers', async () => {
    let count = 0;
    on('vocabulary:learned', () => { count++; });
    on('vocabulary:learned', () => { count++; });

    await emitVocabularyLearned({ studentId: 's1', word: 'ubiquitous', learnedAt: new Date() });
    expect(count).toBe(2);
  });

  it('should unsubscribe correctly', async () => {
    let count = 0;
    const unsub = on('essay:submitted', () => { count++; });
    unsub();

    await emitEssaySubmitted({
      studentId: 's1', title: 'Test', textType: 'argumentative',
      wordCount: 200, overallScore: 80, grammarErrors: 2,
      chinglishInstances: 1, submittedAt: new Date(),
    });
    expect(count).toBe(0);
  });

  it('should isolate handler errors', async () => {
    on('exercise:completed', () => { throw new Error('Handler A failed'); });
    let handlerBCalled = false;
    on('exercise:completed', () => { handlerBCalled = true; });

    await emitExerciseCompleted({
      studentId: 's1', skill: 'grammar', difficulty: 'core',
      totalQuestions: 5, correctCount: 3, completedAt: new Date(),
    });

    expect(handlerBCalled).toBe(true);
  });

  it('should support event filters', async () => {
    const coreEvents: number[] = [];
    on('exercise:completed',
      (event) => { coreEvents.push(event.payload.totalQuestions); },
      (event) => event.payload.difficulty === 'core'
    );

    await emitExerciseCompleted({ studentId: 's1', skill: 'g', difficulty: 'core', totalQuestions: 10, correctCount: 5, completedAt: new Date() });
    await emitExerciseCompleted({ studentId: 's1', skill: 'g', difficulty: 'challenge', totalQuestions: 20, correctCount: 10, completedAt: new Date() });

    expect(coreEvents).toEqual([10]);
  });

  it('should count subscribers', () => {
    expect(subscriberCount('exercise:completed')).toBe(0);
    on('exercise:completed', () => {});
    expect(subscriberCount('exercise:completed')).toBe(1);
  });
});

// ============================================
// Progress Handler Tests
// ============================================

describe('ProgressHandler', () => {
  beforeEach(() => { initProgressHandler(); });

  it('should track exercise completions', async () => {
    await emitExerciseCompleted({ studentId: 's1', skill: 'grammar', skillZh: '文法', difficulty: 'core', totalQuestions: 10, correctCount: 7, completedAt: new Date() });
    const stats = getProgressStats('s1');
    expect(stats.totalExercises).toBe(1);
    expect(stats.totalQuestionsAnswered).toBe(10);
    expect(stats.totalCorrect).toBe(7);
  });

  it('should track multiple event types', async () => {
    await emitExerciseCompleted({ studentId: 's1', skill: 'g', difficulty: 'core', totalQuestions: 5, correctCount: 3, completedAt: new Date() });
    await emitVocabularyLearned({ studentId: 's1', word: 'test', learnedAt: new Date() });
    await emitEssaySubmitted({ studentId: 's1', title: 'T', textType: 'arg', wordCount: 100, overallScore: 70, grammarErrors: 1, chinglishInstances: 0, submittedAt: new Date() });

    const stats = getProgressStats('s1');
    expect(stats.totalExercises).toBe(1);
    expect(stats.totalVocabulary).toBe(1);
    expect(stats.totalEssays).toBe(1);
  });

  it('should track last activity', async () => {
    const now = new Date();
    await emitAssessmentFinished({ studentId: 's1', assessmentType: 'practice', skill: 'grammar', score: 80, totalQuestions: 10, correctCount: 8, completedAt: now });
    expect(getProgressStats('s1').lastActivityAt).toEqual(now);
  });
});

// ============================================
// Achievement Handler Tests
// ============================================

describe('AchievementHandler', () => {
  beforeEach(() => { initAchievementHandler(); });

  it('should unlock first-exercise achievement', async () => {
    await emitExerciseCompleted({ studentId: 's1', skill: 'g', difficulty: 'core', totalQuestions: 5, correctCount: 3, completedAt: new Date() });
    const achievements = getAchievements('s1');
    expect(achievements.some(a => a.id === 'first-exercise')).toBe(true);
  });

  it('should unlock first-essay achievement', async () => {
    await emitEssaySubmitted({ studentId: 's1', title: 'T', textType: 'arg', wordCount: 200, overallScore: 80, grammarErrors: 2, chinglishInstances: 0, submittedAt: new Date() });
    expect(getAchievements('s1').some(a => a.id === 'first-essay')).toBe(true);
  });

  it('should unlock word-collector after 10 words', async () => {
    for (let i = 0; i < 10; i++) {
      await emitVocabularyLearned({ studentId: 's1', word: `word${i}`, learnedAt: new Date() });
    }
    expect(getAchievements('s1').some(a => a.id === 'ten-vocab')).toBe(true);
  });

  it('should not duplicate achievements', async () => {
    await emitExerciseCompleted({ studentId: 's1', skill: 'g', difficulty: 'core', totalQuestions: 5, correctCount: 3, completedAt: new Date() });
    await emitExerciseCompleted({ studentId: 's1', skill: 'g', difficulty: 'core', totalQuestions: 5, correctCount: 3, completedAt: new Date() });
    const firstCount = getAchievements('s1').filter(a => a.id === 'first-exercise').length;
    expect(firstCount).toBe(1);
  });
});
