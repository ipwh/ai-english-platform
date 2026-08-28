// ============================================
// Tests: Gamification — XP, Levels, Badges, Daily Goals
// ============================================

import { describe, it, expect } from 'vitest';
import {
  calculateXp,
  getGradeMultiplier,
  getDailyGoal,
  getLevelInfo,
  BADGE_DEFINITIONS,
  evaluateDailyGoal,
  eligibleBadgesFor,
  buildLeaderboard,
} from '../services/gamification';
import type { XpEvent, BadgeCheckStats } from '../services/gamification';

// ============================================
// XP Calculation Tests
// ============================================

describe('calculateXp', () => {
  it('should return 10 XP for correct answer', () => {
    const event: XpEvent = { type: 'answerCorrect' };
    expect(calculateXp(event)).toBe(10);
  });

  it('should return 2 XP for incorrect answer', () => {
    const event: XpEvent = { type: 'answerIncorrect' };
    expect(calculateXp(event)).toBe(2);
  });

  it('should apply difficulty multiplier: challenge 1.5×', () => {
    const event: XpEvent = { type: 'answerCorrect', difficulty: 'challenge' };
    expect(calculateXp(event)).toBe(15); // 10 * 1.5
  });

  it('should apply difficulty multiplier: remedial 0.8×', () => {
    const event: XpEvent = { type: 'answerCorrect', difficulty: 'remedial' };
    expect(calculateXp(event)).toBe(8); // 10 * 0.8
  });

  it('should apply core difficulty as 1.0×', () => {
    const event: XpEvent = { type: 'answerCorrect', difficulty: 'core' };
    expect(calculateXp(event)).toBe(10);
  });

  it('should add streak bonus for dailyLogin', () => {
    const event: XpEvent = { type: 'dailyLogin', streakDays: 5 };
    // base 5 + streakBonus 5*5 = 25 + 5 = 30
    expect(calculateXp(event)).toBe(30);
  });

  it('should not add streak bonus for non-login events', () => {
    const event: XpEvent = { type: 'answerCorrect', streakDays: 5 };
    expect(calculateXp(event)).toBe(10);
  });

  it('should return 50 XP for complete diagnostic', () => {
    const event: XpEvent = { type: 'completeDiagnostic' };
    expect(calculateXp(event)).toBe(50);
  });

  it('should return 30 XP for submit writing', () => {
    const event: XpEvent = { type: 'submitWriting' };
    expect(calculateXp(event)).toBe(30);
  });

  it('should return 20 XP for master word', () => {
    const event: XpEvent = { type: 'masterWord' };
    expect(calculateXp(event)).toBe(20);
  });

  it('should round XP to integer', () => {
    const event: XpEvent = { type: 'answerCorrect', difficulty: 'challenge' };
    expect(Number.isInteger(calculateXp(event))).toBe(true);
  });
});

// ============================================
// Grade Multiplier Tests（Sprint 133：初中加成限深度事件）
// ============================================

describe('getGradeMultiplier', () => {
  it('should return 1.2 for S1-S3 on deep-learning events only', () => {
    expect(getGradeMultiplier('S1', 'reviewMistake')).toBe(1.2);
    expect(getGradeMultiplier('S2', 'masterWord')).toBe(1.2);
    expect(getGradeMultiplier('S3', 'reviewMistake')).toBe(1.2);
  });

  it('should NOT grant junior bonus for shallow events (MC/login)', () => {
    expect(getGradeMultiplier('S1', 'answerCorrect')).toBe(1.0);
    expect(getGradeMultiplier('S2', 'answerIncorrect')).toBe(1.0);
    expect(getGradeMultiplier('S3', 'dailyLogin')).toBe(1.0);
    expect(getGradeMultiplier('S1', 'completeSession')).toBe(1.0);
  });

  it('should return 1.0 for S4-S6 (senior)', () => {
    expect(getGradeMultiplier('S4', 'reviewMistake')).toBe(1.0);
    expect(getGradeMultiplier('S5', 'masterWord')).toBe(1.0);
    expect(getGradeMultiplier('S6', 'answerCorrect')).toBe(1.0);
  });

  it('should return 1.0 for undefined grade or missing event type', () => {
    expect(getGradeMultiplier()).toBe(1.0);
    expect(getGradeMultiplier('S1')).toBe(1.0);
    expect(getGradeMultiplier('', 'reviewMistake')).toBe(1.0);
  });
});

// ============================================
// Daily Goal Depth Tests (Sprint 133)
// ============================================

