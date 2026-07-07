// ============================================
// API: GET /api/auth/debug — 診斷端點
// 回傳當前 session、cookies、DB role（僅供除錯）
// 部署後請從 Vercel Logs 查看對應輸出
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-next';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
  const cookieMap: Record<string, string> = {};
  request.cookies.getAll().forEach(c => {
    cookieMap[c.name] = c.value.substring(0, 12) + '…';
  });

  const session = await auth();
  let dbRole: string | null = null;
  if (session?.user?.id) {
    try {
      const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
      });
      dbRole = user?.role ?? null;
    } catch {
      dbRole = '(db error)';
    }
  }

  const response = NextResponse.json({
    timestamp: new Date().toISOString(),
    hasSession: !!session?.user?.id,
    sessionUserId: session?.user?.id ?? null,
    sessionRole: session?.user?.role ?? null,
    dbRole,
    cookies: cookieMap,
  });

  console.log('[debug]', {
    hasSession: !!session?.user?.id,
    sessionRole: session?.user?.role ?? null,
    dbRole,
  });

  return response;
}
