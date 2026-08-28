// ============================================
// Gamification API — XP、徽章、排行榜
// Sprint 61: Delegates to StudentStateMutationService (CQRS write path)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { buildLeaderboard } from '@/modules/student/progress/services/gamification';
import type { XpEvent } from '@/modules/student/progress/services/gamification';
import { getLeaderboard, getDailyGoalProgress, getWeeklyActiveDays, findUserByIdSelect } from '@/modules/student';
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
      return NextResponse.json({ error: '缺少 studentId / studentId is required' }, { status: 400 });
    }

    // 🔒 Ownership: students can only view their own gamification data
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能查看自己的遊戲化數據 / You can only view your own gamification data' }, { status: 403 });
    }

    if (action === 'leaderboard') {
      const students = await getLeaderboard(50);

      // Sprint 133: 初中（S1-S3）排行榜改按「本週活躍日數」而非總 XP，
      // 避免強化刷題；高中維持 XP 排名。
      const viewer = await findUserByIdSelect(studentId, { level: true }).catch(() => null) as { level?: string | null } | null;
      const junior = viewer?.level ? ['S1', 'S2', 'S3'].includes(viewer.level) : false;
      let options: { metric: 'xp' | 'weekly-active-days'; weeklyActiveDays?: Map<string, number> } = { metric: 'xp' };
      if (junior) {
        const weekStart = new Date();
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - 6);
        const weeklyActiveDays = await getWeeklyActiveDays(students.map((s: { id: string }) => s.id), weekStart);
        options = { metric: 'weekly-active-days', weeklyActiveDays };
      }

      const leaderboard = buildLeaderboard(
        students.map(s => ({
          ...s,
          xp: (s as { xp?: number }).xp ?? 0,
          overallAccuracy: s.overallAccuracy ?? undefined,
        })),
        options,
      );

      return NextResponse.json({ leaderboard });
    }

    // Default: student stats + badges — delegated to mutation service
    const { allBadges, newBadges } = await studentStateMutationService.checkAndAwardBadges(studentId);
    const engagement = await studentStateMutationService.getEngagementStats(studentId);

    // Sprint 133: daily goal with depth requirement
    const viewer = await findUserByIdSelect(studentId, { level: true }).catch(() => null) as { level?: string | null } | null;
    const dailyGoal = await getDailyGoalProgress(studentId, viewer?.level ?? undefined);

    return NextResponse.json({
      xp: engagement.xp,
      level: { level: engagement.level, title: `Level ${engagement.level}`, titleZh: `第 ${engagement.level} 級` },
      badges: allBadges,
      stats: engagement.stats,
      newBadges: newBadges.length > 0 ? newBadges : undefined,
      dailyGoal,
    });
  } catch (error) {
    logger.error({ module: 'gamification', error: error instanceof Error ? error.message : String(error) }, 'Gamification GET failed');
    return NextResponse.json({ error: 'Failed to load gamification data' }, { status: 500 });
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
      return NextResponse.json({ error: '缺少必要參數 / Missing required parameters' }, { status: 400 });
    }

    // 🔒 Ownership: students can only record XP events for themselves
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能記錄自己的 XP 事件 / You can only record your own XP events' }, { status: 403 });
    }

    const { xpGained, newLevel } = await studentStateMutationService.awardXp(studentId, event);

    return NextResponse.json({ xpGained, level: newLevel });
  } catch (error) {
    logger.error({ module: 'gamification', error: error instanceof Error ? error.message : String(error) }, 'Gamification POST failed');
    return NextResponse.json({ error: '記錄 XP 失敗 / Failed to record XP' }, { status: 500 });
  }
}

