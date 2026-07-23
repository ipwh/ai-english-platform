// ============================================
// API: POST /api/streak — Record daily activity & return streak
// Replaces localStorage-based dailyLogin tracking
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { syncUserStreak } from '@/modules/progress/services/streak-service';
import { calculateXp } from '@/modules/progress/services/gamification';
import { getTodaysXpTransaction, createXpTransaction } from '@/modules/student';
import { updateUser } from '@/modules/student';

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

    // Sync streak from actual DB activity
    const streakDays = await syncUserStreak(studentId);

    // Check if today already has a login log (avoid duplicate XP)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayLog = await getTodaysXpTransaction(studentId, 'dailyLogin', today);

    // Award dailyLogin XP only once per day
    let xpAwarded = 0;
    if (!todayLog) {
      const xpAmount = calculateXp({ type: 'dailyLogin', streakDays });
      await createXpTransaction({ userId: studentId, event: 'dailyLogin', xpAmount, metadata: JSON.stringify({ streakDays }) });

      await updateUser(studentId, { xp: { increment: xpAmount }, streakDays });

      xpAwarded = xpAmount;
    }

    return NextResponse.json({
      streakDays,
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

  const { streakDays, lastActiveDate } = await import('@/modules/progress/services/streak-service').then(m =>
    m.calculateStudentStreak(studentId)
  );

  return NextResponse.json({ streakDays, lastActiveDate });
}

