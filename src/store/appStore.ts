// ============================================
// 全域狀態管理 (Zustand) — 向後相容匯出
// 已拆分為: authStore | uiStore | practiceStore | notificationStore
// 此檔案保留以維持舊有 import 相容性
// ============================================

import { useAuthStore } from './authStore';
import { useUIStore } from './uiStore';
import { usePracticeStore } from './practiceStore';
import type { PracticeSession as PSSession } from './practiceStore';
import { useNotificationStore } from './notificationStore';
import type { UserRole, Notification, PracticeQuestion, DifficultyLevel } from '@/shared/types/types';

// 重新導出型別
export type PracticeSession = PSSession;

// 重新導出各 store（向後相容）
export { useAuthStore, useUIStore, usePracticeStore, useNotificationStore };

// ============================================
// 複合 AppStore — 向後相容的單一存取點
// 新程式碼請直接使用各別 store
// ============================================

/** 向後相容 hook — 聚合所有 store（新程式碼請用個別 store） */
export const useAppStore = () => {
  const auth = useAuthStore();
  const ui = useUIStore();
  const practice = usePracticeStore();
  const notif = useNotificationStore();

  return {
    // 認證
    isLoggedIn: auth.isLoggedIn,
    currentRole: auth.currentRole,
    userId: auth.userId,
    userDisplayName: auth.userDisplayName,
    login: auth.login,
    logout: auth.logout,
    initSession: auth.initSession,

    // UI
    isDarkMode: ui.isDarkMode,
    language: ui.language,
    sidebarOpen: ui.sidebarOpen,
    toggleDarkMode: ui.toggleDarkMode,
    toggleLanguage: ui.toggleLanguage,
    toggleSidebar: ui.toggleSidebar,
    hydrateStoredPrefs: ui.hydrateStoredPrefs,
    syncPreferencesFromServer: ui.syncPreferencesFromServer,
    syncPreferencesToServer: ui.syncPreferencesToServer,

    // 通知
    notifications: notif.notifications,
    unreadCount: notif.unreadCount,
    setNotifications: notif.setNotifications,

    // 練習
    practiceSessions: practice.practiceSessions,
    currentSession: practice.currentSession,
    startSession: practice.startSession,
    submitAnswer: practice.submitAnswer,
    completeSession: practice.completeSession,
    loadPracticeHistory: practice.loadPracticeHistory,
    getMasteryBySkill: practice.getMasteryBySkill,
    getRecentSessions: practice.getRecentSessions,
    getWeeklyStats: practice.getWeeklyStats,
  };};
