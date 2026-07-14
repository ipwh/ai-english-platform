// ============================================
// Gamification API — XP、徽章、排行榜
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyApiAuth } from '@/lib/api-auth';
import { calculateXp, getLevelInfo, checkNewBadges, getAllBadges, buildLeaderboard, type BadgeCheckStats } from '@/lib/gamification';
import type { XpEvent } from '@/lib/gamification';

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
          xp: true,
        },
      });

      const leaderboard = buildLeaderboard(
        students.map(s => ({
          ...s,
          xp: (s as any).xp ?? 0,
          overallAccuracy: s.overallAccuracy ?? undefined,
        }))
      );

      return NextResponse.json({ leaderboard });
    }

    // Default: student stats + badges — each query isolated to survive partial schema
    let student: any = null;
    let practiceSessions: { totalQuestions: number }[] = [];
    let vocabMastered = 0;
    let writingCount = 0;
    let sessionsCount = 0;

    try {
      student = await db.user.findUnique({
        where: { id: studentId },
        select: { streakDays: true, overallAccuracy: true, xp: true, badgeIds: true },
      });
    } catch {
      // Fallback: try without new columns
      student = await db.user.findUnique({
        where: { id: studentId },
        select: { streakDays: true, overallAccuracy: true },
      }).catch(() => null);
    }

    try {
      practiceSessions = await db.practiceSession.findMany({
        where: { studentId },
        select: { totalQuestions: true },
      });
    } catch { /* ignore */ }

    try { vocabMastered = await db.vocabItem.count({ where: { studentId, familiarity: 'mastered' } }); } catch { /* ignore */ }
    try { writingCount = await db.writingDraft.count({ where: { studentId } }); } catch { /* ignore */ }
    try { sessionsCount = await db.practiceSession.count({ where: { studentId } }); } catch { /* ignore */ }

    const totalQuestions = practiceSessions.reduce((sum, s) => sum + s.totalQuestions, 0);

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

    const xp = (student as any)?.xp ?? 0;
    const levelInfo = getLevelInfo(xp);

    // Parse already-unlocked badge IDs
    let alreadyUnlocked: string[] = [];
    try {
      alreadyUnlocked = student?.badgeIds ? JSON.parse(student.badgeIds) : [];
    } catch { alreadyUnlocked = []; }

    const allBadges = getAllBadges(stats, alreadyUnlocked);

    // Auto-award newly earned badges
    const newBadges = checkNewBadges(stats, alreadyUnlocked);
    if (newBadges.length > 0) {
      try {
        const updatedBadgeIds = [...alreadyUnlocked, ...newBadges.map((b: { id: string }) => b.id)];
        await db.user.update({
          where: { id: studentId },
          data: { badgeIds: JSON.stringify(updatedBadgeIds) },
        });
      } catch { /* Silently fail — badges are cosmetic, column may not exist yet */ }
    }

    return NextResponse.json({
      xp,
      level: levelInfo,
      badges: allBadges,
      stats,
      newBadges: newBadges.length > 0 ? newBadges : undefined,
    });
  } catch (error) {
    console.error('[Gamification GET]', error);
    // Return a graceful fallback instead of 500
    return NextResponse.json({
      xp: 0,
      level: getLevelInfo(0),
      badges: [],
      stats: { totalQuestions: 0, overallAccuracy: 0, streakDays: 0, sessionsCompleted: 0, wordsMastered: 0, writingSubmissions: 0, diagnosticCompleted: false, skillAccuracy: {} },
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

    const xpGained = calculateXp(event);

    // 持久化 XP + streakDays（每日登入時遞增）
    const updateData: Record<string, unknown> = { xp: { increment: xpGained } };
    if (event.type === 'dailyLogin') {
      updateData.streakDays = { increment: 1 };
    }
    await db.user.update({
      where: { id: studentId },
      data: updateData as any,
    });

    // XP 交易記錄（完整審計追蹤）
    try {
      await db.xpTransaction.create({
        data: {
          userId: studentId,
          event: event.type,
          xpAmount: xpGained,
          metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        },
      });
    } catch { /* XP 記錄非致命 — 不影響使用者體驗 */ }

    const updated = await db.user.findUnique({
      where: { id: studentId },
      select: { xp: true, streakDays: true },
    });
    const levelInfo = getLevelInfo(updated?.xp ?? xpGained);

    // 檢查新徽章
    let newBadges: { id: string; nameZh: string; icon: string }[] | undefined;
    try {
      const alreadyUnlocked: string[] = [];
      newBadges = checkNewBadges({
        totalQuestions: 0, overallAccuracy: 0,
        streakDays: updated?.streakDays ?? 0,
        sessionsCompleted: 0, wordsMastered: 0,
        writingSubmissions: 0, diagnosticCompleted: false,
        skillAccuracy: {},
      }, alreadyUnlocked);
    } catch { /* ignore */ }

    return NextResponse.json({
      success: true,
      xpGained,
      totalXp: updated?.xp ?? xpGained,
      level: levelInfo.level,
      levelTitle: levelInfo.title,
      xpToNext: levelInfo.xpToNext,
      streakDays: updated?.streakDays ?? 0,
      newBadges: newBadges?.length ? newBadges : undefined,
      event: event.type,
    });
  } catch (error) {
    console.error('[Gamification POST]', error);
    return NextResponse.json({ error: '無法記錄 XP' }, { status: 500 });
  }
}