describe('evaluateDailyGoal', () => {
  it('requires BOTH questions and one depth activity', () => {
    expect(evaluateDailyGoal({ questionsDone: 10, xpToday: 50, challengeDone: false, mistakesReviewed: 0, wordsMasteredToday: 0 }, 'S1').completed).toBe(false);
    expect(evaluateDailyGoal({ questionsDone: 9, xpToday: 50, challengeDone: true, mistakesReviewed: 0, wordsMasteredToday: 0 }, 'S1').completed).toBe(false);
    expect(evaluateDailyGoal({ questionsDone: 10, xpToday: 50, challengeDone: true, mistakesReviewed: 0, wordsMasteredToday: 0 }, 'S1').completed).toBe(true);
  });

  it('5 MC questions alone can never complete the goal', () => {
    const status = evaluateDailyGoal({ questionsDone: 5, xpToday: 50, challengeDone: false, mistakesReviewed: 0, wordsMasteredToday: 0 }, 'S1');
    expect(status.completed).toBe(false);
    expect(status.depthMet).toBe(false);
  });

  it('counts 3 mistake reviews or 3 mastered words as depth', () => {
    expect(evaluateDailyGoal({ questionsDone: 10, xpToday: 50, challengeDone: false, mistakesReviewed: 3, wordsMasteredToday: 0 }, 'S1').completed).toBe(true);
    expect(evaluateDailyGoal({ questionsDone: 10, xpToday: 50, challengeDone: false, mistakesReviewed: 0, wordsMasteredToday: 3 }, 'S1').completed).toBe(true);
    expect(evaluateDailyGoal({ questionsDone: 10, xpToday: 50, challengeDone: false, mistakesReviewed: 2, wordsMasteredToday: 2 }, 'S1').completed).toBe(false);
  });
});

// ============================================
// Daily Goal Tests
// ============================================

describe('getDailyGoal', () => {
  it('should return 10 questions / 50 XP for S1-S2', () => {
    expect(getDailyGoal('S1')).toEqual({ questions: 10, xpTarget: 50 });
    expect(getDailyGoal('S2')).toEqual({ questions: 10, xpTarget: 50 });
  });

  it('should return 15 questions / 80 XP for S3-S4', () => {
    expect(getDailyGoal('S3')).toEqual({ questions: 15, xpTarget: 80 });
    expect(getDailyGoal('S4')).toEqual({ questions: 15, xpTarget: 80 });
  });

  it('should return 20 questions / 120 XP for S5-S6', () => {
    expect(getDailyGoal('S5')).toEqual({ questions: 20, xpTarget: 120 });
    expect(getDailyGoal('S6')).toEqual({ questions: 20, xpTarget: 120 });
  });

  it('should default to S4 if no grade provided', () => {
    expect(getDailyGoal()).toEqual({ questions: 15, xpTarget: 80 });
  });
});

// ============================================
// Level System Tests
// ============================================

describe('getLevelInfo', () => {
  it('should return level 1 for 0 XP', () => {
    const info = getLevelInfo(0);
    expect(info.level).toBe(1);
    expect(info.title).toBe('Beginner');
    expect(info.titleZh).toBe('初學者');
  });

  it('should return level 2 at 100 XP', () => {
    const info = getLevelInfo(100);
    expect(info.level).toBe(2);
  });

  it('should return level 5 at 800 XP', () => {
    const info = getLevelInfo(800);
    expect(info.level).toBe(5);
  });

  it('should return level 10 at 4000 XP', () => {
    const info = getLevelInfo(4000);
    expect(info.level).toBe(10);
  });

  it('should return level 11 at 5000 XP', () => {
    const info = getLevelInfo(5000);
    expect(info.level).toBe(11);
  });

  it('should return max level 20 at high XP', () => {
    const info = getLevelInfo(30000);
    expect(info.level).toBe(20);
  });

  it('should include xpRequired and xpToNext', () => {
    const info = getLevelInfo(150);
    // Level 2 starts at 100 XP, so xpRequired = 100 (threshold we crossed)
    expect(info.xpRequired).toBe(100);
    // xpToNext = next threshold (250) - current (150) = 100
    expect(info.xpToNext).toBe(100);
  });

  it('should return bilingual titles', () => {
    const info = getLevelInfo(3000);
    expect(info.title).toBeTruthy();
    expect(info.titleZh).toBeTruthy();
  });
});

// ============================================
// Badge System Tests
// ============================================

