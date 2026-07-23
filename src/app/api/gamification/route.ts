// ============================================
// Gamification API — XP、徽章、排行榜
// Sprint 61: Delegates to StudentStateMutationService (CQRS write path)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { buildLeaderboard } from '@/modules/student/progress/services/gamification';
import type { XpEvent } from '@/modules/student/progress/services/gamification';
import { getLeaderboard } from '@/modules/student';
import { studentStateMutationService } from '@/modules/student/state/StudentStateMutationService';

// GET — 取得學生 gamification 狀態
export async function GET(req: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(req);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');
    const action = searchParams.get('action') || 'status';

    if (!studentId) {
      return NextResponse.json({ error: '缺少 studentId' }, { status: 400 });
    }

    // 🔒 Ownership: students can only view their own gamification data
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能查看自己的遊戲化數據' }, { status: 403 });
    }

    if (action === 'leaderboard') {
      const students = await getLeaderboard(50);

      const leaderboard = buildLeaderboard(
        students.map(s => ({
          ...s,
          xp: (s as { xp?: number }).xp ?? 0,
          overallAccuracy: s.overallAccuracy ?? undefined,
        }))
      );

      return NextResponse.json({ leaderboard });
    }

    // Default: student stats + badges — delegated to mutation service
    const { allBadges, newBadges } = await studentStateMutationService.checkAndAwardBadges(studentId);
    const engagement = await studentStateMutationService.getEngagementStats(studentId);

    return NextResponse.json({
      xp: engagement.xp,
      level: { level: engagement.level, title: `Level ${engagement.level}`, titleZh: `第 ${engagement.level} 級` },
      badges: allBadges,
      stats: engagement.stats,
      newBadges: newBadges.length > 0 ? newBadges : undefined,
    });
  } catch (error) {
    logger.error({ module: 'gamification', error: error instanceof Error ? error.message : String(error) }, 'Gamification GET failed');
    return NextResponse.json({
      xp: 0,
      level: { level: 1, title: 'Level 1', titleZh: '第 1 級' },
      badges: [],
      stats: { totalQuestions: 0, totalSessions: 0 },
    });
  }
}

// POST — 記錄 XP 事件
export async function POST(req: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(req);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { studentId, event } = body as {
      studentId: string;
      event: XpEvent;
    };

    if (!studentId || !event) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
    }

    // 🔒 Ownership: students can only record XP events for themselves
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能記錄自己的 XP 事件' }, { status: 403 });
    }

    const { xpGained, newLevel } = await studentStateMutationService.awardXp(studentId, event);

    return NextResponse.json({ xpGained, newLevel });
  } catch (error) {
    logger.error({ module: 'gamification', error: error instanceof Error ? error.message : String(error) }, 'Gamification POST failed');
    return NextResponse.json({ error: '記錄 XP 失敗' }, { status: 500 });
  }
}

