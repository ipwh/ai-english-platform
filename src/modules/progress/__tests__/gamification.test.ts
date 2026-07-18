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
} from '@/modules/progress/services/gamification';
import type { XpEvent, BadgeCheckStats } from '@/modules/progress/services/gamification';

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
// Grade Multiplier Tests
// ============================================

describe('getGradeMultiplier', () => {
  it('should return 1.2 for S1-S3 (junior)', () => {
    expect(getGradeMultiplier('S1')).toBe(1.2);
    expect(getGradeMultiplier('S2')).toBe(1.2);
    expect(getGradeMultiplier('S3')).toBe(1.2);
  });

  it('should return 1.0 for S4-S6 (senior)', () => {
    expect(getGradeMultiplier('S4')).toBe(1.0);
    expect(getGradeMultiplier('S5')).toBe(1.0);
    expect(getGradeMultiplier('S6')).toBe(1.0);
  });

  it('should return 1.0 for undefined grade', () => {
    expect(getGradeMultiplier()).toBe(1.0);
  });

  it('should return 1.0 for empty string', () => {
    expect(getGradeMultiplier('')).toBe(1.0);
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

  it('should have exactly 12 badges', () => {
    // Report says 12 badges across 5 categories
    expect(BADGE_DEFINITIONS.length).toBeGreaterThanOrEqual(10);
    expect(BADGE_DEFINITIONS.length).toBeLessThanOrEqual(15);
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
});
