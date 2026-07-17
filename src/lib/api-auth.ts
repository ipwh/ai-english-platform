// ============================================
// API Auth Helper — 統一認證檢查（JWT + NextAuth）
// 供所有 /api/* 路由使用，替換分散的 ad-hoc auth
// ============================================

import { type NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/jwt';
import { auth } from '@/lib/auth-next';
import type { UserRole } from '@/lib/types';
import db from '@/lib/db';

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
       
      const role = (session.user as Record<string, unknown>)?.role as UserRole | undefined;
      // Fix: if allowedRoles is specified but role is undefined/missing, deny access
      // Previously `allowedRoles && role && !allowedRoles.includes(role)` short-circuited
      // when role was undefined, treating "unknown role" as "allowed".
      if (allowedRoles && (!role || !allowedRoles.includes(role))) {
        return { authenticated: false, error: '權限不足' };
      }
      return { authenticated: true, userId: session.user.id, role };
    }
  } catch {
    // NextAuth not available or failed
  }

  return { authenticated: false, error: '請先登入' };
}

// ============================================
// assertOwnership — 統一資源所有權檢查
// 用法：在每個接收 studentId / 資源 id 的 route 第一行呼叫
//
// @param authResult  - verifyApiAuth() 的回傳值
// @param ownerUserId - 資源所屬使用者的 ID（從 DB 查出的 studentId）
// @param resourceName - 資源名稱（用於錯誤訊息）
// ============================================
export function assertOwnership(
  authResult: AuthResult,
  ownerUserId: string,
  resourceName: string = '此資源',
): void {
  if (!authResult.authenticated || !authResult.userId) {
    throw new Error('assertOwnership called without authenticated user');
  }
  // 教師和管理員可以跨使用者存取（由其自身路由層級做班級權限檢查）
  if (authResult.role === 'teacher' || authResult.role === 'admin') return;
  if (authResult.userId !== ownerUserId) {
    throw new Error(`無權限存取${resourceName}`);
  }
}

/**
 * 輔助：先做 auth，再查 DB owner，最後 assertOwnership。
 * 回傳 401/403/404 NextResponse 或 null（表示檢查通過，呼叫方繼續執行）。
 *
 * @param request   - NextRequest
 * @param table     - Prisma 模型名稱（如 'mistake', 'vocabItem'）
 * @param resourceId - 資源的 id
 * @param ownerField - 資源中代表 owner userId 的欄位名稱（預設 'studentId'）
 */
export async function verifyOwnership(
  request: NextRequest,
  table: 'mistake' | 'vocabItem' | 'submission' | 'practiceSession' | 'diagnosticSession' | 'writingDraft',
  resourceId: string,
  ownerField: string = 'studentId',
): Promise<NextResponse | null> {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  // 教師/管理員跳過 owner 檢查（路由層自行處理班級權限）
  if (authResult.role === 'teacher' || authResult.role === 'admin') {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const record = await (db as any)[table].findUnique({
    where: { id: resourceId },
    select: { [ownerField]: true },
  });

  if (!record) {
    return NextResponse.json({ error: '找不到此資源' }, { status: 404 });
  }

  if (record[ownerField] !== authResult.userId) {
    return NextResponse.json({ error: '無權限存取此資源' }, { status: 403 });
  }

  return null;
}
