import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// GET /api/notifications — 使用者通知列表
// POST /api/notifications — 建立通知（系統內部用）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { listNotifications, countUnreadNotifications } from '@/modules/student';

// R3.10-K Step 6: self-service notifications are Zod-validated, capped, and
// ALWAYS addressed to the authenticated user — `body.userId` is never read.
const selfNotificationSchema = z.object({
  type: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  link: z
    .string()
    .max(500)
    .refine(v => v === '' || v.startsWith('/') || /^https?:\/\//i.test(v), 'Invalid link')
    .optional(),
});

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
      await adminDbQuery('notification', 'updateMany', {
        where: { userId, read: false },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    // 標記單一通知已讀
    if (body.notificationId) {
      await adminDbQuery('notification', 'update', {
        where: { id: body.notificationId, userId },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    // 建立新通知（由前端直接呼叫，如成就解鎖）
    if (body.type && body.title && body.message) {
      // R3.10-K Step 6: recipient is ALWAYS the authenticated user.
      const parsed = selfNotificationSchema.safeParse({
        type: body.type,
        title: body.title,
        message: body.message,
        link: typeof body.link === 'string' ? body.link : undefined,
      });
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid notification payload' }, { status: 400 });
      }
      const notification = await adminDbQuery('notification', 'create', {
        data: {
          userId,
          ...parsed.data,
          link: parsed.data.link || null,
        },
      });
      return NextResponse.json({ success: true, id: notification.id }, { status: 201 });
    }

    return NextResponse.json({ error: '請提供 markAllRead、notificationId 或 type/title/message / Please provide markAllRead, notificationId or type/title/message' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
