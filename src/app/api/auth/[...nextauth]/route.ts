// ============================================
// NextAuth.js API Route — /api/auth/*
// 處理 Google OAuth 回調、登入、登出
// ============================================

import { handlers } from '@/lib/auth-next';

export const { GET, POST } = handlers;
