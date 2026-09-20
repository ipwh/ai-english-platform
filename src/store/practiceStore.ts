// ============================================
// 練習進度狀態管理 (Zustand) — 專注於練習記錄
// ============================================

import { create } from 'zustand';
import type { PracticeQuestion, DifficultyLevel } from '@/shared/types/types';
import type { CumulativeSkillTotal, WeeklyPracticeSummary } from '@/modules/exercise/services/practice-history-service';
import { useAuthStore } from './authStore';

export interface PracticeSession {
  id: string;
  startedAt: string;
  completedAt?: string;
  questions: PracticeQuestion[];
  answers: Record<string, string>;
  /**
   * 每題判定。2026-09-15：`null` = 開放式（寫作）題目，不自動評分 —
   * 不計入對錯，也不進分母（不得向學生聲稱答錯）。
   */
  results: Record<string, boolean | null>;
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

/** 每週統計 + 正典連續練習天數（皆由伺服器提供） */
type ServerWeeklyStats = WeeklyPracticeSummary & { streakDays: number };

interface PracticeState {
  practiceSessions: PracticeSession[];
  currentSession: PracticeSession | null;
  /**
   * 伺服器端**累積**技能題數（全歷史、只計已驗證 evidence）。
   * 技能掌握度的唯一來源 —— 不得再由 `practiceSessions` 視窗推算
   * （2026-09-20 稽核：最新 50 場視窗會令題數隨練習推移而下降）。
   */
  cumulativeSkillTotals: CumulativeSkillTotal[];
  /**
   * 伺服器端每週摘要（香港日界線）+ 連續天數。
   * `null` = 尚未載入（顯示 0，**不以視窗推算回退**）。
   */
  serverWeekly: ServerWeeklyStats | null;

  // 動作
  startSession: (session: PracticeSession) => void;
  submitAnswer: (questionId: string, answer: string, isCorrect: boolean | null) => void;
  completeSession: () => void;
  loadPracticeHistory: () => Promise<void>;
  getMasteryBySkill: () => { skill: string; skillZh: string; accuracy: number; total: number }[];
  getRecentSessions: (limit?: number) => PracticeSession[];
  getWeeklyStats: () => { questionsDone: number; accuracy: number | null; sessionsCount: number; streakDays: number };
  clearCurrentSession: () => void;
}

export const usePracticeStore = create<PracticeState>((set, get) => ({
  practiceSessions: [],
  currentSession: null,
  cumulativeSkillTotals: [],
  serverWeekly: null,

  startSession: (session) => {
    set({ currentSession: session });
  },

  submitAnswer: (questionId, answer, isCorrect) => {
    const { currentSession } = get();
    if (!currentSession) return;

    const newAnswers = { ...currentSession.answers, [questionId]: answer };
    const newResults = { ...currentSession.results, [questionId]: isCorrect };
    // Only explicitly-correct answers count; `null` (open-ended) is never a score.
    const newCorrectCount = Object.values(newResults).filter(v => v === true).length;

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
      correctCount: Object.values(currentSession.results).filter(v => v === true).length,
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
          // 2026-09-20 稽核：累積／每週指標一律採用伺服器投影；
          // `sessions` 只作「最近練習記錄」顯示，且**不得**作任何累積計算的來源。
          set({
            practiceSessions: deduped,
            cumulativeSkillTotals: Array.isArray(data.skillTotals) ? data.skillTotals : [],
            serverWeekly: data.weekly ?? null,
          });
        }
      }
    } catch {
      // Non-critical
    }
  },

  getMasteryBySkill: () => {
    // R3.10-C.2: scored 技能數據只計伺服器已驗證 evidence；
    // 且必須是**累積**（全歷史）投影，不得由最新 50 場視窗推算
    // （2026-09-20 稽核：視窗會令題數隨練習推移而下降甚至整列消失）。
    return get().cumulativeSkillTotals.map((t) => ({
      skill: t.skill,
      skillZh: t.skillZh,
      accuracy: t.questions > 0 ? Math.round((t.correct / t.questions) * 100) : 0,
      total: t.questions,
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
    // 2026-09-20 稽核：每週題數／準確率原本由「最新 50 場 ∩ 7 日」在客戶端推算，
    // 爆量學生的本週題數同樣被截斷；連續天數更是只覆蓋 1–2 日。
    // 現一律採用伺服器（香港日界線）投影；未載入時回 0，**不作視窗回退**。
    const { serverWeekly } = get();
    if (!serverWeekly) {
      // accuracy: null = 尚未載入或尚無已驗證資料（顯示層以「—」呈現，不作 0% 回退）
      return { questionsDone: 0, accuracy: null, sessionsCount: 0, streakDays: 0 };
    }
    return {
      questionsDone: serverWeekly.questionsDone,
      accuracy: serverWeekly.accuracy,
      sessionsCount: serverWeekly.sessionsCount,
      streakDays: serverWeekly.streakDays,
    };
  },
}));
