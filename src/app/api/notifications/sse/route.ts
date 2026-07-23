// ============================================
// API: GET /api/notifications/sse — Server-Sent Events stream
// Real-time notification push replacing polling
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { listNotifications, getUnreadNotificationCount, markNotificationsRead } from '@/modules/student';

// Vercel: serverless functions don't support persistent SSE connections.
// For production, consider using Vercel Edge + Streaming or a dedicated
// real-time service (Pusher, Ably, Supabase Realtime).
// This endpoint provides a RESPONSE that the client can poll efficiently.

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since'); // ISO timestamp

  try {
    const where: Record<string, unknown> = { userId: authResult.userId };
    if (since) {
      where.createdAt = { gt: new Date(since) };
    }

    const notifications = await (await import('@/shared/db/db')).db.notification.findMany({
      where,
      select: {
        id: true, type: true, title: true, message: true,
        link: true, read: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const unreadCount = await (await import('@/shared/db/db')).db.notification.count({
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
      await (await import('@/shared/db/db')).db.notification.updateMany({
        where: { userId: authResult.userId, read: false },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    if (id) {
      await (await import('@/shared/db/db')).db.notification.update({
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

