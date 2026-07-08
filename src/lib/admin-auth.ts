// ============================================
// Admin Auth Helper — 雙重認證（JWT + NextAuth）
// 供所有 /api/admin/* 路由使用
// ============================================

import { type NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/jwt';
import { auth } from '@/lib/auth-next';
import db from '@/lib/db';

export interface AdminAuthResult {
  authorized: boolean;
  userId?: string;
  error?: string;
}

/**
 * 驗證請求是否來自管理員
 * 優先檢查 JWT session_token，其次檢查 NextAuth session
 */
export async function verifyAdmin(request: NextRequest): Promise<AdminAuthResult> {
  // 1. Check JWT session_token cookie
  const jwtToken =
    request.cookies.get('session_token')?.value ||
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    '';

  if (jwtToken) {
    const payload = await verifySessionToken(jwtToken);
    if (payload && payload.role === 'admin') {
      return { authorized: true, userId: payload.userId };
    }
    if (payload && payload.role !== 'admin') {
      return { authorized: false, error: '權限不足：僅管理員可存取' };
    }
  }

  // 2. Fallback: NextAuth session (Google OAuth)
  try {
    const session = await auth();
    if (session?.user?.id) {
      const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
      });
      if (user?.role === 'admin') {
        return { authorized: true, userId: session.user.id };
      }
      return { authorized: false, error: '權限不足：僅管理員可存取' };
    }
  } catch {
    // NextAuth not available or failed
  }

  return { authorized: false, error: '請先登入管理員帳號' };
}
