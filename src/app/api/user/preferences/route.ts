// ============================================
// API: GET/POST /api/user/preferences
// 同步用戶偏好設定（語言、深色模式、通知）
// 支援跨裝置一致體驗
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { getUserPreferences, upsertUserPreferences } from '@/modules/student';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;
  try {

    const prefs = await getUserPreferences(userId);

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

    const data: Record<string, unknown> = {};
    if (language) data.language = language;
    if (darkMode !== undefined) data.darkMode = darkMode;
    if (sidebarOpen !== undefined) data.sidebarOpen = sidebarOpen;
    if (notifAssignment !== undefined) data.notifAssignment = notifAssignment;
    if (notifSubmission !== undefined) data.notifSubmission = notifSubmission;
    if (notifFeedback !== undefined) data.notifFeedback = notifFeedback;
    if (notifAchievement !== undefined) data.notifAchievement = notifAchievement;
    if (notifSystem !== undefined) data.notifSystem = notifSystem;

    const prefs = await upsertUserPreferences(userId, data);

    return NextResponse.json({ preferences: prefs });
  } catch (err) {
    logger.error({ module: 'preferences', error: err instanceof Error ? err.message : String(err) }, 'Preferences POST failed');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

