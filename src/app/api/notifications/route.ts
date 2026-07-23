// ============================================
// GET /api/notifications — 使用者通知列表
// POST /api/notifications — 建立通知（系統內部用）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { listNotifications, countUnreadNotifications, markNotificationRead, markNotificationsRead, createNotification } from '@/modules/student';

// GET — 取得使用者通知
export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;
  try {

    const notifications = await listNotifications(userId, 30);
    const unreadCount = await countUnreadNotifications(userId);

    return NextResponse.json({ notifications, unreadCount });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — 建立通知 或 標記通知為已讀
export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;
  try {

    const body = await request.json();

    // 標記全部已讀
    if (body.markAllRead) {
      await (await import('@/shared/db/db')).db.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    // 標記單一通知已讀
    if (body.notificationId) {
      await (await import('@/shared/db/db')).db.notification.update({
        where: { id: body.notificationId, userId },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    // 建立新通知（由前端直接呼叫，如成就解鎖）
    if (body.type && body.title && body.message) {
      const notification = await (await import('@/shared/db/db')).db.notification.create({
        data: {
          userId: body.userId || userId,
          type: body.type,
          title: body.title,
          message: body.message,
          link: body.link || null,
        },
      });
      return NextResponse.json({ success: true, id: notification.id }, { status: 201 });
    }

    return NextResponse.json({ error: '請提供 markAllRead、notificationId 或 type/title/message' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
