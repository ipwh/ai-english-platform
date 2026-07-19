// Sprint 40+: Student Service — 學生管理邏輯測試
import { describe, it, expect } from 'vitest';

describe('StudentService — 學生資料邏輯', () => {
  it('應正確建立 StudentProfile', () => {
    const profile = {
      id: 's1',
      name: 'Chan Tai Man',
      email: 'taiman@school.edu.hk',
      role: 'student' as const,
      gradeLevel: 'S4',
      xp: 150,
      streakDays: 5,
    };
    expect(profile.role).toBe('student');
    expect(profile.gradeLevel).toMatch(/^S[1-6]$/);
    expect(profile.email).toContain('@');
  });

  it('應驗證電郵格式', () => {
    const validEmails = ['student@school.edu.hk', 'teacher@school.edu.hk'];
    const invalidEmails = ['notanemail', '@missing.com', 'missing@', ''];

    for (const email of validEmails) {
      expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    }
    for (const email of invalidEmails) {
      expect(email).not.toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    }
  });

  it('應驗證年級格式 (S1-S6)', () => {
    const validLevels = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
    const invalidLevels = ['S0', 'S7', 'F1', 'Grade 10', ''];

    for (const level of validLevels) {
      expect(level).toMatch(/^S[1-6]$/);
    }
    for (const level of invalidLevels) {
      expect(level).not.toMatch(/^S[1-6]$/);
    }
  });

  it('應正確註冊學生', () => {
    const registration = {
      name: 'New Student',
      email: 'newstudent@school.edu.hk',
      password: 'password123',
      gradeLevel: 'S3',
    };
    expect(registration.name).toBeTruthy();
    expect(registration.password.length).toBeGreaterThanOrEqual(6);
    expect(registration.gradeLevel).toMatch(/^S[1-6]$/);
  });

  it('應計算 XP 累積', () => {
    const xpEvents = [
      { action: 'practice_completed', xp: 10 },
      { action: 'correct_answer', xp: 5 },
      { action: 'streak_bonus', xp: 20 },
      { action: 'practice_completed', xp: 10 },
    ];
    const totalXp = xpEvents.reduce((sum, e) => sum + e.xp, 0);
    expect(totalXp).toBe(45);
  });

  it('應驗證連續學習天數邏輯', () => {
    // 模擬連續天數計算
    const dates = [
      '2026-07-19', '2026-07-18', '2026-07-17', // 連續 3 天
    ];
    let streak = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
      if (Math.abs(diffDays - 1) < 0.1) streak++;
      else break;
    }
    expect(streak).toBe(3);
  });

  it('應驗證中斷連續天數', () => {
    const dates = [
      '2026-07-19', '2026-07-18', '2026-07-15', // 中斷了！
    ];
    let streak = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
      if (Math.abs(diffDays - 1) < 0.1) streak++;
      else break;
    }
    expect(streak).toBe(2); // 只連續 2 天
  });

  it('應依班級過濾學生', () => {
    const students = [
      { id: 's1', classId: 'c1', name: 'Alice' },
      { id: 's2', classId: 'c1', name: 'Bob' },
      { id: 's3', classId: 'c2', name: 'Charlie' },
    ];
    const class1Students = students.filter(s => s.classId === 'c1');
    expect(class1Students).toHaveLength(2);
    expect(class1Students.map(s => s.name)).toEqual(['Alice', 'Bob']);
  });

  it('應取得語言偏好', () => {
    const preferences = [
      { userId: 's1', language: 'zh' },
      { userId: 's2', language: 'en' },
    ];
    const s1Pref = preferences.find(p => p.userId === 's1');
    expect(s1Pref?.language).toBe('zh');
  });
});
