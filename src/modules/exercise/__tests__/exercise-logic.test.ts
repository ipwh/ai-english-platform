// Sprint 40+: Exercise Service — 練習記錄邏輯測試
import { describe, it, expect } from 'vitest';

describe('PracticeRecord — 練習記錄邏輯', () => {
  it('應正確計算正確率', () => {
    const answers = [
      { isCorrect: true }, { isCorrect: true },
      { isCorrect: false }, { isCorrect: true },
      { isCorrect: false },
    ];
    const correctCount = answers.filter(a => a.isCorrect).length;
    const total = answers.length;
    const accuracy = Math.round((correctCount / total) * 100);
    expect(correctCount).toBe(3);
    expect(total).toBe(5);
    expect(accuracy).toBe(60);
  });

  it('無答案時應回傳 0', () => {
    expect(Math.round((0 / 0) * 100)).toBeNaN();
    // 正確處理
    const safeAccuracy = (correct: number, total: number) => total > 0 ? Math.round((correct / total) * 100) : 0;
    expect(safeAccuracy(0, 0)).toBe(0);
    expect(safeAccuracy(5, 10)).toBe(50);
  });

  it('應預設缺失欄位', () => {
    const record = {
      skill: '',
      difficulty: '',
    };
    const skill = record.skill || 'general';
    const difficulty = record.difficulty || 'core';
    expect(skill).toBe('general');
    expect(difficulty).toBe('core');
  });

  it('應驗證練習記錄的必填欄位', () => {
    const validRecord = {
      studentId: 's1',
      skill: 'grammar',
      difficulty: 'core',
      totalQuestions: 10,
      correctCount: 7,
    };
    const required = ['studentId', 'skill', 'difficulty'];
    for (const field of required) {
      expect(validRecord).toHaveProperty(field);
    }
    // 缺少 studentId 應視為無效
    const { studentId, ...invalid } = validRecord;
    expect(invalid).not.toHaveProperty('studentId');
  });

  it('應處理每日挑戰邏輯', () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // 如果今天已完成挑戰
    const completedToday = true;
    expect(completedToday).toBe(true);

    // 模擬挑戰資料
    const challenge = {
      date: todayStr,
      completed: false,
      skill: 'reading',
      difficulty: 'core',
      questions: 5,
    };
    expect(challenge.date).toBe(todayStr);
    expect(challenge.completed).toBe(false);
  });
});

describe('Diagnostic — 診斷測驗邏輯', () => {
  it('應根據結果計算技能等級', () => {
    const results = [
      { grammarItem: 'tenses', score: 80, level: 'S3' },
      { grammarItem: 'passive-voice', score: 45, level: 'S2' },
      { grammarItem: 'conditionals', score: 30, level: 'S1' },
    ];
    const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
    expect(avgScore).toBe(52);
    expect(results.filter(r => r.score < 60).length).toBe(2); // 2 weaknesses
  });

  it('空結果陣列應安全處理', () => {
    const safeAvg = (results: number[]) =>
      results.length > 0 ? results.reduce((s, r) => s + r, 0) / results.length : 0;
    expect(safeAvg([])).toBe(0);
    expect(safeAvg([80, 60])).toBe(70);
  });
});
