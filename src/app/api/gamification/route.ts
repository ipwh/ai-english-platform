// ============================================
// Gamification API — XP、徽章、排行榜
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { calculateXp, getLevelInfo, checkNewBadges, getAllBadges, buildLeaderboard, type BadgeCheckStats } from '@/lib/gamification';
import type { XpEvent } from '@/lib/gamification';

// GET — 取得學生 gamification 狀態
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');
    const action = searchParams.get('action') || 'status';

    if (!studentId) {
      return NextResponse.json({ error: '缺少 studentId' }, { status: 400 });
    }

    if (action === 'leaderboard') {
      const classId = searchParams.get('classId');
      const where = classId ? { classId } : { role: 'student' };

      const students = await db.user.findMany({
        where: { ...where, role: 'student' },
        select: {
          id: true,
          classNumber: true,
          nameEn: true,
          streakDays: true,
          overallAccuracy: true,
        },
      });

      const leaderboard = buildLeaderboard(
        students.map(s => ({
          ...s,
          xp: 0, // XP not stored yet
          overallAccuracy: s.overallAccuracy ?? undefined,
        }))
      );

      return NextResponse.json({ leaderboard });
    }

    // Default: student stats + badges
    const [student, totalQuestions, vocabMastered, writingCount, sessionsCount] = await Promise.all([
      db.user.findUnique({
        where: { id: studentId },
        select: { streakDays: true, overallAccuracy: true },
      }),
      db.practiceSession.count({ where: { studentId } }),
      db.vocabItem.count({ where: { studentId, familiarity: 'mastered' } }),
      db.writingDraft.count({ where: { studentId } }),
      db.practiceSession.count({ where: { studentId } }),
    ]);

    const stats: BadgeCheckStats = {
      totalQuestions,
      overallAccuracy: student?.overallAccuracy ?? 0,
      streakDays: student?.streakDays ?? 0,
      sessionsCompleted: sessionsCount,
      wordsMastered: vocabMastered,
      writingSubmissions: writingCount,
      diagnosticCompleted: false,
      skillAccuracy: {},
    };

    const xp = totalQuestions * 5; // simple XP calculation
    const levelInfo = getLevelInfo(xp);
    const allBadges = getAllBadges(stats, []);

    return NextResponse.json({
      xp,
      level: levelInfo,
      badges: allBadges,
      stats,
    });
  } catch (error) {
    console.error('[Gamification GET]', error);
    return NextResponse.json({ error: '無法載入遊戲化數據' }, { status: 500 });
  }
}

// POST — 記錄 XP 事件
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { studentId, event } = body as {
      studentId: string;
      event: XpEvent;
    };

    if (!studentId || !event) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
    }

    const xpGained = calculateXp(event);

    return NextResponse.json({
      success: true,
      xpGained,
      event: event.type,
    });
  } catch (error) {
    console.error('[Gamification POST]', error);
    return NextResponse.json({ error: '無法記錄 XP' }, { status: 500 });
  }
}
