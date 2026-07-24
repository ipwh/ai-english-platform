// ============================================
// 認證狀態管理 (Zustand) — 專注於認證邏輯
// ============================================

import { create } from 'zustand';
import type { UserRole } from '@/shared/types/types';

interface AuthState {
  // 認證狀態
  isLoggedIn: boolean;
  currentRole: UserRole | null;
  userId: string | null;
  userDisplayName: string | null;

  // 動作
  login: (role: UserRole) => void;
  logout: () => Promise<void>;
  initSession: () => Promise<void>;
  setAuth: (auth: { userId: string; role: UserRole; displayName: string | null }) => void;
}

export const useAuthStore = create<AuthState>((set, _get) => ({
  isLoggedIn: false,
  currentRole: null,
  userId: null,
  userDisplayName: null,

  setAuth: (auth) => set({
    isLoggedIn: true,
    currentRole: auth.role,
    userId: auth.userId,
    userDisplayName: auth.displayName,
  }),

  login: (role: UserRole) => {
    set({ isLoggedIn: true, currentRole: role });
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Non-critical
    }
    set({ isLoggedIn: false, currentRole: null, userId: null, userDisplayName: null });
  },

  initSession: async () => {
    // 優先檢查 JWT session（密碼登入）
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
    } catch {
      // Fallback to NextAuth
    }

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
    } catch {
      // 未登入
    }
  },
}));
