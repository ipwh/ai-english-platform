// ============================================
// POST /api/admin/login-logs — 記錄登入事件
// GET  /api/admin/login-logs — 查詢登入記錄（管理員）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifySessionToken } from '@/lib/jwt';
import { auth } from '@/lib/auth-next';
import { verifyAdmin } from '@/lib/admin-auth';

// POST — 記錄登入（由前端在登入/role-select 後呼叫）
export async function POST(request: NextRequest) {
  try {
    // 🔒 Auth check — require at least one valid session
    const jwtToken =
      request.cookies.get('session_token')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', '') ||
      '';
    let isAuthenticated = false;

    if (jwtToken) {
      const payload = await verifySessionToken(jwtToken);
      if (payload) isAuthenticated = true;
    }

    if (!isAuthenticated) {
      try {
        const session = await auth();
        if (session?.user?.id) isAuthenticated = true;
      } catch { /* NextAuth fallback */ }
    }

    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { userId, userEmail, userName, role } = body;

    if (!userId || !userEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
    const userAgent = request.headers.get('user-agent') || '';

    const log = await db.loginLog.create({
      data: {
        userId,
        userEmail,
        userName: userName || null,
        role: role || 'student',
        ipAddress: ip,
        userAgent: userAgent?.slice(0, 500),
      },
    });

    return NextResponse.json({ id: log.id }, { status: 201 });
  } catch (err: unknown) {
    console.error('[LoginLog POST]', err);
    return NextResponse.json({ error: 'Failed to log login' }, { status: 500 });
  }
}

// GET — 查詢登入記錄（管理員用）
export async function GET(request: NextRequest) {
  // 🔒 Admin-only access
  const adminResult = await verifyAdmin(request);
  if (!adminResult.authenticated) {
    return NextResponse.json({ error: adminResult.error || 'Unauthorized' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '50')));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      db.loginLog.findMany({
        orderBy: { loginAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          userId: true,
          userEmail: true,
          userName: true,
          role: true,
          ipAddress: true,
          loginAt: true,
          duration: true,
        },
      }),
      db.loginLog.count(),
    ]);

    return NextResponse.json({
      logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: unknown) {
    console.error('[LoginLog GET]', err);
    return NextResponse.json({ logs: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }, { status: 500 });
  }
}
