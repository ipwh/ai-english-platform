// ============================================
// API: GET /api/auth/debug — 診斷端點（僅開發環境可用）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/auth/auth-next';
import { db } from '@/shared/db/db';
import { logger } from '@/shared/logger/logger';

export async function GET(request: NextRequest) {
  // 🔒 Production guard — never expose session data in production
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
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

  logger.info({ module: 'auth-debug', hasSession: !!session?.user?.id, sessionRole: session?.user?.role ?? null, dbRole }, 'Debug session info');

  return response;
}
