import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// API: GET /api/assignments/[id] — 取得單一作業詳情（含題目）
// API: POST /api/assignments/[id]/submit — 提交作業答案（AI 批改）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { submitAssignmentAttempt } from '@/modules/assessment/services/submission-attempt-service';
import { gradeAssignmentItems } from '@/modules/assessment/services/assignment-grader';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { verifySessionToken } from '@/shared/auth/jwt';
import { analyzeAnswer } from '@/modules/ai';
import { notifySubmissionReceived } from '@/shared/utils/notifications';
import { recordActivityMastery, syncStudentActivityMetrics } from '@/modules/learning-analytics/services/activity-accounting-service';
import { logger } from '@/shared/logger/logger';

type AssignmentTargeting = {
  id: string;
  targetType: string | null;
  classId: string | null;
  className: string | null;
};

async function resolveAssignmentClassId(assignment: Pick<AssignmentTargeting, 'classId' | 'className'>): Promise<string | null> {
  if (assignment.classId) return assignment.classId;
  if (!assignment.className) return null;
  const classRecord = await adminDbQuery('class', 'findFirst', {
    where: { name: assignment.className },
    select: { id: true },
  }) as { id: string } | null;
  return classRecord?.id ?? null;
}

/** Resolve the unique student population that can access an assignment. */
export async function resolveAssignmentTargetStudentIds(assignment: AssignmentTargeting): Promise<Set<string>> {
  if (assignment.targetType === 'students') {
    const rows = await adminDbQuery('assignmentStudent', 'findMany', {
      where: { assignmentId: assignment.id },
      select: { studentId: true },
    }) as Array<{ studentId: string }>;
    return new Set(rows.map(row => row.studentId));
  }

  if (assignment.targetType === 'group') {
    const groups = await adminDbQuery('assignmentGroup', 'findMany', {
      where: { assignmentId: assignment.id },
      select: { groupId: true },
    }) as Array<{ groupId: string }>;
    if (groups.length === 0) return new Set();
    const members = await adminDbQuery('groupMember', 'findMany', {
      where: { groupId: { in: groups.map(group => group.groupId) } },
      select: { studentId: true },
    }) as Array<{ studentId: string }>;
    return new Set(members.map(member => member.studentId));
  }

  const classId = await resolveAssignmentClassId(assignment);
  if (!classId) return new Set();

  const students = await adminDbQuery('user', 'findMany', {
    where: {
      role: 'student',
      OR: [
        { classId },
        { studentClasses: { some: { classId } } },
      ],
    },
    select: { id: true },
  }) as Array<{ id: string }>;
  return new Set(students.map(student => student.id));
}

