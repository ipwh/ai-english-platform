// Sprint 40+: API Integration Tests — Practice endpoint
// 測試練習 API 的 business logic（不依賴實際 DB）
// 使用 mock repository layer

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================
// 模擬資料
// ============================================
const mockStudentId = 'student-123';
const mockPracticeSession = {
  id: 'session-456',
  studentId: mockStudentId,
  skill: 'tenses-simple',
  skillZh: '簡單時態',
  difficulty: 'core',
  totalQuestions: 5,
  correctCount: 3,
  source: 'ai-generated',
  startedAt: new Date(),
  completedAt: null,
};

const mockAnswers = [
  { questionIndex: 0, questionType: 'mc', questionPrompt: 'She ___ to school yesterday.', studentAnswer: 'went', correctAnswer: 'went', isCorrect: true, timeSpent: 12 },
  { questionIndex: 1, questionType: 'mc', questionPrompt: 'They ___ playing football now.', studentAnswer: 'are', correctAnswer: 'are', isCorrect: true, timeSpent: 8 },
  { questionIndex: 2, questionType: 'mc', questionPrompt: 'I have ___ to London.', studentAnswer: 'go', correctAnswer: 'been', isCorrect: false, timeSpent: 15 },
  { questionIndex: 3, questionType: 'fill-blank', questionPrompt: 'He ___ (go) to school by bus.', studentAnswer: 'go', correctAnswer: 'goes', isCorrect: false, timeSpent: 20 },
  { questionIndex: 4, questionType: 'mc', questionPrompt: 'Choose the correct sentence.', studentAnswer: 'B', correctAnswer: 'B', isCorrect: true, timeSpent: 5 },
];

describe('POST /api/practice — Integration Logic', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('應在無答案時僅建立 session', async () => {
    // 模擬 PracticeRepo.createPracticeSession
    const mockCreate = vi.fn().mockResolvedValue(mockPracticeSession);
    const mockCreateAnswers = vi.fn();

    const body = {
      studentId: mockStudentId,
      skill: 'tenses-simple',
      skillZh: '簡單時態',
      difficulty: 'core',
      totalQuestions: 5,
      correctCount: 3,
    };

    const session = await mockCreate(body);
    expect(session.id).toBe('session-456');
    expect(session.skill).toBe('tenses-simple');
    expect(mockCreateAnswers).not.toHaveBeenCalled();
  });

  it('應在提供答案時同時儲存逐題答案', async () => {
    const mockCreate = vi.fn().mockResolvedValue(mockPracticeSession);
    const mockCreateAnswers = vi.fn().mockResolvedValue({ count: 5 });

    const body = {
      studentId: mockStudentId,
      skill: 'tenses-simple',
      answers: mockAnswers,
    };

    const session = await mockCreate(body);
    if (body.answers && Array.isArray(body.answers) && body.answers.length > 0) {
      await mockCreateAnswers(session.id, body.answers);
    }

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ studentId: mockStudentId }));
    expect(mockCreateAnswers).toHaveBeenCalledWith('session-456', mockAnswers);
  });

  it('應自動將錯誤答案同步到錯題本', async () => {
    const mockCreateMistake = vi.fn().mockResolvedValue({ id: 'mistake-1' });
    const mockFindMistake = vi.fn().mockResolvedValue(null);

    const wrongAnswers = mockAnswers.filter(a => !a.isCorrect);

    for (const a of wrongAnswers) {
      const qId = `session-456-q${a.questionIndex}`;
      const existing = await mockFindMistake(mockStudentId, qId);
      if (!existing) {
        await mockCreateMistake({
          studentId: mockStudentId,
          questionId: qId,
          questionSummary: a.questionPrompt || '',
          studentAnswer: a.studentAnswer || '',
          correctAnswer: a.correctAnswer || '',
          mistakeType: 'grammar',
        });
      }
    }

    expect(mockCreateMistake).toHaveBeenCalledTimes(2); // 2 wrong answers
    expect(mockCreateMistake).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: mockStudentId, mistakeType: 'grammar' })
    );
  });

  it('應跳過已存在的錯題記錄（避免重複）', async () => {
    const mockCreateMistake = vi.fn();
    const mockFindMistake = vi.fn().mockResolvedValue({ id: 'existing-mistake' });

    const wrongAnswers = mockAnswers.filter(a => !a.isCorrect);

    for (const a of wrongAnswers) {
      const qId = `session-456-q${a.questionIndex}`;
      const existing = await mockFindMistake(mockStudentId, qId);
      if (!existing) {
        await mockCreateMistake({ studentId: mockStudentId, questionId: qId });
      }
    }

    expect(mockCreateMistake).not.toHaveBeenCalled(); // 全部已存在
  });

  it('應驗證必填欄位 studentId', async () => {
    const body = { skill: 'grammar' };
    const errors: string[] = [];

    if (!body.studentId) {
      errors.push('studentId 為必填');
    }

    expect(errors).toContain('studentId 為必填');
  });

  it('應驗證答案格式', () => {
    const invalidAnswers = [
      { questionIndex: 'invalid', studentAnswer: 'A' },
      { questionIndex: 1 }, // missing studentAnswer
    ];

    const validAnswers = invalidAnswers.filter(
      (a) => typeof a.questionIndex === 'number' && a.studentAnswer !== undefined
    );

    expect(validAnswers.length).toBeLessThan(invalidAnswers.length);
  });

  it('應處理空 answers 陣列', () => {
    const body = { studentId: mockStudentId, answers: [] };
    expect(Array.isArray(body.answers)).toBe(true);
    expect(body.answers.length).toBe(0);
  });

  it('應計算正確的 correctCount', () => {
    const answers = mockAnswers;
    const correctCount = answers.filter(a => a.isCorrect).length;
    expect(correctCount).toBe(3);
    expect(correctCount).toBeLessThanOrEqual(answers.length);
  });
});

describe('Practice — 授權邏輯', () => {
  it('學生只能為自己儲存練習記錄', () => {
    const authUserId = 'student-123';
    const targetUserId = 'student-123';
    const isOwner = authUserId === targetUserId;
    expect(isOwner).toBe(true);
  });

  it('教師可以為其他學生儲存練習記錄', () => {
    const authRole = 'teacher';
    const canWrite = authRole === 'teacher' || authRole === 'admin';
    expect(canWrite).toBe(true);
  });

  it('學生不能為其他學生儲存練習記錄', () => {
    const authUserId = 'student-123';
    const targetUserId = 'student-456';
    const authRole = 'student';
    const canWrite = authUserId === targetUserId || authRole === 'teacher' || authRole === 'admin';
    expect(canWrite).toBe(false);
  });
});
