// ============================================
// API Auth Helper — 統一認證檢查（JWT + NextAuth）
// 供所有 /api/* 路由使用，替換分散的 ad-hoc auth
// ============================================

import { type NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/jwt';
import { auth } from '@/lib/auth-next';
import type { UserRole } from '@/lib/types';

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  role?: UserRole;
  error?: string;
}

/**
 * 驗證 API 請求是否來自已登入使用者。
 * 優先檢查 JWT session_token cookie，其次檢查 NextAuth session。
 *
 * @param request - NextRequest
 * @param allowedRoles - 允許的角色列表，不傳則允許所有已登入使用者
 */
export async function verifyApiAuth(
  request: NextRequest,
  allowedRoles?: UserRole[],
): Promise<AuthResult> {
  // 1. Check JWT session_token cookie
  const jwtToken =
    request.cookies.get('session_token')?.value ||
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    '';

  if (jwtToken) {
    const payload = await verifySessionToken(jwtToken);
    if (payload) {
      if (allowedRoles && !allowedRoles.includes(payload.role)) {
        return { authenticated: false, error: '權限不足' };
      }
      return { authenticated: true, userId: payload.userId, role: payload.role };
    }
  }

  // 2. Fallback: NextAuth session (Google OAuth)
  try {
    const session = await auth();
    if (session?.user?.id) {
      const role = (session.user as any)?.role as UserRole | undefined;
      if (allowedRoles && role && !allowedRoles.includes(role)) {
        return { authenticated: false, error: '權限不足' };
      }
      return { authenticated: true, userId: session.user.id, role };
    }
  } catch {
    // NextAuth not available or failed
  }

  return { authenticated: false, error: '請先登入' };
}
