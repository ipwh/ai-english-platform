// ============================================
// API: GET/POST /api/user/preferences
// 同步用戶偏好設定（語言、深色模式、通知）
// 支援跨裝置一致體驗
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;
  try {

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
          notifSubmission: true,
          notifFeedback: true,
          notifAchievement: true,
          notifSystem: true,
        },
      });
    }

    return NextResponse.json({ preferences: prefs });
  } catch (err) {
    logger.error({ module: 'preferences', error: err instanceof Error ? err.message : String(err) }, 'Preferences GET failed');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;
  try {

    const body = await request.json();
    const { language, darkMode, sidebarOpen, notifAssignment, notifSubmission, notifFeedback, notifAchievement, notifSystem } = body;

    const prefs = await db.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        language: language || 'zh',
        darkMode: darkMode ?? false,
        sidebarOpen: sidebarOpen ?? true,
        notifAssignment: notifAssignment ?? true,
        notifSubmission: notifSubmission ?? true,
        notifFeedback: notifFeedback ?? true,
        notifAchievement: notifAchievement ?? true,
        notifSystem: notifSystem ?? true,
      },
      update: {
        ...(language ? { language } : {}),
        ...(darkMode !== undefined ? { darkMode } : {}),
        ...(sidebarOpen !== undefined ? { sidebarOpen } : {}),
        ...(notifAssignment !== undefined ? { notifAssignment } : {}),
        ...(notifSubmission !== undefined ? { notifSubmission } : {}),
        ...(notifFeedback !== undefined ? { notifFeedback } : {}),
        ...(notifAchievement !== undefined ? { notifAchievement } : {}),
        ...(notifSystem !== undefined ? { notifSystem } : {}),
      },
    });

    return NextResponse.json({ preferences: prefs });
  } catch (err) {
    logger.error({ module: 'preferences', error: err instanceof Error ? err.message : String(err) }, 'Preferences POST failed');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
