// ============================================
// UI 狀態管理 (Zustand) — 專注於 UI 偏好設定
// 語言、深色模式、Sidebar、通知設定
// ============================================

import { create } from 'zustand';

interface UIState {
  // UI 狀態
  isDarkMode: boolean;
  language: 'zh' | 'en';
  sidebarOpen: boolean;

  // 動作 — UI
  toggleDarkMode: () => void;
  toggleLanguage: () => void;
  toggleSidebar: () => void;
  setDarkMode: (dark: boolean) => void;
  setLanguage: (lang: 'zh' | 'en') => void;

  // 動作 — 偏好設定（hydration-safe）
  hydrateStoredPrefs: () => void;
  /** 從後端拉取偏好設定（跨裝置同步） */
  syncPreferencesFromServer: () => Promise<void>;
  /** 將當前偏好設定推送至後端 */
  syncPreferencesToServer: () => Promise<void>;
}

export const useUIStore = create<UIState>((set, get) => ({
  // 初始值必須與伺服器端一致（避免 hydration mismatch）
  isDarkMode: false,
  language: 'zh' as 'zh' | 'en',
  sidebarOpen: true,

  toggleLanguage: () => {
    set((state) => {
      const next = state.language === 'zh' ? 'en' : 'zh';
      if (typeof window !== 'undefined') localStorage.setItem('lang', next);
      setTimeout(() => get().syncPreferencesToServer(), 0);
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
      setTimeout(() => get().syncPreferencesToServer(), 0);
      return { isDarkMode: next };
    });
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  setDarkMode: (dark) => {
    set({ isDarkMode: dark });
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(dark));
      document.documentElement.classList.toggle('dark', dark);
    }
  },

  setLanguage: (lang) => {
    set({ language: lang });
    if (typeof window !== 'undefined') localStorage.setItem('lang', lang);
  },

  hydrateStoredPrefs: () => {
    if (typeof window === 'undefined') return;
    const storedLang = localStorage.getItem('lang') as 'zh' | 'en' | null;
    const storedDark = localStorage.getItem('darkMode');
    const updates: Partial<UIState> = {};
    if (storedLang === 'zh' || storedLang === 'en') updates.language = storedLang;
    if (storedDark === 'true') {
      updates.isDarkMode = true;
      document.documentElement.classList.add('dark');
    }
    if (Object.keys(updates).length > 0) set(updates);
    // After hydrating from localStorage, pull remote preferences
    get().syncPreferencesFromServer();
  },

  syncPreferencesFromServer: async (forceUserId?: string) => {
    // 透過 cookie 檢查登入狀態（避免 cross-store import）
    const hasSession = typeof document !== 'undefined' &&
      (document.cookie.includes('session_token') ||
       document.cookie.includes('next-auth.session-token') ||
       document.cookie.includes('authjs.session-token'));

    if (!hasSession && !forceUserId) return;

    try {
      const res = await fetch('/api/user/preferences');
      if (!res.ok) return;
      const data = await res.json();
      const prefs = data.preferences;
      if (!prefs) return;

      const updates: Partial<UIState> = {};
      if (prefs.language === 'zh' || prefs.language === 'en') {
        updates.language = prefs.language;
        localStorage.setItem('lang', prefs.language);
      }
      if (typeof prefs.darkMode === 'boolean') {
        updates.isDarkMode = prefs.darkMode;
        localStorage.setItem('darkMode', String(prefs.darkMode));
        if (prefs.darkMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
      // Sync notification prefs to localStorage
      const notifSettings: Record<string, boolean> = {};
      if (typeof prefs.notifAssignment === 'boolean') notifSettings.assignment = prefs.notifAssignment;
      if (typeof prefs.notifSubmission === 'boolean') notifSettings.submission = prefs.notifSubmission;
      if (typeof prefs.notifFeedback === 'boolean') notifSettings.feedback = prefs.notifFeedback;
      if (typeof prefs.notifAchievement === 'boolean') notifSettings.achievement = prefs.notifAchievement;
      if (typeof prefs.notifSystem === 'boolean') notifSettings.system = prefs.notifSystem;
      if (Object.keys(notifSettings).length > 0) {
        localStorage.setItem('notif-settings', JSON.stringify(notifSettings));
      }

      if (Object.keys(updates).length > 0) set(updates);
    } catch {
      // non-critical
    }
  },

  syncPreferencesToServer: async () => {
    const { language, isDarkMode } = get();
    try {
      let notifPrefs: Record<string, boolean> = {};
      try {
        const raw = localStorage.getItem('notif-settings');
        if (raw) notifPrefs = JSON.parse(raw);
      } catch {
        /* ignore */
      }

      await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          darkMode: isDarkMode,
          notifAssignment: notifPrefs.assignment ?? true,
          notifSubmission: notifPrefs.submission ?? true,
          notifFeedback: notifPrefs.feedback ?? true,
          notifAchievement: notifPrefs.achievement ?? true,
          notifSystem: notifPrefs.system ?? true,
        }),
      });
    } catch {
      // non-critical
    }
  },
}));
