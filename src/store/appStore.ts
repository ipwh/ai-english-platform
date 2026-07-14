// ============================================
// 全域狀態管理 (Zustand) — AI 英語學習平台
// 支援 JWT 認證同步
// ============================================

import { create } from 'zustand';
import type { UserRole, Notification, PracticeQuestion, DifficultyLevel } from '@/lib/types';

// ============================================
// 練習題目（AI 生成或預設）
// ============================================

export interface PracticeSession {
  id: string;
  startedAt: string;
  completedAt?: string;
  questions: PracticeQuestion[];
  answers: Record<string, string>;     // questionId → studentAnswer
  results: Record<string, boolean>;    // questionId → isCorrect
  skill: string;                       // grammarItem or languageSkill
  skillZh: string;
  difficulty: DifficultyLevel;
  totalQuestions: number;
  correctCount: number;
  source: 'ai-generated' | 'mock' | 'assignment';
}

// ============================================
// App Store
// ============================================

interface AppState {
  // 認證狀態
  isLoggedIn: boolean;
  currentRole: UserRole | null;
  userId: string | null;
  userDisplayName: string | null;

  // UI 狀態
  isDarkMode: boolean;
  language: 'zh' | 'en';
  sidebarOpen: boolean;

  // 通知
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (notifications: Notification[], unreadCount: number) => void;

  // === 練習進度追蹤 ===
  practiceSessions: PracticeSession[];
  currentSession: PracticeSession | null;

  // 動作 — 認證
  login: (role: UserRole) => void;
  logout: () => Promise<void>;
  initSession: () => Promise<void>;
  toggleDarkMode: () => void;
  toggleLanguage: () => void;
  toggleSidebar: () => void;

  // 動作 — 偏好設定（hydration-safe）
  hydrateStoredPrefs: () => void;

  // 動作 — 練習
  startSession: (session: PracticeSession) => void;
  submitAnswer: (questionId: string, answer: string, isCorrect: boolean) => void;
  completeSession: () => void;
  loadPracticeHistory: () => Promise<void>;
  getMasteryBySkill: () => { skill: string; skillZh: string; accuracy: number; total: number }[];
  getRecentSessions: (limit?: number) => PracticeSession[];
  getWeeklyStats: () => { questionsDone: number; accuracy: number; sessionsCount: number; streakDays: number };
}

