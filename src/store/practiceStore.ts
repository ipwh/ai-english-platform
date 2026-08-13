// ============================================
// 練習進度狀態管理 (Zustand) — 專注於練習記錄
// ============================================

import { create } from 'zustand';
import type { PracticeQuestion, DifficultyLevel } from '@/shared/types/types';
import { useAuthStore } from './authStore';

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
  /** R3.10-C.2: 伺服器 canonical verified evidence（由 /api/practice 提供）。
   * 本機 session（尚未伺服器驗證）沒有此欄位 → 不計入 scored 準確率。 */
  verified?: {
    status: 'verified' | 'unverifiable';
    totalQuestions?: number;
    correctCount?: number;
  } | null;
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
    const newCorrectCount = Object.values(newResults).filter(Boolean).length;

    set({
      currentSession: {
        ...currentSession,
        answers: newAnswers,
        results: newResults,
        correctCount: newCorrectCount,
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
      const userId = useAuthStore.getState().userId;
      if (!userId) return;
      const res = await fetch(`/api/practice?studentId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.sessions) {
          // 依 id 去重
          const seen = new Set<string>();
          const deduped = (data.sessions as PracticeSession[]).filter(s => {
            if (seen.has(s.id)) return false;
            seen.add(s.id);
            return true;
          });
          set({ practiceSessions: deduped });
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
      // R3.10-C.2: 技能掌握度（scored）只計伺服器 verified evidence。
      const v = session.verified;
      if (!v || v.status !== 'verified') continue;
      const skillKey = session.skill || 'general';
      if (!skillMap.has(skillKey)) {
        skillMap.set(skillKey, { correct: 0, total: 0, skillZh: session.skillZh });
      }
      const entry = skillMap.get(skillKey)!;
      entry.total += v.totalQuestions ?? 0;
      entry.correct += v.correctCount ?? 0;
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
    // 依 id 去重，再按 startedAt 排序
    const seen = new Set<string>();
    return [...practiceSessions]
      .filter(s => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      })
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

    // 題數（engagement 量）保持原始；準確率（scored）只計 verified evidence。
    const questionsDone = weeklySessions.reduce((sum, s) => sum + s.totalQuestions, 0);
    let vTotal = 0;
    let vCorrect = 0;
    for (const s of weeklySessions) {
      const v = s.verified;
      if (v && v.status === 'verified') {
        vTotal += v.totalQuestions ?? 0;
        vCorrect += v.correctCount ?? 0;
      }
    }
    const accuracy = vTotal > 0 ? Math.round((vCorrect / vTotal) * 100) : 0;

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
