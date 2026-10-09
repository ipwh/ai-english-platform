// Sprint 31: Student Mastery — repository/service/API tests
import { describe, it, expect } from 'vitest';
import { calculateMasteryScore } from '../services/mastery-formula';
import { masteryQuerySchema, exerciseResultSchema } from '../schemas';
import { MASTERY_SKILLS } from '../types';
import type { ExerciseResult, StudentLearningProfile } from '../types';

// ============================================
// 1. Mastery Formula Tests
// ============================================
describe('calculateMasteryScore — 掌握度公式', () => {
  it('無練習時應回傳 0', () => {
    const result = calculateMasteryScore({
      correctCount: 0, practiceCount: 0, mistakeCount: 0, lastPracticedAt: null,
    });
    expect(result.masteryScore).toBe(0);
    expect(result.confidenceScore).toBe(0);
    expect(result.retentionScore).toBe(0);
  });

  it('全對且有大量練習應回傳高分', () => {
    const result = calculateMasteryScore({
      correctCount: 20, practiceCount: 20, mistakeCount: 0,
      lastPracticedAt: new Date(),
    });
    expect(result.masteryScore).toBeGreaterThanOrEqual(82);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
    expect(result.retentionScore).toBeGreaterThanOrEqual(90);
  });

  it('全錯應回傳低分', () => {
    const result = calculateMasteryScore({
      correctCount: 0, practiceCount: 10, mistakeCount: 10,
      lastPracticedAt: new Date(),
    });
    expect(result.masteryScore).toBeLessThan(55);
  });

  it('久未練習應降低 retention 和 mastery', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const result = calculateMasteryScore({
      correctCount: 10, practiceCount: 10, mistakeCount: 0,
      lastPracticedAt: oldDate,
    });
    expect(result.retentionScore).toBeLessThan(50);
    expect(result.masteryScore).toBeLessThan(95);
  });

  it('少量練習應有低 confidence', () => {
    const result1 = calculateMasteryScore({
      correctCount: 1, practiceCount: 1, mistakeCount: 0, lastPracticedAt: new Date(),
    });
    const result5 = calculateMasteryScore({
      correctCount: 5, practiceCount: 5, mistakeCount: 0, lastPracticedAt: new Date(),
    });
    expect(result1.confidenceScore).toBeLessThan(result5.confidenceScore);
  });

  it('全對且頻繁練習應達 90+', () => {
    const result = calculateMasteryScore({
      correctCount: 50, practiceCount: 50, mistakeCount: 0,
      lastPracticedAt: new Date(),
    });
    expect(result.masteryScore).toBeGreaterThanOrEqual(90);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(90);
  });

  it('分數應在 0-100 範圍內', () => {
    const result = calculateMasteryScore({
      correctCount: 3, practiceCount: 7, mistakeCount: 4,
      lastPracticedAt: new Date(Date.now() - 86400000 * 5),
    });
    expect(result.masteryScore).toBeGreaterThanOrEqual(0);
    expect(result.masteryScore).toBeLessThanOrEqual(100);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(result.confidenceScore).toBeLessThanOrEqual(100);
    expect(result.retentionScore).toBeGreaterThanOrEqual(0);
    expect(result.retentionScore).toBeLessThanOrEqual(100);
  });
});

// ============================================
// 2. Type & Skill Mapping Tests
// ============================================
describe('MasterySkill — 技能類型', () => {
  it('應包含全部 6 個技能', () => {
    expect(MASTERY_SKILLS).toHaveLength(6);
    expect(MASTERY_SKILLS).toContain('grammar');
    expect(MASTERY_SKILLS).toContain('vocabulary');
    expect(MASTERY_SKILLS).toContain('reading');
    expect(MASTERY_SKILLS).toContain('writing');
    expect(MASTERY_SKILLS).toContain('listening');
    expect(MASTERY_SKILLS).toContain('speaking');
  });

  it('ExerciseResult 應接受有效輸入', () => {
    const result: ExerciseResult = {
      studentId: 's1',
      skill: 'grammar',
      subSkill: 'tenses',
      totalQuestions: 10,
      correctCount: 7,
    };
    expect(result.studentId).toBe('s1');
    expect(result.skill).toBe('grammar');
  });
});

// ============================================
// 3. Schema Validation Tests
// ============================================
describe('Mastery Schemas — Zod 驗證', () => {
  it('masteryQuerySchema 應接受有效的查詢', () => {
    const result = masteryQuerySchema.safeParse({ studentId: 's1' });
    expect(result.success).toBe(true);
  });

  it('masteryQuerySchema 應拒絕無 studentId', () => {
    const result = masteryQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('exerciseResultSchema 應接受完整結果', () => {
    const result = exerciseResultSchema.safeParse({
      studentId: 's1', skill: 'grammar', subSkill: 'tenses',
      totalQuestions: 10, correctCount: 7,
    });
    expect(result.success).toBe(true);
  });

  it('exerciseResultSchema 應拒絕無效 skill', () => {
    const result = exerciseResultSchema.safeParse({
      studentId: 's1', skill: 'invalid', subSkill: 'x',
      totalQuestions: 5, correctCount: 3,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================
// 4. Learning Profile Shape Tests
// ============================================
describe('StudentLearningProfile — 學習檔案結構', () => {
  it('應有正確的型別結構', () => {
    const profile: StudentLearningProfile = {
      studentId: 's1',
      overallMastery: 75,
      bySkill: {
        grammar: {
          skill: 'grammar', overallScore: 80, totalPractices: 10,
          totalMistakes: 2, totalCorrect: 8, subSkillCount: 3, subSkills: [],
        },
        vocabulary: {
          skill: 'vocabulary', overallScore: 70, totalPractices: 5,
          totalMistakes: 1, totalCorrect: 4, subSkillCount: 2, subSkills: [],
        },
        reading: {
          skill: 'reading', overallScore: 0, totalPractices: 0,
          totalMistakes: 0, totalCorrect: 0, subSkillCount: 0, subSkills: [],
        },
        writing: {
          skill: 'writing', overallScore: 0, totalPractices: 0,
          totalMistakes: 0, totalCorrect: 0, subSkillCount: 0, subSkills: [],
        },
        listening: {
          skill: 'listening', overallScore: 0, totalPractices: 0,
          totalMistakes: 0, totalCorrect: 0, subSkillCount: 0, subSkills: [],
        },
        speaking: {
          skill: 'speaking', overallScore: 0, totalPractices: 0,
          totalMistakes: 0, totalCorrect: 0, subSkillCount: 0, subSkills: [],
        },
      },
      weakestSkills: [],
      strongestSkills: [],
      totalPractices: 15,
      generatedAt: new Date(),
    };
    expect(profile.overallMastery).toBe(75);
    expect(profile.bySkill.grammar.overallScore).toBe(80);
  });
});

// ============================================
// 5. Edge Cases
// ============================================
describe('MasteryEdgeCases — 邊界情況', () => {
  it('極端大量練習不應超過 100', () => {
    const result = calculateMasteryScore({
      correctCount: 1000, practiceCount: 1000, mistakeCount: 0,
      lastPracticedAt: new Date(),
    });
    expect(result.masteryScore).toBeLessThanOrEqual(100);
  });

  it('全錯不應低於 0', () => {
    const result = calculateMasteryScore({
      correctCount: 0, practiceCount: 100, mistakeCount: 100,
      lastPracticedAt: new Date(),
    });
    expect(result.masteryScore).toBeGreaterThanOrEqual(0);
  });
});
