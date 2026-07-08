// ============================================
// 全域狀態管理 (Zustand) — AI 英語學習平台
// 支援 JWT 認證同步
// ============================================

import { create } from 'zustand';
import type { UserRole, Notification, PracticeQuestion, DifficultyLevel } from '@/lib/types';
import { mockNotifications } from '@/lib/mock-data';

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
  mobileMenuOpen: boolean;

  // 通知
  notifications: Notification[];
  unreadCount: number;

  // === 練習進度追蹤 ===
  practiceSessions: PracticeSession[];
  currentSession: PracticeSession | null;

  // 動作 — 認證
  login: (role: UserRole) => void;
  logout: () => Promise<void>;
  initSession: () => Promise<void>;
  switchRole: (role: UserRole) => void;
  toggleDarkMode: () => void;
  toggleLanguage: () => void;
  toggleSidebar: () => void;
  toggleMobileMenu: () => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  // 動作 — 練習
  startSession: (session: PracticeSession) => void;
  submitAnswer: (questionId: string, answer: string, isCorrect: boolean) => void;
  completeSession: () => void;
  clearCurrentSession: () => void;
  getMasteryBySkill: () => { skill: string; skillZh: string; accuracy: number; total: number }[];
  getRecentSessions: (limit?: number) => PracticeSession[];
  getWeeklyStats: () => { questionsDone: number; accuracy: number; sessionsCount: number };
}

export const useAppStore = create<AppState>((set, get) => ({
  // 預設值
  isLoggedIn: false,
  currentRole: null,
  userId: null,
  userDisplayName: null as string | null,
  isDarkMode: typeof window !== 'undefined' ? localStorage.getItem('darkMode') === 'true' : false,
  language: (typeof window !== 'undefined' ? localStorage.getItem('lang') : null) as 'zh' | 'en' | null || 'zh',
  sidebarOpen: true,
  mobileMenuOpen: false,
  notifications: mockNotifications,
  unreadCount: mockNotifications.filter(n => !n.read).length,
  practiceSessions: [],
  currentSession: null,

  // === 認證動作 ===

  login: (role: UserRole) => {
    set({ isLoggedIn: true, currentRole: role });
  },

  logout: async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
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

  switchRole: (role: UserRole) => {
    set({ currentRole: role });
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

  toggleLanguage: () => {
    set((state) => {
      const next = state.language === 'zh' ? 'en' : 'zh';
      if (typeof window !== 'undefined') localStorage.setItem('lang', next);
      return { language: next };
    });
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  toggleMobileMenu: () => {
    set((state) => ({ mobileMenuOpen: !state.mobileMenuOpen }));
  },

  markNotificationRead: (id: string) => {
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
    });
  },

  markAllNotificationsRead: () => {
    set((state) => {
      const notifications = state.notifications.map((n) => ({ ...n, read: true }));
      return { notifications, unreadCount: 0 };
    });
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
      return {
        practiceSessions: [completed, ...state.practiceSessions].slice(0, 50),
        currentSession: null,
      };
    });
  },

  clearCurrentSession: () => {
    set({ currentSession: null });
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

    return { questionsDone, accuracy, sessionsCount: weekSessions.length };
  },
}));
