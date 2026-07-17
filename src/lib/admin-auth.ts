// ============================================
// Admin Auth Helper — 薄封裝，委託 verifyApiAuth
// 供所有 /api/admin/* 路由使用
// ============================================

import { type NextRequest } from 'next/server';
import { verifyApiAuth } from '@/lib/api-auth';

export interface AdminAuthResult {
  authorized: boolean;
  userId?: string;
  error?: string;
}

/**
 * 驗證請求是否來自管理員。
 * 現已改為薄封裝，委託 verifyApiAuth(allowedRoles: ['admin'])。
 */
export async function verifyAdmin(request: NextRequest): Promise<AdminAuthResult> {
  const result = await verifyApiAuth(request, ['admin']);
  if (!result.authenticated) {
    return { authorized: false, error: result.error || '請先登入管理員帳號' };
  }
  return { authorized: true, userId: result.userId };
}
