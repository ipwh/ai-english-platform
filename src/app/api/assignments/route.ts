// ============================================
// API: /api/assignments — 課業 CRUD
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limiter';
import { verifySessionToken } from '@/lib/auth';

// GET /api/assignments — 列出課業
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');
    const teacherId = searchParams.get('teacherId');

    const assignments = await db.assignment.findMany({
      where: {
        ...(classId ? { className: classId } : {}),
        ...(teacherId ? { createdBy: teacherId } : {}),
      },
      include: { _count: { select: { submissions: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ assignments });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    console.error('[assignments GET]', msg);
    return NextResponse.json({ error: msg, assignments: [] }, { status: 500 });
  }
}

// POST /api/assignments — 建立課業
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rl = checkRateLimit({ ...AI_RATE_LIMIT, identifier: `assign:${ip}` });
    if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 });

    const body = await request.json();
    const { title, description, className, gradeLevel, strand, grammarItem, languageSkill, difficulty, questionCount, timeLimit, dueDate, createdBy, questions } = body;

    if (!title || !className || !createdBy) {
      return NextResponse.json({ error: 'title, className, createdBy 為必填' }, { status: 400 });
    }

    // 驗證教師是否任教該班級
    const teacherClass = await db.teacherClass.findFirst({
      where: { teacherId: createdBy, class: { name: className } },
    });
    if (!teacherClass) {
      return NextResponse.json({ error: `您沒有任教 ${className} 班級的權限` }, { status: 403 });
    }

    const assignment = await db.assignment.create({
      data: {
        title,
        description,
        className,
        gradeLevel: gradeLevel || 'S4',
        strand: strand || 'knowledge',
        grammarItem,
        languageSkill,
        difficulty: difficulty || 'core',
        questionCount: questionCount || 5,
        timeLimit,
        dueDate: dueDate ? new Date(dueDate) : null,
        createdBy,
        questions: questions ? {
          create: questions.map((q: { questionType: string; prompt: string; options?: string; answer: string; explanation?: string }, i: number) => ({
            questionType: q.questionType,
            prompt: q.prompt,
            options: q.options || null,
            answer: q.answer,
            explanation: q.explanation || null,
            orderIndex: i,
          })),
        } : undefined,
      },
      include: { questions: true },
    });

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('[assignments] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