// GET /api/assignments/[id]
// ?teacher=true → 教師視圖（含正確答案 + 所有學生提交）— 需教師/管理員身分
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const isTeacher = searchParams.get('teacher') === 'true';

  // 🔒 Teacher view requires authentication + teacher/admin role (JWT + NextAuth dual support)
  // 🔒 Student view requires authentication (no anonymous question enumeration)
  let studentUserId: string | null = null;
  let teacherUserId: string | null = null;
  let teacherRole: string | null = null;
  if (isTeacher) {
    const auth = await verifyApiAuth(request, ['teacher', 'admin']);
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error || '請先登入 / Please sign in' }, { status: 401 });
    }
    if (auth.role !== 'teacher' && auth.role !== 'admin') {
      return NextResponse.json({ error: '權限不足：僅教師可查看此視圖 / Insufficient permission: only teachers can view this' }, { status: 403 });
    }
    teacherUserId = auth.userId ?? null;
    teacherRole = auth.role ?? null;
  } else {
    const token = request.cookies.get('session_token')?.value;
    if (token) {
      const payload = await verifySessionToken(token);
      if (payload) studentUserId = payload.userId;
    }
    if (!studentUserId) {
      return NextResponse.json({ error: '請先登入 / Please sign in' }, { status: 401 });
    }
  }

  try {
    const assignment = await adminDbQuery('assignment', 'findUnique', {
      where: { id },
      include: {
        questions: { orderBy: { orderIndex: 'asc' } },
        submissions: isTeacher ? {
          include: {
            student: { select: { id: true, name: true, nameZh: true, email: true, class: { select: { name: true } } } },
          },
          orderBy: { submittedAt: 'desc' },
        } : undefined,
        _count: { select: { submissions: true } },
      },
    }) as {id: string; createdBy: string; title: string; description: string | null; classId: string | null; className: string | null; targetType: string | null; gradeLevel: string | null; strand: string | null; grammarItem: string | null; languageSkill: string | null; difficulty: string | null; questionCount: number; timeLimit: number | null; dueDate: Date | null; completionRate: number | null; createdAt: Date; questions: Array<{id: string; questionType: string; prompt: string; options: string | null; answer: string; orderIndex: number}>; submissions?: Array<{id: string; score: number | null; submittedAt: Date | null; student: {id: string; name: string | null; nameZh: string | null; email: string; class: {name: string} | null}}>; _count: {submissions: number}} | null;

    if (!assignment) {
      return NextResponse.json({ error: '找不到此作業 / Assignment not found' }, { status: 404 });
    }

    // 🔒 2026-08-30 audit (Round 4): 教師僅可查看自己建立的作業詳情（含答案鍵及學生資料），admin 豁免
    if (isTeacher && teacherRole === 'teacher' && assignment.createdBy !== teacherUserId) {
      return NextResponse.json({ error: '你沒有權限查看此作業 / You do not have permission to view this assignment' }, { status: 403 });
    }

    // 學生視圖：取得當前學生的提交記錄
    let studentSubmission = null;
    if (!isTeacher && studentUserId) {
      // 🔒 2026-08-30 audit (R5): 學生只可查看指派給自己的作業（班級 / 直接指派 / 組別）
      const member = await adminDbQuery('user', 'findUnique', {
        where: { id: studentUserId },
        select: { classId: true, class: { select: { name: true } }, studentClasses: { select: { classId: true } } },
      }) as { classId: string | null; class: { name: string } | null; studentClasses: Array<{ classId: string }> } | null;
      const memberClassIds = Array.from(new Set([
        ...(member?.studentClasses ?? []).map(sc => sc.classId),
        ...(member?.classId ? [member.classId] : []),
      ]));
      let isTargeted = false;
      if (assignment.targetType === 'students') {
        const target = await adminDbQuery('assignmentStudent', 'findFirst', {
          where: { assignmentId: id, studentId: studentUserId },
        });
        isTargeted = !!target;
      } else if (assignment.targetType === 'group') {
        const target = await adminDbQuery('assignmentGroup', 'findFirst', {
          where: { assignmentId: id, group: { members: { some: { studentId: studentUserId } } } },
        });
        isTargeted = !!target;
      } else {
        const classId = await resolveAssignmentClassId(assignment);
        isTargeted = classId !== null && memberClassIds.includes(classId);
      }
      if (!isTargeted) {
        return NextResponse.json({ error: '此作業未指派給你 / This assignment is not assigned to you' }, { status: 403 });
      }

      studentSubmission = await adminDbQuery('submission', 'findFirst', {
        where: { assignmentId: id, studentId: studentUserId },
      });
      // 教師回饋：從 Review 表按 submissionId 關聯（最新一筆）
      if (studentSubmission) {
        const reviewRow = await adminDbQuery('review', 'findFirst', {
          where: { submissionId: studentSubmission.id },
          orderBy: { createdAt: 'desc' },
          select: { teacherFeedback: true },
        });
        // 逐題證據：正確題數（重新整理後仍顯示真實成績，而非把作答數當正確數）
        const latestAttempt = await adminDbQuery('submissionAttempt', 'findFirst', {
          where: { submissionId: studentSubmission.id },
          orderBy: { attemptNumber: 'desc' },
          select: { id: true },
        });
        let correctCount: number | null = null;
        if (latestAttempt) {
          const evidence = await adminDbQuery('submissionAnswer', 'findMany', {
            where: { attemptId: latestAttempt.id },
            select: { result: true, countsTowardScore: true },
          }) as Array<{ result: string; countsTowardScore: boolean }>;
          correctCount = evidence.filter(r => r.countsTowardScore && r.result === 'correct').length;
        }
        studentSubmission = {
          ...studentSubmission,
          teacherFeedback: reviewRow?.teacherFeedback ?? null,
          correctCount,
        };
      }
    }

    const baseQuestions = assignment.questions.map(q => ({
      id: q.id,
      questionType: q.questionType,
      prompt: q.prompt,
      options: q.options ? JSON.parse(q.options) : null,
      answer: isTeacher ? q.answer : undefined, // 教師可見答案
      orderIndex: q.orderIndex,
    }));

    // 教師視圖：附上既有教師回饋（Review 表按 submissionId 關聯 — Submission 無 reviews relation）
    const teacherFeedbackMap = new Map<string, string | null>();
    if (isTeacher) {
      const subIds = ((assignment as unknown as { submissions?: Array<{ id: string }> }).submissions ?? []).map(s => s.id);
      if (subIds.length > 0) {
        const reviewRows = await adminDbQuery('review', 'findMany', {
          where: { submissionId: { in: subIds } },
          select: { submissionId: true, teacherFeedback: true },
          orderBy: { createdAt: 'desc' },
        }) as Array<{ submissionId: string | null; teacherFeedback: string | null }>;
        for (const r of reviewRows) {
          if (r.submissionId && !teacherFeedbackMap.has(r.submissionId)) {
            teacherFeedbackMap.set(r.submissionId, r.teacherFeedback ?? null);
          }
        }
      }
    }

    const responseData: Record<string, unknown> = {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        className: assignment.className,
        gradeLevel: assignment.gradeLevel,
        strand: assignment.strand,
        grammarItem: assignment.grammarItem,
        languageSkill: assignment.languageSkill,
        difficulty: assignment.difficulty,
        questionCount: assignment.questionCount,
        timeLimit: assignment.timeLimit,
        dueDate: assignment.dueDate?.toISOString() || null,
        completionRate: assignment.completionRate,
        createdAt: assignment.createdAt.toISOString(),
        questions: baseQuestions,
        submissionCount: assignment._count.submissions,
        ...(isTeacher && {
          submissions: ((assignment as unknown as { submissions?: Array<{
            id: string; studentId: string;
            student: { name: string | null; nameZh: string | null; email: string; class: { name: string } | null };
            answers: string; score: number | null; aiFeedback: string | null;
            status: string; submittedAt: Date | null;
          }> }).submissions || []).map(s => ({
            id: s.id,
            studentId: s.studentId,
            studentName: s.student.nameZh || s.student.name || s.student.email,
            studentEmail: s.student.email,
            studentClass: s.student.class?.name || '',
            answers: s.answers ? JSON.parse(s.answers) : {},
            score: s.score,
            aiFeedback: s.aiFeedback,
            teacherFeedback: teacherFeedbackMap.get(s.id) ?? null,
            status: s.status,
            submittedAt: s.submittedAt?.toISOString() || null,
          })),
        }),
      },
    };

    if (!isTeacher) {
      responseData.submission = studentSubmission ? {
        id: studentSubmission.id,
        status: studentSubmission.status,
        score: studentSubmission.score,
        aiFeedback: studentSubmission.aiFeedback,
        teacherFeedback: (studentSubmission as { teacherFeedback?: string | null }).teacherFeedback ?? null,
        submittedAt: studentSubmission.submittedAt?.toISOString() || null,
        answers: studentSubmission.answers ? JSON.parse(studentSubmission.answers) : {},
        correctCount: (studentSubmission as { correctCount?: number | null }).correctCount ?? null,
        totalQuestions: baseQuestions.length,
      } : null;
    }

    return NextResponse.json(responseData);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    logger.error({ module: 'assignments', method: 'GET', error: msg }, 'Assignment fetch failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/assignments/[id] — 提交答案（AI 批改）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const token = request.cookies.get('session_token')?.value;
    if (!token) {
      return NextResponse.json({ error: '請先登入 / Please sign in' }, { status: 401 });
    }

    const payload = await verifySessionToken(token);
    if (!payload) {
      return NextResponse.json({ error: '登入已過期 / Session expired' }, { status: 401 });
    }
    // 只有學生可以提交作業
    if (payload.role !== 'student') {
      return NextResponse.json({ error: '僅學生可提交作業 / Only students can submit assignments' }, { status: 403 });
    }

    const body = await request.json();
    const { answers, clientSubmissionId } = body; // { questionId: studentAnswer }

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: '請提供答案 / Please provide answers' }, { status: 400 });
    }

    // 取得作業及題目（R3.5 hardening: 以正典 orderIndex 確定性排序）
    const assignment = await adminDbQuery('assignment', 'findUnique', {
      where: { id },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!assignment) {
      return NextResponse.json({ error: '找不到此作業 / Assignment not found' }, { status: 404 });
    }

    // 🔒 2026-08-30 audit: 成員檢查 — 學生必須是作業目標（班級 / 直接指派 / 組別）
    const studentRecord = await adminDbQuery('user', 'findUnique', {
      where: { id: payload.userId },
      select: { classId: true, class: { select: { name: true } }, studentClasses: { select: { classId: true } } },
    });
    const memberClassIds = Array.from(new Set([
      ...(studentRecord?.studentClasses ?? []).map((sc: { classId: string }) => sc.classId),
      ...(studentRecord?.classId ? [studentRecord.classId] : []),
    ]));
    let isTargeted = false;
    if (assignment.targetType === 'students') {
      const target = await adminDbQuery('assignmentStudent', 'findFirst', {
        where: { assignmentId: id, studentId: payload.userId },
      });
      isTargeted = !!target;
    } else if (assignment.targetType === 'group') {
      const target = await adminDbQuery('assignmentGroup', 'findFirst', {
        where: { assignmentId: id, group: { members: { some: { studentId: payload.userId } } } },
      });
      isTargeted = !!target;
    } else {
      const classId = await resolveAssignmentClassId(assignment);
      isTargeted = classId !== null && memberClassIds.includes(classId);
    }
    if (!isTargeted) {
      return NextResponse.json({ error: '此作業未指派給你 / This assignment is not assigned to you' }, { status: 403 });
    }

    // 🔒 截止日期後不接受提交
    if (assignment.dueDate && new Date(assignment.dueDate).getTime() < Date.now()) {
      return NextResponse.json({ error: '已過截止日期，無法提交 / Submission closed: the due date has passed' }, { status: 409 });
    }

    // 🔒 教師已批改（graded）後不接受重交；returned 允許修改重交
    const existing = await adminDbQuery('submission', 'findFirst', {
      where: { assignmentId: id, studentId: payload.userId },
      select: { status: true },
    });
    if (existing?.status === 'graded') {
      return NextResponse.json({ error: '作業已批改，無法重新提交 / This assignment has been graded and can no longer be resubmitted' }, { status: 409 });
    }

    // R3.5: 批改每道題目並產生逐題評分證據（與舊邏輯完全相同，僅加上證據輸出）。
    // 客戶端只提供 { questionId: studentAnswer } 答案表；題目與答案鍵來自
    // 伺服器持有的 AssignmentQuestion，永遠不接受客戶端評分欄位。
    const grading = await gradeAssignmentItems(
      assignment.questions,
      answers as Record<string, string>,
      analyzeAnswer,
    );
    const { items, totalScore, ungradableCount, gradedQuestionCount } = grading;

    // 2026-09-23 稽核修正：`correct` 可為 null（該題未能自動評分），
    // 不得把「未能評分」顯示成答錯。
    const gradedAnswers: Record<string, { correct: boolean | null; feedback: string }> = {};
    for (const item of items) {
      gradedAnswers[item.questionId] = {
        correct: item.countsTowardScore ? item.result === 'correct' : null,
        feedback: item.feedback,
      };
    }
    const aiFeedbackParts = items
      .filter(i => i.aiFeedbackPart !== undefined)
      .map(i => i.aiFeedbackPart as string);

    // 分數只由「確實計分」的題目推導。有題目未能自動評分時**不發佈分數**
    // （部分分數會誤導），交由老師批改；無可計分題目同樣為 null（永不寫 0）。
    // `syncStudentActivityMetrics` 只收 score not null → 不會拉低 overallAccuracy。
    const score = ungradableCount > 0 || gradedQuestionCount === 0
      ? null
      : Math.round((totalScore / gradedQuestionCount) * 100);

    const aiFeedback = aiFeedbackParts.length > 0
      ? aiFeedbackParts.join('\n\n')
      : score === null
        ? `已完成作答，部分題目需由老師批改 / Submitted — awaiting teacher review (auto-graded ${totalScore}/${gradedQuestionCount} correct)`
        : `得分：${score}%（${totalScore}/${assignment.questions.length}） / Score: ${score}% (${totalScore}/${assignment.questions.length})`;

    // R3.5 hardening: 相容視圖 + 嘗試 + 逐題證據在同一個原子交易內提交。
    // 任一步失敗則全部回滾（相容視圖絕不會在缺少對應嘗試證據的情況下提交）；
    // attemptNumber 在交易內以列鎖序列化後計數，並發安全。
    const { submission, attempt, isNew, replayed } = await submitAssignmentAttempt({
      assignmentId: id,
      studentId: payload.userId,
      answersJson: JSON.stringify(answers),
      score,
      aiFeedback,
      submittedAt: new Date(),
      clientSubmissionId: typeof clientSubmissionId === 'string' && clientSubmissionId.trim()
        ? clientSubmissionId.trim()
        : null,
      items: items.map(item => ({
        questionId: item.questionId,
        response: item.response,
        result: item.result,
        awardedScore: item.awardedScore,
        maxScore: item.maxScore,
        countsTowardScore: item.countsTowardScore,
        evaluator: item.evaluator,
        scoringMethod: item.scoringMethod,
      })),
    });

    // Assignment submissions use the same accounting path as self-directed
    // practice. Re-submissions recalculate statistics but do not add a second
    // mastery attempt for the same assignment.
    try {
      await syncStudentActivityMetrics(payload.userId);
      // 有題目未能自動評分時不記掌握度：correctCount 會偏低，會偽造「退步」。
      if (isNew && !replayed && ungradableCount === 0) {
        await recordActivityMastery({
          studentId: payload.userId,
          skill: assignment.languageSkill || assignment.strand,
          subSkill: assignment.grammarItem || assignment.title,
          totalQuestions: assignment.questions.length,
          correctCount: totalScore,
        });
      }
    } catch { /* analytics sync must not prevent a valid submission */ }

    // 🔔 通知教師：學生已提交作業
    if (!replayed) {
      const student = await adminDbQuery('user', 'findUnique', {
        where: { id: payload.userId },
        select: { name: true, nameZh: true },
      });
      const studentDisplayName = student?.nameZh || student?.name || payload.userId;
      await notifySubmissionReceived(studentDisplayName, assignment.title, id, assignment.createdBy);
    }

    // 更新作業完成率
    try {
      const targetStudentIds = await resolveAssignmentTargetStudentIds(assignment);
      const submissions = await adminDbQuery('submission', 'findMany', {
        where: { assignmentId: id, status: { in: ['submitted', 'graded'] } },
        select: { studentId: true },
      }) as Array<{ studentId: string }>;
      const submittedTargetIds = new Set(
        submissions
          .map(submission => submission.studentId)
          .filter(studentId => targetStudentIds.has(studentId)),
      );
      const completionRate = targetStudentIds.size > 0
        ? Math.round((submittedTargetIds.size / targetStudentIds.size) * 100)
        : 0;
      await adminDbQuery('assignment', 'update', {
        where: { id },
        data: { completionRate },
      });
    } catch { /* non-critical */ }

    return NextResponse.json({
      submission: {
        id: submission.id,
        score,
        status: 'submitted',
        aiFeedback,
        gradedAnswers,
        totalQuestions: assignment.questions.length,
        correctCount: totalScore,
        gradedQuestionCount,
        ungradableCount,
        // R3.5: 本次提交的獨立執行身份與逐題證據
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        itemEvidence: items.map(item => ({
          questionId: item.questionId,
          response: item.response,
          result: item.result,
          awardedScore: item.awardedScore,
          maxScore: item.maxScore,
          countsTowardScore: item.countsTowardScore,
          evaluator: item.evaluator,
          scoringMethod: item.scoringMethod,
        })),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    logger.error({ module: 'assignments', method: 'POST', error: msg }, 'Assignment submission failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
