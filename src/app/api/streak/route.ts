// ============================================
// API: POST /api/streak — Record daily activity & return streak
// Replaces localStorage-based dailyLogin tracking
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth, verifyStudentSelfAccess } from '@/shared/auth/api-auth';
import { syncUserStreak, calculatePracticeStreak } from '@/modules/student/progress/services/streak-service';
import { calculateXp } from '@/modules/student/progress/services/gamification';
import { getTodaysXpTransaction, createXpTransaction } from '@/modules/student';
import { updateUser } from '@/modules/student';
import { hkStartOfDay } from '@/shared/utils/hk-date';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { studentId } = body;

    if (!studentId) {
      return NextResponse.json({ error: 'studentId required' }, { status: 400 });
    }

    // R3.10-K Step 6: students may only award XP/streak to themselves.
    const ownership = verifyStudentSelfAccess(authResult, studentId);
    if (ownership) return ownership;

    // Sync streak from actual DB activity（登入 + 練習都算活躍日）
    const [streakDays, practiceStreakDays] = await Promise.all([
      syncUserStreak(studentId),
      calculatePracticeStreak(studentId),
    ]);

    // Check if today already has a login log (avoid duplicate XP)
    // 「今日」= 香港日（與連續天數同一日界線，2026-09-20 稽核修正）
    const today = hkStartOfDay();
    const todayLog = await getTodaysXpTransaction(studentId, 'dailyLogin', today);

    // Award dailyLogin XP only once per day.
    // Sprint 133: streakBonus 只隨「練習日」遞增（只登入不漲加成）。
    let xpAwarded = 0;
    if (!todayLog) {
      const xpAmount = calculateXp({ type: 'dailyLogin', streakDays: practiceStreakDays });
      await createXpTransaction({ userId: studentId, event: 'dailyLogin', xpAmount, metadata: JSON.stringify({ streakDays: practiceStreakDays }) });

      await updateUser(studentId, { xp: { increment: xpAmount }, streakDays });

      xpAwarded = xpAmount;
    }

    return NextResponse.json({
      streakDays,
      practiceStreakDays,
      xpAwarded,
      alreadyLoggedToday: !!todayLog,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get('studentId');
  if (!studentId) {
    return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  }

  // R3.10-K Step 6: students may only read their own streak.
  const ownership = verifyStudentSelfAccess(authResult, studentId);
  if (ownership) return ownership;

  const { streakDays, lastActiveDate } = await import('@/modules/student/progress/services/streak-service').then(m =>
    m.calculateStudentStreak(studentId)
  );

  return NextResponse.json({ streakDays, lastActiveDate });
}

