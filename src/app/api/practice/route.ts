// ============================================
// API: /api/practice — 練習記錄
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

// POST /api/practice — 儲存練習記錄
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentId, skill, skillZh, difficulty, totalQuestions, correctCount, source } = body;

    if (!studentId) {
      return NextResponse.json({ error: 'studentId 為必填' }, { status: 400 });
    }

    const session = await db.practiceSession.create({
      data: {
        studentId,
        skill: skill || 'general',
        skillZh: skillZh || '綜合',
        difficulty: difficulty || 'core',
        totalQuestions: totalQuestions || 0,
        correctCount: correctCount || 0,
        source: source || 'ai-generated',
      },
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/practice?studentId=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

    const sessions = await db.practiceSession.findMany({
      where: { studentId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ sessions });
  } catch (err: unknown) {
    console.error('[Practice GET]', err);
    return NextResponse.json({ error: 'Failed to load practice history', sessions: [] }, { status: 200 });
  }
}
