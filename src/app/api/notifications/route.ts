// ============================================
// GET /api/notifications — 使用者通知列表
// POST /api/notifications — 建立通知（系統內部用）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifySessionToken } from '@/shared/auth/jwt';
import { auth } from '@/shared/auth/auth-next';
import { validateRequest, notificationCreateSchemaApi } from '@/shared/validation/schemas';

async function getUserId(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get('session_token')?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) return payload.userId;
  }
  const session = await auth();
  if (session?.user?.id) return session.user.id;
  return null;
}

// GET — 取得使用者通知
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const notifications = await db.notification.findMany({
      where: { userId },
      select: {
        id: true, type: true, title: true, message: true,
        link: true, read: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    const unreadCount = await db.notification.count({
      where: { userId, read: false },
    });

    return NextResponse.json({ notifications, unreadCount });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — 建立通知 或 標記通知為已讀
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();

    // 標記全部已讀
    if (body.markAllRead) {
      await db.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    // 標記單一通知已讀
    if (body.notificationId) {
      await db.notification.update({
        where: { id: body.notificationId, userId },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    // 建立新通知（由前端直接呼叫，如成就解鎖）
    if (body.type && body.title && body.message) {
      const notification = await db.notification.create({
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
