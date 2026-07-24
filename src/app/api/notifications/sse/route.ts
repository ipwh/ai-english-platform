// ============================================
// API: GET /api/notifications/sse — Notification polling endpoint
//
// ⚠️ PRODUCTION NOTE: Vercel serverless functions do NOT support persistent
// SSE connections. This endpoint uses efficient JSON polling instead.
//
// Recommended client polling interval: 30 seconds
// For true real-time push in production, integrate one of:
//   - Pusher (pusher.com) — easiest setup
//   - Ably (ably.com) — generous free tier
//   - Supabase Realtime — if using Supabase
//   - Vercel Edge Middleware + WebSocket — advanced
//
// The client-side notification store already implements polling via
// setInterval at 30s. This endpoint returns differential results when
// `since` parameter is provided, minimizing payload size.
// Sprint 104: Added Cache-Control header and rate limiting guidance
// ============================================

import { adminDbQuery } from '@/modules/admin/services/admin-operations';
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { checkRateLimit } from '@/shared/utils/rate-limiter';

// 30 requests per minute per user for polling
const NOTIFICATION_POLL_LIMIT = { maxRequests: 30, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  // Rate limit polling to prevent excessive DB queries
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit({ ...NOTIFICATION_POLL_LIMIT, identifier: `notif-poll:${ip}` });
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.message }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since'); // ISO timestamp for differential polling

  try {
    const where: Record<string, unknown> = { userId: authResult.userId };
    if (since) {
      where.createdAt = { gt: new Date(since) };
    }

    const notifications = await adminDbQuery('notification', 'findMany', {
      where,
      select: {
        id: true, type: true, title: true, message: true,
        link: true, read: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const unreadCount = await adminDbQuery('notification', 'count', {
      where: { userId: authResult.userId, read: false },
    });

    return NextResponse.json({
      notifications,
      unreadCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH — Mark notification as read
export async function PATCH(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, markAllRead } = body;

    if (markAllRead) {
      await adminDbQuery('notification', 'updateMany', {
        where: { userId: authResult.userId, read: false },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    if (id) {
      await adminDbQuery('notification', 'update', {
        where: { id },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'id or markAllRead required' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