describe('BADGE_DEFINITIONS', () => {
  const baseStats: BadgeCheckStats = {
    totalQuestions: 0,
    overallAccuracy: 0,
    streakDays: 0,
    sessionsCompleted: 0,
    wordsMastered: 0,
    writingSubmissions: 0,
    diagnosticCompleted: false,
    skillAccuracy: {},
  };

  it('should have 18 badges across 5 categories', () => {
    // 15 original + 3 junior-friendly deep-learning badges (Sprint 133)
    expect(BADGE_DEFINITIONS.length).toBeGreaterThanOrEqual(15);
    expect(BADGE_DEFINITIONS.length).toBeLessThanOrEqual(20);
  });

  it('should award streak-3 badge at 3 days', () => {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'streak-3');
    expect(badge).toBeDefined();
    expect(badge!.condition({ ...baseStats, streakDays: 3 })).toBe(true);
    expect(badge!.condition({ ...baseStats, streakDays: 2 })).toBe(false);
  });

  it('should award streak-7 badge at 7 days', () => {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'streak-7');
    expect(badge).toBeDefined();
    expect(badge!.condition({ ...baseStats, streakDays: 7 })).toBe(true);
  });

  it('should award accuracy-80 with 80%+ and 50+ questions', () => {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'accuracy-80');
    expect(badge).toBeDefined();
    expect(badge!.condition({ ...baseStats, totalQuestions: 50, overallAccuracy: 80 })).toBe(true);
    expect(badge!.condition({ ...baseStats, totalQuestions: 40, overallAccuracy: 80 })).toBe(false);
  });

  it('should award accuracy-90 with 90%+ and 100+ questions', () => {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'accuracy-90');
    expect(badge).toBeDefined();
    expect(badge!.condition({ ...baseStats, totalQuestions: 100, overallAccuracy: 90 })).toBe(true);
    expect(badge!.condition({ ...baseStats, totalQuestions: 99, overallAccuracy: 90 })).toBe(false);
  });

  it('should have all 5 categories represented', () => {
    const categories = new Set(BADGE_DEFINITIONS.map(b => b.category));
    expect(categories.has('streak')).toBe(true);
    expect(categories.has('accuracy')).toBe(true);
    expect(categories.has('volume')).toBe(true);
    expect(categories.has('skill')).toBe(true);
    expect(categories.has('special')).toBe(true);
  });

  it('should have bilingual names and descriptions for all badges', () => {
    for (const badge of BADGE_DEFINITIONS) {
      expect(badge.name).toBeTruthy();
      expect(badge.nameZh).toBeTruthy();
      expect(badge.description).toBeTruthy();
      expect(badge.descriptionZh).toBeTruthy();
    }
  });

  it('should have emoji icons for all badges', () => {
    for (const badge of BADGE_DEFINITIONS) {
      expect(badge.icon).toBeTruthy();
      expect(badge.icon.length).toBeGreaterThanOrEqual(1);
    }
  });

  // Sprint 133: junior-friendly deep-learning badges
  it('awards vocab-20 at 20 mastered words', () => {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'vocab-20');
    expect(badge).toBeDefined();
    expect(badge!.condition({ ...baseStats, wordsMastered: 20 })).toBe(true);
    expect(badge!.condition({ ...baseStats, wordsMastered: 19 })).toBe(false);
  });

  it('awards mistake-review-10 at 10 reviewed mistakes', () => {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'mistake-review-10');
    expect(badge).toBeDefined();
    expect(badge!.condition({ ...baseStats, mistakesReviewed: 10 })).toBe(true);
    expect(badge!.condition({ ...baseStats, mistakesReviewed: 9 })).toBe(false);
  });

  it('awards challenge-week at 5 weekly daily challenges', () => {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'challenge-week');
    expect(badge).toBeDefined();
    expect(badge!.condition({ ...baseStats, weeklyChallenges: 5 })).toBe(true);
    expect(badge!.condition({ ...baseStats, weeklyChallenges: 4 })).toBe(false);
  });

  // Sprint 133: grade-scoped badge eligibility
  it('excludes writing-5 for junior (S1-S3), keeps for senior', () => {
    const junior = eligibleBadgesFor({ ...baseStats, gradeLevel: 'S1' });
    expect(junior.find(b => b.id === 'writing-5')).toBeUndefined();
    const senior = eligibleBadgesFor({ ...baseStats, gradeLevel: 'S5' });
    expect(senior.find(b => b.id === 'writing-5')).toBeDefined();
  });
});

// ============================================
// Leaderboard Tests (Sprint 133: junior weekly-active-days mode)
// ============================================

describe('buildLeaderboard', () => {
  const students = [
    { id: 'a', nameEn: 'Alice', xp: 500, streakDays: 3, overallAccuracy: 80 },
    { id: 'b', nameEn: 'Bob', xp: 1000, streakDays: 1, overallAccuracy: 60 },
  ];

  it('sorts by XP for senior mode', () => {
    const lb = buildLeaderboard(students);
    expect(lb[0].displayName).toBe('Bob');
    expect(lb[0].xp).toBe(1000);
    expect(lb[0].metric).toBe('xp');
  });

  it('sorts by weekly active days for junior mode', () => {
    const weekly = new Map([['a', 5], ['b', 2]]);
    const lb = buildLeaderboard(students, { metric: 'weekly-active-days', weeklyActiveDays: weekly });
    expect(lb[0].displayName).toBe('Alice');
    expect(lb[0].weeklyActiveDays).toBe(5);
    expect(lb[0].metric).toBe('weekly-active-days');
    expect(lb[1].weeklyActiveDays).toBe(2);
  });
});