export const useAppStore = create<AppState>((set, get) => ({
  // 預設值
  isLoggedIn: false,
  currentRole: null,
  userId: null,
  userDisplayName: null as string | null,
  // 初始值必須與伺服器端一致（避免 hydration mismatch）
  // localStorage 值在 useEffect（hydrateStoredPrefs）中載入
  isDarkMode: false,
  language: 'zh' as 'zh' | 'en',
  sidebarOpen: true,
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifications, unreadCount) => set({ notifications, unreadCount }),
  practiceSessions: [],
  currentSession: null,

  // === 認證動作 ===

  login: (role: UserRole) => {
    set({ isLoggedIn: true, currentRole: role });
  },

  logout: async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) { console.error('Failed to call logout API:', e); }
    set({ isLoggedIn: false, currentRole: null, userId: null });
  },

  /** 從伺服器 session 初始化登入狀態（JWT 優先，NextAuth 為備援） */
  initSession: async () => {
    // 優先檢查 JWT session（密碼登入）— 確保 demo 帳號不會被 stale NextAuth cookie 覆蓋
    try {
      const jwtRes = await fetch('/api/auth/jwt-session');
      if (jwtRes.ok) {
        const jwtJson = await jwtRes.json();
        if (jwtJson.loggedIn && jwtJson.user) {
          set({
            isLoggedIn: true,
            currentRole: jwtJson.user.role,
            userId: jwtJson.user.userId,
            userDisplayName: jwtJson.user.nameZh || jwtJson.user.nameEn || jwtJson.user.email?.split('@')[0] || null,
          });
          return;
        }
      }
    } catch { /* fallback to NextAuth */ }

    // Fallback: NextAuth session（Google OAuth 登入）
    try {
      const authRes = await fetch('/api/auth/role');
      if (authRes.ok) {
        const authJson = await authRes.json();
        if (authJson.user) {
          set({
            isLoggedIn: true,
            currentRole: (authJson.user.role as UserRole) || 'student',
            userId: authJson.user.id,
            userDisplayName: authJson.user.nameZh || authJson.user.name || authJson.user.email?.split('@')[0] || null,
          });
          return;
        }
      }
    } catch { /* 未登入 */ }
  },

  toggleLanguage: () => {
    set((state) => {
      const next = state.language === 'zh' ? 'en' : 'zh';
      if (typeof window !== 'undefined') localStorage.setItem('lang', next);
      return { language: next };
    });
  },

  toggleDarkMode: () => {
    set((state) => {
      const next = !state.isDarkMode;
      if (typeof window !== 'undefined') {
        localStorage.setItem('darkMode', String(next));
        document.documentElement.classList.toggle('dark', next);
      }
      return { isDarkMode: next };
    });
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  /** 從 localStorage 載入偏好設定（僅在客戶端 mount 後呼叫，避免 hydration mismatch） */
  hydrateStoredPrefs: () => {
    if (typeof window === 'undefined') return;
    const storedLang = localStorage.getItem('lang') as 'zh' | 'en' | null;
    const storedDark = localStorage.getItem('darkMode');
    const updates: Partial<AppState> = {};
    if (storedLang === 'zh' || storedLang === 'en') updates.language = storedLang;
    if (storedDark === 'true') {
      updates.isDarkMode = true;
      document.documentElement.classList.add('dark');
    }
    if (Object.keys(updates).length > 0) set(updates);
  },

  // === 練習動作 ===

  startSession: (session: PracticeSession) => {
    set({ currentSession: session });
  },

  submitAnswer: (questionId: string, answer: string, isCorrect: boolean) => {
    set((state) => {
      if (!state.currentSession) return state;
      const answers = { ...state.currentSession.answers, [questionId]: answer };
      const results = { ...state.currentSession.results, [questionId]: isCorrect };
      const correctCount = Object.values(results).filter(Boolean).length;
      return {
        currentSession: { ...state.currentSession, answers, results, correctCount },
      };
    });
  },

  completeSession: () => {
    set((state) => {
      if (!state.currentSession) return state;
      const completed = {
        ...state.currentSession,
        completedAt: new Date().toISOString(),
      };
      // 持久化到後端 API（含逐題答案）
      const { userId } = get();
      if (userId) {
        const answers = Object.entries(completed.answers).map(([qId, studentAnswer], idx) => {
          const question = completed.questions.find(q => q.id === qId);
          return {
            questionIndex: idx,
            questionType: question?.type || 'mc',
            questionPrompt: question?.prompt || '',
            correctAnswer: question?.answer || '',
            studentAnswer: studentAnswer || '',
            isCorrect: completed.results[qId] ?? false,
          };
        });
        fetch('/api/practice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: userId,
            skill: completed.skill,
            skillZh: completed.skillZh,
            difficulty: completed.difficulty,
            totalQuestions: completed.totalQuestions,
            correctCount: completed.correctCount,
            source: completed.source,
            answers,
          }),
        }).then(r => {
          if (!r.ok) console.warn('[appStore] Practice session may not be persisted:', r.status);
        }).catch((e) => {
          console.error('[appStore] Failed to persist practice session:', e);
        });
      }
      return {
        practiceSessions: [completed, ...state.practiceSessions].slice(0, 50),
        currentSession: completed, // 保留完整 session 供完成摘要使用（completedAt 已設）
      };
    });
  },

  // 從後端載入練習歷史（解決重整後數據歸零的問題）
  // 注意：目前僅載入匯總數據（totalQuestions/correctCount），不載入逐題明細。
  // 逐題明細需新增 PracticeAnswer 資料表後方可實現。
  loadPracticeHistory: async () => {
    const { userId } = get();
    if (!userId) return;
    try {
      const res = await fetch(`/api/practice?studentId=${userId}`);
      if (res.ok) {
        const json = await res.json();
        const sessions: PracticeSession[] = (json.sessions || []).map((s: any) => ({
          id: s.id,
          startedAt: s.startedAt,
          completedAt: s.completedAt || undefined,
          questions: [],
          answers: {},
          results: {},
          skill: s.skill,
          skillZh: s.skillZh,
          difficulty: s.difficulty,
          totalQuestions: s.totalQuestions,
          correctCount: s.correctCount,
          source: s.source,
        }));
        set({ practiceSessions: sessions });
      }
    } catch (e) { console.error('Failed to load practice history:', e); }
  },

  // 取得各技能掌握度
  getMasteryBySkill: () => {
    const { practiceSessions } = get();
    const skillMap = new Map<string, { skillZh: string; correct: number; total: number }>();

    for (const session of practiceSessions) {
      const key = session.skill;
      const existing = skillMap.get(key) || { skillZh: session.skillZh, correct: 0, total: 0 };
      existing.correct += session.correctCount;
      existing.total += session.totalQuestions;
      skillMap.set(key, existing);
    }

    return Array.from(skillMap.entries()).map(([skill, data]) => ({
      skill,
      skillZh: data.skillZh,
      accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      total: data.total,
    }));
  },

  // 取得最近練習記錄
  getRecentSessions: (limit = 5) => {
    return get().practiceSessions.slice(0, limit);
  },

  // 取得本週統計
  getWeeklyStats: () => {
    const { practiceSessions } = get();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekSessions = practiceSessions.filter(s => new Date(s.startedAt) >= weekAgo);

    const questionsDone = weekSessions.reduce((sum, s) => sum + s.totalQuestions, 0);
    const correctTotal = weekSessions.reduce((sum, s) => sum + s.correctCount, 0);
    const accuracy = questionsDone > 0 ? Math.round((correctTotal / questionsDone) * 100) : 0;

    // 計算連續練習天數（從今天往前推算）
    const dates = practiceSessions
      .map(s => new Date(s.startedAt).toISOString().slice(0, 10))
      .filter((d, i, arr) => arr.indexOf(d) === i)
      .sort()
      .reverse();
    let streakDays = 0;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dates[0] === today || dates[0] === yesterday) {
      streakDays = 1;
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1]);
        const curr = new Date(dates[i]);
        if ((prev.getTime() - curr.getTime()) / 86400000 <= 1.5) {
          streakDays++;
        } else break;
      }
    }

    return { questionsDone, accuracy, sessionsCount: weekSessions.length, streakDays };
  },
}));
