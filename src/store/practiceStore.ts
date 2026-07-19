// ============================================
// 練習進度狀態管理 (Zustand) — 專注於練習記錄
// ============================================

import { create } from 'zustand';
import type { PracticeQuestion, DifficultyLevel } from '@/shared/types/types';

export interface PracticeSession {
  id: string;
  startedAt: string;
  completedAt?: string;
  questions: PracticeQuestion[];
  answers: Record<string, string>;
  results: Record<string, boolean>;
  skill: string;
  skillZh: string;
  difficulty: DifficultyLevel;
  totalQuestions: number;
  correctCount: number;
  source: 'ai-generated' | 'mock' | 'assignment';
}

interface PracticeState {
  practiceSessions: PracticeSession[];
  currentSession: PracticeSession | null;

  // 動作
  startSession: (session: PracticeSession) => void;
  submitAnswer: (questionId: string, answer: string, isCorrect: boolean) => void;
  completeSession: () => void;
  loadPracticeHistory: () => Promise<void>;
  getMasteryBySkill: () => { skill: string; skillZh: string; accuracy: number; total: number }[];
  getRecentSessions: (limit?: number) => PracticeSession[];
  getWeeklyStats: () => { questionsDone: number; accuracy: number; sessionsCount: number; streakDays: number };
  clearCurrentSession: () => void;
}

export const usePracticeStore = create<PracticeState>((set, get) => ({
  practiceSessions: [],
  currentSession: null,

  startSession: (session) => {
    set({ currentSession: session });
  },

  submitAnswer: (questionId, answer, isCorrect) => {
    const { currentSession } = get();
    if (!currentSession) return;

    const newAnswers = { ...currentSession.answers, [questionId]: answer };
    const newResults = { ...currentSession.results, [questionId]: isCorrect };

    set({
      currentSession: {
        ...currentSession,
        answers: newAnswers,
        results: newResults,
      },
    });
  },

  completeSession: () => {
    const { currentSession, practiceSessions } = get();
    if (!currentSession) return;

    const completed = {
      ...currentSession,
      completedAt: new Date().toISOString(),
      correctCount: Object.values(currentSession.results).filter(Boolean).length,
    };

    set({
      practiceSessions: [...practiceSessions, completed],
      currentSession: null,
    });
  },

  clearCurrentSession: () => {
    set({ currentSession: null });
  },

  loadPracticeHistory: async () => {
    try {
      const res = await fetch('/api/practice/history');
      if (res.ok) {
        const data = await res.json();
        if (data.sessions) {
          set({ practiceSessions: data.sessions });
        }
      }
    } catch {
      // Non-critical
    }
  },

  getMasteryBySkill: () => {
    const { practiceSessions } = get();
    const skillMap = new Map<string, { correct: number; total: number; skillZh: string }>();

    for (const session of practiceSessions) {
      if (!skillMap.has(session.skill)) {
        skillMap.set(session.skill, { correct: 0, total: 0, skillZh: session.skillZh });
      }
      const entry = skillMap.get(session.skill)!;
      entry.total += session.totalQuestions;
      entry.correct += session.correctCount;
    }

    return Array.from(skillMap.entries()).map(([skill, data]) => ({
      skill,
      skillZh: data.skillZh,
      accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      total: data.total,
    }));
  },

  getRecentSessions: (limit = 10) => {
    const { practiceSessions } = get();
    return [...practiceSessions]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  },

  getWeeklyStats: () => {
    const { practiceSessions } = get();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const weeklySessions = practiceSessions.filter(
      (s) => new Date(s.startedAt) >= oneWeekAgo
    );

    const questionsDone = weeklySessions.reduce((sum, s) => sum + s.totalQuestions, 0);
    const correctCount = weeklySessions.reduce((sum, s) => sum + s.correctCount, 0);
    const accuracy = questionsDone > 0 ? Math.round((correctCount / questionsDone) * 100) : 0;

    // 計算連續天數（從 practice sessions 的時間戳記）
    const days = new Set(
      weeklySessions.map((s) => new Date(s.startedAt).toISOString().slice(0, 10))
    );
    let streakDays = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (days.has(d.toISOString().slice(0, 10))) {
        streakDays++;
      } else if (i > 0) {
        break;
      }
    }

    return {
      questionsDone,
      accuracy,
      sessionsCount: weeklySessions.length,
      streakDays,
    };
  },
}));
