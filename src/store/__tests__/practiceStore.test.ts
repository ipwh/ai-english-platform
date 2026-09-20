// ============================================
// R3.10-C.2 + 2026-09-20 稽核 — client store containment
// scored 指標（每週準確率、技能掌握度）**永不**由客戶端本機 sessions 推導：
// 一律採用伺服器證據投影（`skillTotals` / `weekly`）；本機 sessions 只作顯示。
// 額外守門：累積題數只升不跌、連續天數來自伺服器（不由視窗推算）。
// ============================================
import { describe, it, expect, beforeEach } from 'vitest';
import { usePracticeStore, type PracticeSession } from '../practiceStore';

function makeSession(overrides: Partial<PracticeSession> = {}): PracticeSession {
  return {
    id: 's1',
    startedAt: new Date().toISOString(),
    questions: [],
    answers: {},
    results: {},
    skill: 'tenses',
    skillZh: '時態',
    difficulty: 'core',
    totalQuestions: 999,
    correctCount: 999,
    source: 'ai-generated',
    ...overrides,
  };
}

const lastWeek = () => {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return d.toISOString();
};

beforeEach(() => {
  usePracticeStore.setState({
    practiceSessions: [],
    currentSession: null,
    cumulativeSkillTotals: [],
    serverWeekly: null,
  });
});

describe('practiceStore scored-metric containment (R3.10-C.2 + 2026-09-20)', () => {
  it('P.1: forged client-session totals never reach weekly stats', () => {
    usePracticeStore.setState({
      practiceSessions: [
        makeSession({ id: 'forged', startedAt: lastWeek(), totalQuestions: 500, correctCount: 500 }),
      ],
    });
    const stats = usePracticeStore.getState().getWeeklyStats();
    // 不再有「engagement 由本機 session 相加」的路徑；accuracy = null（無資料 ≠ 0%）
    expect(stats).toEqual({ questionsDone: 0, accuracy: null, sessionsCount: 0, streakDays: 0 });
  });

  it('P.2: server weekly projection drives weekly stats, including canonical streak', () => {
    usePracticeStore.setState({
      serverWeekly: {
        questionsDone: 120,
        sessionsCount: 8,
        verifiedQuestions: 40,
        verifiedCorrect: 30,
        accuracy: 75,
        streakDays: 6, // 香港日界線的正典連續天數
      },
    });
    expect(usePracticeStore.getState().getWeeklyStats()).toEqual({
      questionsDone: 120,
      accuracy: 75,
      sessionsCount: 8,
      streakDays: 6,
    });
  });

  it('P.3: client-local sessions (no verified evidence) never contribute to mastery', () => {
    usePracticeStore.setState({
      practiceSessions: [
        makeSession({ id: 'forged', skill: 'tenses', totalQuestions: 100, correctCount: 100 }),
        makeSession({ id: 'unverifiable', skill: 'tenses', verified: { status: 'unverifiable' } }),
      ],
    });
    expect(usePracticeStore.getState().getMasteryBySkill()).toEqual([]);
  });

  it('P.4: mastery comes from cumulative server totals (只升不跌)', () => {
    usePracticeStore.setState({
      cumulativeSkillTotals: [{ skill: 'tenses', skillZh: '時態', questions: 100, correct: 40 }],
    });
    expect(usePracticeStore.getState().getMasteryBySkill()).toEqual([
      { skill: 'tenses', skillZh: '時態', accuracy: 40, total: 100 },
    ]);

    // 學生練其他技能後，舊技能的累積題數不得下降（舊視窗實作會跌至 0）
    usePracticeStore.setState({
      cumulativeSkillTotals: [
        { skill: 'connectives', skillZh: '連接詞', questions: 45, correct: 40 },
        { skill: 'tenses', skillZh: '時態', questions: 100, correct: 40 },
      ],
    });
    const after = usePracticeStore.getState().getMasteryBySkill();
    expect(after.find(m => m.skill === 'tenses')).toEqual({
      skill: 'tenses', skillZh: '時態', accuracy: 40, total: 100,
    });
  });

  it('P.5: zero-question cumulative entry yields 0% (no division fallback)', () => {
    usePracticeStore.setState({
      cumulativeSkillTotals: [{ skill: 'reading', skillZh: '閱讀', questions: 0, correct: 0 }],
    });
    expect(usePracticeStore.getState().getMasteryBySkill()).toEqual([
      { skill: 'reading', skillZh: '閱讀', accuracy: 0, total: 0 },
    ]);
  });

  it('P.6: recent sessions remain a display window (unaffected by server projections)', () => {
    usePracticeStore.setState({
      practiceSessions: [makeSession({ id: 'a', startedAt: '2026-09-18T10:00:00Z' }), makeSession({ id: 'b', startedAt: '2026-09-19T10:00:00Z' })],
    });
    const recent = usePracticeStore.getState().getRecentSessions(5);
    expect(recent.map(s => s.id)).toEqual(['b', 'a']);
  });
});

