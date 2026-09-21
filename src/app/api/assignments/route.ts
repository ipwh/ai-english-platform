// ============================================
// API: /api/assignments — 課業 CRUD
// Sprint 104: Added Zod validation for POST
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDbQuery } from '@/modules/admin/services/admin-operations';
import { logger } from '@/shared/logger/logger';
import { validateRequest } from '@/shared/validation/validate';
import { assignmentCreateSchema } from '@/shared/validation/schemas';
import { checkRateLimit, GENERAL_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { notifyAssignmentCreated, notifyAssignmentCreatedToUsers } from '@/shared/utils/notifications';
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

    const where: Record<string, unknown> = {};
    if (classId) where.classId = classId;
    if (teacherId) where.createdBy = teacherId;

    if (authResult.role === 'student') {
      // 學生只看到指派給自己的作業：所屬班級（含混合上課 StudentClass）、直接指派、或所屬組別
      const userId = authResult.userId!;
      const student = await adminDbQuery('user', 'findUnique', {
        where: { id: userId },
        select: {
          classId: true,
          class: { select: { name: true } },
          studentClasses: { select: { classId: true, class: { select: { name: true } } } },
        },
      });
      const memberClassIds = Array.from(new Set([
        ...(student?.studentClasses ?? []).map((sc: { classId: string }) => sc.classId),
        ...(student?.classId ? [student.classId] : []),
      ]));
      const memberClassNames = Array.from(new Set([
        ...(student?.studentClasses ?? []).map((sc: { class: { name: string } }) => sc.class.name),
        ...(student?.class?.name ? [student.class.name] : []),
      ]));
      const or: Record<string, unknown>[] = [];
      if (memberClassIds.length > 0) or.push({ classId: { in: memberClassIds } });
      if (memberClassNames.length > 0) or.push({ className: { in: memberClassNames } });
      or.push({ targetStudents: { some: { studentId: userId } } });
      or.push({ targetGroups: { some: { group: { members: { some: { studentId: userId } } } } } });
      where.OR = or;
    } else if (authResult.role === 'teacher') {
      // 🔒 2026-08-30 audit (R5): 教師永遠只看到自己建立的作業。
      // 舊邏輯在帶有 classId/teacherId 參數時跳過此限縮 → 任何人可枚舉他人作業（IDOR）。
      if (teacherId && teacherId !== authResult.userId) {
        return NextResponse.json({ error: 'Forbidden — you can only list your own assignments' }, { status: 403 });
      }
      where.createdBy = authResult.userId;
      // classId 過濾仍限於自己建立的作業
      if (classId) where.classId = classId;
    }

    const assignments = await adminDbQuery('assignment', 'findMany', {
      where,
      include: { _count: { select: { submissions: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // 學生列表：附上自己的提交狀態與教師回饋（Review 表按 submissionId 關聯）
    let submissionMap = new Map<string, { id: string; status: string; score: number | null; submittedAt: Date | null }>();
    let feedbackMap = new Map<string, string | null>();
    if (authResult.role === 'student') {
      const assignmentIds = (assignments as Array<{ id: string }>).map(a => a.id);
      if (assignmentIds.length > 0) {
        const subs = await adminDbQuery('submission', 'findMany', {
          where: { studentId: authResult.userId, assignmentId: { in: assignmentIds } },
          select: { id: true, assignmentId: true, status: true, score: true, submittedAt: true },
        }) as Array<{ id: string; assignmentId: string; status: string; score: number | null; submittedAt: Date | null }>;
        submissionMap = new Map(subs.map(s => [s.assignmentId, s]));
        const reviewRows = await adminDbQuery('review', 'findMany', {
          where: { submissionId: { in: subs.map(s => s.id) } },
          select: { submissionId: true, teacherFeedback: true },
          orderBy: { createdAt: 'desc' },
        }) as Array<{ submissionId: string | null; teacherFeedback: string | null }>;
        for (const r of reviewRows) {
          if (r.submissionId && !feedbackMap.has(r.submissionId)) {
            feedbackMap.set(r.submissionId, r.teacherFeedback ?? null);
          }
        }
      }
    }

    // 統一輸出形狀：原始欄位 + submissionCount + 學生提交狀態 + 派發狀態（列表頁 chip 用）
    const mapped = (assignments as Array<Record<string, unknown>>).map(a => {
      const sub = submissionMap.get(a.id as string) ?? null;
      const raw = a as { dueDate?: Date | string | null; completionRate?: number | null; _count?: { submissions?: number } };
      const due = raw.dueDate ? new Date(raw.dueDate).getTime() : null;
      const rate = raw.completionRate ?? 0;
      const status = rate >= 100 ? 'completed'
        : due !== null && due < Date.now() ? 'overdue'
        : (raw._count?.submissions ?? 0) > 0 ? 'in-progress'
        : 'not-started';
      return {
        ...a,
        submissionCount: ((a as { _count?: { submissions?: number } })._count?.submissions ?? 0),
        status,
        submission: sub ? {
          id: sub.id,
          status: sub.status,
          score: sub.score,
          submittedAt: sub.submittedAt,
          teacherFeedback: sub ? (feedbackMap.get(sub.id) ?? null) : null,
        } : null,
      };
    });

    return NextResponse.json({ assignments: mapped });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    // Intentional: return empty [] so client renders graceful empty state instead of crashing
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
    // Sprint 104: Zod-validated input
    const {
      title, description, className, classId, targetType, gradeLevel, strand,
      grammarItem, languageSkill, difficulty, questionCount, timeLimit, dueDate,
      questions, groupIds, studentIds, classIds,
    } = validateRequest(assignmentCreateSchema, body);

    const resolvedTargetType = targetType || 'class';
    const teacherId = authResult.userId!;
    const isAdmin = authResult.role === 'admin';

    // 作業必須有題目：題目與答案鍵由伺服器核驗後落庫（不接受任意欄位）
    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: '請先使用 AI 生成題目 / Please generate questions first' }, { status: 400 });
    }
    const cleanedQuestions = questions.map((q: { questionType?: string; prompt?: string; options?: string; answer?: string; explanation?: string }, i: number) => {
      if (!q || typeof q.prompt !== 'string' || !q.prompt.trim() || typeof q.answer !== 'string' || !q.answer.trim()) {
        throw new Error('題目或答案不完整 / Incomplete question or answer');
      }
      return {
        questionType: typeof q.questionType === 'string' && q.questionType ? q.questionType : 'mc',
        prompt: q.prompt.trim(),
        options: q.options ?? null,
        answer: q.answer.trim(),
        explanation: q.explanation || null,
        orderIndex: i,
      };
    });

    // 目標班級：classIds（多班）或單一 className/classId
    const targetClassIds = (Array.isArray(classIds) && classIds.length > 0)
      ? classIds
      : (classId ? [classId] : []);
    const targetClassNames: string[] = [];

    if (resolvedTargetType === 'class') {
      if (targetClassIds.length > 0) {
        // 核驗教師任教所有目標班級（admin 豁免）
        const classes = await adminDbQuery('class', 'findMany', {
          where: { id: { in: targetClassIds } },
          select: { id: true, name: true },
        }) as Array<{ id: string; name: string }>;
        if (classes.length !== new Set(targetClassIds).size) {
          return NextResponse.json({ error: '找不到指定的班級 / Class not found' }, { status: 400 });
        }
        if (!isAdmin) {
          const owned = await adminDbQuery('teacherClass', 'findMany', {
            where: { teacherId, classId: { in: targetClassIds } },
            select: { classId: true },
          }) as Array<{ classId: string }>;
          const ownedIds = new Set(owned.map(c => c.classId));
          if (!targetClassIds.every(cid => ownedIds.has(cid))) {
            return NextResponse.json({ error: '您沒有任教部分班級的權限 / You do not teach all selected classes' }, { status: 403 });
          }
        }
        // 依 targetClassIds 順序對映班名（DB 查詢無順序保證，不可用陣列位置對映）
        const classByName = new Map(classes.map(c => [c.id, c.name]));
        targetClassNames.push(...targetClassIds.map(cid => classByName.get(cid) ?? ''));
      } else if (className) {
        const teacherClass = await adminDbQuery('teacherClass', 'findFirst', {
          where: isAdmin ? { class: { name: className } } : { teacherId, class: { name: className } },
          select: { class: { select: { id: true, name: true } } },
        });
        if (!teacherClass) {
          return NextResponse.json({ error: `您沒有任教 ${className} 班級的權限 / You do not teach class ${className}` }, { status: 403 });
        }
        targetClassIds.push(teacherClass.class.id);
        targetClassNames.push(teacherClass.class.name);
      } else {
        return NextResponse.json({ error: '請選擇目標班級 / Please select a target class' }, { status: 400 });
      }
    }

    // 組別指派：核驗組別擁有權（admin 豁免）；不得為空選擇（否則產生無人可見的孤兒作業）
    if (resolvedTargetType === 'group' && groupIds?.length) {
      const groups = await adminDbQuery('group', 'findMany', {
        where: isAdmin ? { id: { in: groupIds } } : { id: { in: groupIds }, createdBy: teacherId },
        select: { id: true },
      }) as Array<{ id: string }>;
      if (groups.length !== new Set(groupIds).size) {
        return NextResponse.json({ error: '您沒有權限指派部分組別 / You do not own all selected groups' }, { status: 403 });
      }
    }
    if (resolvedTargetType === 'group' && (!groupIds || groupIds.length === 0)) {
      return NextResponse.json({ error: '請選擇至少一個組別 / Please select at least one group' }, { status: 400 });
    }

    // 個別學生指派：學生必須是教師任教班級的學生（admin 豁免）；不得為空選擇
    if (resolvedTargetType === 'students' && studentIds?.length) {
      const validStudents = await adminDbQuery('user', 'findMany', {
        where: isAdmin
          ? { id: { in: studentIds }, role: 'student' }
          : {
              id: { in: studentIds },
              role: 'student',
              OR: [
                { class: { teachers: { some: { teacherId } } } },
                { studentClasses: { some: { class: { teachers: { some: { teacherId } } } } } },
              ],
            },
        select: { id: true },
      }) as Array<{ id: string }>;
      if (validStudents.length !== new Set(studentIds).size) {
        return NextResponse.json({ error: '部分學生不在您的任教班級 / Some students are outside your classes' }, { status: 403 });
      }
    }
    if (resolvedTargetType === 'students' && (!studentIds || studentIds.length === 0)) {
      return NextResponse.json({ error: '請選擇至少一位學生 / Please select at least one student' }, { status: 400 });
    }

    // 建立作業（class 目標：每班一份；group/students：單一份）
    const createOne = async (clsId: string | null, clsName: string | null) =>
      adminDbQuery('assignment', 'create', {
        data: {
          title,
          description,
          className: clsName,
          classId: clsId,
          targetType: resolvedTargetType,
          gradeLevel: gradeLevel || 'S4',
          strand: strand || 'knowledge',
          grammarItem,
          languageSkill,
          difficulty: difficulty || 'core',
          questionCount: questionCount || cleanedQuestions.length,
          timeLimit,
          dueDate: dueDate ? new Date(dueDate) : null,
          createdBy: teacherId,
          questions: { create: cleanedQuestions },
          ...(resolvedTargetType === 'group' && groupIds?.length ? {
            targetGroups: { create: groupIds.map((gid: string) => ({ groupId: gid })) },
          } : {}),
          ...(resolvedTargetType === 'students' && studentIds?.length ? {
            targetStudents: { create: studentIds.map((sid: string) => ({ studentId: sid })) },
          } : {}),
        },
        include: { questions: true },
      });

    const created: Array<{ id: string }> = [];
    if (resolvedTargetType === 'class') {
      for (let i = 0; i < targetClassIds.length; i++) {
        created.push(await createOne(targetClassIds[i], targetClassNames[i] ?? null) as { id: string });
      }
    } else {
      created.push(await createOne(null, null) as { id: string });
    }
    const assignment = created[0];

    // 🔔 發送通知（await — 確保通知建立後才回傳，避免 serverless freeze 丟失）
    if (resolvedTargetType === 'class') {
      for (let i = 0; i < created.length; i++) {
        await notifyAssignmentCreated(title, targetClassNames[i] ?? '', targetClassIds[i] ?? null, created[i].id);
      }
    } else if (resolvedTargetType === 'group' && groupIds?.length) {
      // 通知組別內所有學生（依各自語言偏好）
      const groupMembers = await adminDbQuery('groupMember', 'findMany', {
        where: { groupId: { in: groupIds } },
        select: { studentId: true },
      }) as Array<{studentId: string}>;
      await notifyAssignmentCreatedToUsers(
        groupMembers.map(m => m.studentId),
        title,
        assignment.id,
      );
    } else if (resolvedTargetType === 'students' && studentIds?.length) {
      await notifyAssignmentCreatedToUsers(studentIds, title, assignment.id);
    }

    return NextResponse.json({ assignment, assignments: created }, { status: 201 });
  } catch (err: unknown) {
    // validateRequest 及內部檢查會以 NextResponse 拋出（400/403）— 直接回傳，不吞成 500
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : '未知錯誤';
    // Intentional: return empty [] so client renders graceful empty state instead of crashing
    logger.error({ module: 'assignments', error: message }, 'Assignments POST failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

