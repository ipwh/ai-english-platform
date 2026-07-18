// ============================================
// API: /api/assignments — 課業 CRUD
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/shared/db/db';
import { checkRateLimit, AI_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { verifySessionToken } from '@/shared/auth/auth';
import { notifyAssignmentCreated } from '@/shared/utils/notifications';

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
    const rl = await checkRateLimit({ ...AI_RATE_LIMIT, identifier: `assign:${ip}` });
    if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 });

    const body = await request.json();
    const {
      title, description, className, classId, targetType, gradeLevel, strand,
      grammarItem, languageSkill, difficulty, questionCount, timeLimit, dueDate,
      createdBy, questions, groupIds, studentIds,
    } = body;

    if (!title || !createdBy) {
      return NextResponse.json({ error: 'title, createdBy 為必填' }, { status: 400 });
    }

    const resolvedClassName = className || '';
    const resolvedTargetType = targetType || 'class';

    // 驗證教師權限
    if (resolvedTargetType === 'class' && resolvedClassName) {
      const teacherClass = await db.teacherClass.findFirst({
        where: { teacherId: createdBy, class: { name: resolvedClassName } },
      });
      if (!teacherClass) {
        return NextResponse.json({ error: `您沒有任教 ${resolvedClassName} 班級的權限` }, { status: 403 });
      }
    }

    const assignment = await db.assignment.create({
      data: {
        title,
        description,
        className: resolvedClassName,
        classId: resolvedTargetType === 'class' && classId ? classId : null,
        targetType: resolvedTargetType,
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
        ...(resolvedTargetType === 'group' && groupIds?.length ? {
          targetGroups: { create: groupIds.map((gid: string) => ({ groupId: gid })) },
        } : {}),
        ...(resolvedTargetType === 'students' && studentIds?.length ? {
          targetStudents: { create: studentIds.map((sid: string) => ({ studentId: sid })) },
        } : {}),
      },
      include: { questions: true },
    });

    // 🔔 發送通知
    if (resolvedTargetType === 'class' && resolvedClassName) {
      notifyAssignmentCreated(title, resolvedClassName, classId || null, assignment.id);
    } else if (resolvedTargetType === 'group' && groupIds?.length) {
      // 通知組別內所有學生
      const groupMembers = await db.groupMember.findMany({
        where: { groupId: { in: groupIds } },
        select: { studentId: true },
      });
      const { createBulkNotifications } = await import('@/shared/utils/notifications');
      await createBulkNotifications(
        groupMembers.map(m => m.studentId),
        'assignment',
        '📝 新作業',
        `你有新作業：「${title}」`,
        `/student/assignments/${assignment.id}`,
      );
    } else if (resolvedTargetType === 'students' && studentIds?.length) {
      const { createBulkNotifications } = await import('@/shared/utils/notifications');
      await createBulkNotifications(
        studentIds,
        'assignment',
        '📝 新作業',
        `你有新作業：「${title}」`,
        `/student/assignments/${assignment.id}`,
      );
    }

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('[assignments] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
