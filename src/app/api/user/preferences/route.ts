// ============================================
// API: GET/POST /api/user/preferences
// 同步用戶偏好設定（語言、深色模式、通知）
// 支援跨裝置一致體驗
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifySessionToken } from '@/lib/jwt';
import { auth } from '@/lib/auth-next';

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

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const prefs = await db.userPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) {
      // Return defaults
      return NextResponse.json({
        preferences: {
          language: 'zh',
          darkMode: false,
          sidebarOpen: true,
          notifAssignment: true,
          notifFeedback: true,
          notifAchievement: true,
          notifSystem: true,
        },
      });
    }

    return NextResponse.json({ preferences: prefs });
  } catch (err) {
    console.error('[preferences GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { language, darkMode, sidebarOpen, notifAssignment, notifFeedback, notifAchievement, notifSystem } = body;

    const prefs = await db.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        language: language || 'zh',
        darkMode: darkMode ?? false,
        sidebarOpen: sidebarOpen ?? true,
        notifAssignment: notifAssignment ?? true,
        notifFeedback: notifFeedback ?? true,
        notifAchievement: notifAchievement ?? true,
        notifSystem: notifSystem ?? true,
      },
      update: {
        ...(language ? { language } : {}),
        ...(darkMode !== undefined ? { darkMode } : {}),
        ...(sidebarOpen !== undefined ? { sidebarOpen } : {}),
        ...(notifAssignment !== undefined ? { notifAssignment } : {}),
        ...(notifFeedback !== undefined ? { notifFeedback } : {}),
        ...(notifAchievement !== undefined ? { notifAchievement } : {}),
        ...(notifSystem !== undefined ? { notifSystem } : {}),
      },
    });

    return NextResponse.json({ preferences: prefs });
  } catch (err) {
    console.error('[preferences POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
