// ============================================
// API: /api/assignments — 課業 CRUD
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { listAssignments, findTeacherClass, listGroupMembers, createAssignment, listNotifications } from '@/modules/student';
import { logger } from '@/shared/logger/logger';
import { checkRateLimit, GENERAL_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { notifyAssignmentCreated } from '@/shared/utils/notifications';
import { verifyApiAuth } from '@/shared/auth/api-auth';

// GET /api/assignments — 列出課業
export async function GET(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');
    const teacherId = searchParams.get('teacherId');

    // Students can only see their own class assignments
    const where: Record<string, unknown> = {};
    if (classId) where.className = classId;
    if (teacherId) where.createdBy = teacherId;
    // Students: filter to their own class
    if (authResult.role === 'student' && !classId && !teacherId) {
      where.className = authResult.userId;
    }

    const assignments = await (await import('@/shared/db/db')).db.assignment.findMany({
      where,
      include: { _count: { select: { submissions: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ assignments });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    logger.error({ module: 'assignments', error: msg }, 'Assignments GET failed');
    return NextResponse.json({ error: msg, assignments: [] }, { status: 500 });
  }
}

// POST /api/assignments — 建立課業
export async function POST(request: NextRequest) {
  // 🔒 Auth check — only teachers/admins
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rl = await checkRateLimit({ ...GENERAL_RATE_LIMIT, identifier: `assign:${ip}` });
    if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 });

    const body = await request.json();
    const {
      title, description, className, classId, targetType, gradeLevel, strand,
      grammarItem, languageSkill, difficulty, questionCount, timeLimit, dueDate,
      questions, groupIds, studentIds,
    } = body;

    if (!title) {
      return NextResponse.json({ error: 'title 為必填' }, { status: 400 });
    }

    const resolvedClassName = className || '';
    const resolvedTargetType = targetType || 'class';

    // 驗證教師權限 — use authResult.userId instead of body.createdBy
    if (resolvedTargetType === 'class' && resolvedClassName) {
      const teacherClass = await (await import('@/shared/db/db')).db.teacherClass.findFirst({
        where: { teacherId: authResult.userId, class: { name: resolvedClassName } },
      });
      if (!teacherClass) {
        return NextResponse.json({ error: `您沒有任教 ${resolvedClassName} 班級的權限` }, { status: 403 });
      }
    }

    const assignment = await (await import('@/shared/db/db')).db.assignment.create({
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
        createdBy: authResult.userId!,
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
      const groupMembers = await (await import('@/shared/db/db')).db.groupMember.findMany({
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
    logger.error({ module: 'assignments', error: message }, 'Assignments POST failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

