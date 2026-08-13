// ============================================
// R3.10-C.2 — P/M: client-local store containment tests
// Proves Zustand scored metrics (weekly accuracy, mastery) use ONLY
// server-verified evidence. Client-local sessions without verified
// evidence never contribute to scored accuracy.
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
  usePracticeStore.setState({ practiceSessions: [], currentSession: null });
});

describe('R3.10-C.2 practiceStore scored-metric containment (P/M)', () => {
  it('P.1: forged session totals without verified evidence do NOT affect weekly accuracy', () => {
    usePracticeStore.setState({
      practiceSessions: [
        makeSession({ id: 'forged', startedAt: lastWeek(), totalQuestions: 500, correctCount: 500 }),
      ],
    });
    const stats = usePracticeStore.getState().getWeeklyStats();
    expect(stats.accuracy).toBe(0);
    // engagement volume remains raw:
    expect(stats.questionsDone).toBe(500);
  });

  it('P.2: verified server rows DO drive weekly accuracy from row-derived totals', () => {
    usePracticeStore.setState({
      practiceSessions: [
        makeSession({
          id: 'verified-1',
          startedAt: lastWeek(),
          totalQuestions: 999, // forged aggregate
          correctCount: 999,
          verified: { status: 'verified', totalQuestions: 3, correctCount: 1 },
        }),
      ],
    });
    const stats = usePracticeStore.getState().getWeeklyStats();
    expect(stats.accuracy).toBe(33);
  });

  it('P.3: unverifiable sessions are ignored for scored accuracy', () => {
    usePracticeStore.setState({
      practiceSessions: [
        makeSession({
          id: 'unverifiable',
          startedAt: lastWeek(),
          verified: { status: 'unverifiable' },
        }),
        makeSession({
          id: 'verified-1',
          startedAt: lastWeek(),
          totalQuestions: 999,
          correctCount: 999,
          verified: { status: 'verified', totalQuestions: 2, correctCount: 2 },
        }),
      ],
    });
    const stats = usePracticeStore.getState().getWeeklyStats();
    expect(stats.accuracy).toBe(100);
  });

  it('P.4: client-local session (no verified field) is not used as accuracy fallback', () => {
    usePracticeStore.setState({
      practiceSessions: [
        makeSession({ id: 'local', startedAt: lastWeek(), totalQuestions: 10, correctCount: 10 }),
        makeSession({
          id: 'verified-1',
          startedAt: lastWeek(),
          totalQuestions: 999,
          correctCount: 0,
          verified: { status: 'verified', totalQuestions: 2, correctCount: 0 },
        }),
      ],
    });
    const stats = usePracticeStore.getState().getWeeklyStats();
    // no fallback to local session: 0/2 = 0
    expect(stats.accuracy).toBe(0);
  });

  it('M/P.5: mastery by skill uses verified evidence only', () => {
    usePracticeStore.setState({
      practiceSessions: [
        makeSession({ id: 'forged', skill: 'tenses', totalQuestions: 100, correctCount: 100 }),
        makeSession({
          id: 'verified-1',
          skill: 'tenses',
          totalQuestions: 999,
          correctCount: 999,
          verified: { status: 'verified', totalQuestions: 4, correctCount: 2 },
        }),
      ],
    });
    const mastery = usePracticeStore.getState().getMasteryBySkill();
    expect(mastery).toEqual([
      { skill: 'tenses', skillZh: '時態', accuracy: 50, total: 4 },
    ]);
  });

  it('P.6: unverifiable sessions are excluded from mastery', () => {
    usePracticeStore.setState({
      practiceSessions: [
        makeSession({ id: 'unverifiable', verified: { status: 'unverifiable' } }),
      ],
    });
    expect(usePracticeStore.getState().getMasteryBySkill()).toEqual([]);
  });
});
