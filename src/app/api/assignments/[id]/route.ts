import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// API: GET /api/assignments/[id] — 取得單一作業詳情（含題目）
// API: POST /api/assignments/[id]/submit — 提交作業答案（AI 批改）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { findAssignmentById, findAssignmentSubmissions } from '@/modules/student';
import { submitAssignmentAttempt } from '@/modules/assessment/services/submission-attempt-service';
import { gradeAssignmentItems } from '@/modules/assessment/services/assignment-grader';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { verifySessionToken } from '@/shared/auth/jwt';
import { analyzeAnswer } from '@/modules/ai';
import { notifySubmissionReceived } from '@/shared/utils/notifications';
import { recordActivityMastery, syncStudentActivityMetrics } from '@/modules/learning-analytics/services/activity-accounting-service';
import { logger } from '@/shared/logger/logger';

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
  if (isTeacher) {
    const auth = await verifyApiAuth(request, ['teacher', 'admin']);
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error || '請先登入 / Please sign in' }, { status: 401 });
    }
    if (auth.role !== 'teacher' && auth.role !== 'admin') {
      return NextResponse.json({ error: '權限不足：僅教師可查看此視圖 / Insufficient permission: only teachers can view this' }, { status: 403 });
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
    }) as {id: string; title: string; description: string | null; classId: string | null; className: string | null; targetType: string | null; gradeLevel: string | null; strand: string | null; grammarItem: string | null; languageSkill: string | null; difficulty: string | null; questionCount: number; timeLimit: number | null; dueDate: Date | null; completionRate: number | null; createdAt: Date; questions: Array<{id: string; questionType: string; prompt: string; options: string | null; answer: string; orderIndex: number}>; submissions?: Array<{id: string; score: number | null; submittedAt: Date | null; student: {id: string; name: string | null; nameZh: string | null; email: string; class: {name: string} | null}}>; _count: {submissions: number}} | null;

    if (!assignment) {
      return NextResponse.json({ error: '找不到此作業 / Assignment not found' }, { status: 404 });
    }

    // 學生視圖：取得當前學生的提交記錄
    let studentSubmission = null;
    if (!isTeacher) {
      const token = request.cookies.get('session_token')?.value;
      if (token) {
        const payload = await verifySessionToken(token);
        if (payload) {
          studentSubmission = await adminDbQuery('submission', 'findFirst', {
            where: { assignmentId: id, studentId: payload.userId },
          });
        }
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
        submittedAt: studentSubmission.submittedAt?.toISOString() || null,
        answers: studentSubmission.answers ? JSON.parse(studentSubmission.answers) : {},
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

    const body = await request.json();
    const { answers } = body; // { questionId: studentAnswer }

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

    // R3.5: 批改每道題目並產生逐題評分證據（與舊邏輯完全相同，僅加上證據輸出）。
    // 客戶端只提供 { questionId: studentAnswer } 答案表；題目與答案鍵來自
    // 伺服器持有的 AssignmentQuestion，永遠不接受客戶端評分欄位。
    const grading = await gradeAssignmentItems(
      assignment.questions,
      answers as Record<string, string>,
      analyzeAnswer,
    );
    const { items, totalScore } = grading;

    const gradedAnswers: Record<string, { correct: boolean; feedback: string }> = {};
    for (const item of items) {
      gradedAnswers[item.questionId] = {
        correct: item.result === 'correct',
        feedback: item.feedback,
      };
    }
    const aiFeedbackParts = items
      .filter(i => i.aiFeedbackPart !== undefined)
      .map(i => i.aiFeedbackPart as string);

    const score = assignment.questions.length > 0
      ? Math.round((totalScore / assignment.questions.length) * 100)
      : 0;

    const aiFeedback = aiFeedbackParts.length > 0
      ? aiFeedbackParts.join('\n\n')
      : `得分：${score}%（${totalScore}/${assignment.questions.length}）`;

    // R3.5 hardening: 相容視圖 + 嘗試 + 逐題證據在同一個原子交易內提交。
    // 任一步失敗則全部回滾（相容視圖絕不會在缺少對應嘗試證據的情況下提交）；
    // attemptNumber 在交易內以列鎖序列化後計數，並發安全。
    const { submission, attempt, isNew } = await submitAssignmentAttempt({
      assignmentId: id,
      studentId: payload.userId,
      answersJson: JSON.stringify(answers),
      score,
      aiFeedback,
      submittedAt: new Date(),
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
      if (isNew) {
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
    const student = await adminDbQuery('user', 'findUnique', {
      where: { id: payload.userId },
      select: { name: true, nameZh: true },
    });
    const studentDisplayName = student?.nameZh || student?.name || payload.userId;
    notifySubmissionReceived(studentDisplayName, assignment.title, id, assignment.createdBy);

    // 更新作業完成率
    try {
      const totalSubmissions = await adminDbQuery('submission', 'count', {
        where: { assignmentId: id, status: { in: ['submitted', 'graded'] } },
      });
      // 估算目標人數：targetStudents / targetGroups / class 學生數
      let totalTarget = 0;
      if (assignment.targetType === 'students') {
        totalTarget = await adminDbQuery('assignmentStudent', 'count', { where: { assignmentId: id } });
      } else if (assignment.targetType === 'group') {
        const groupIds = ((await adminDbQuery('assignmentGroup', 'findMany', { where: { assignmentId: id }, select: { groupId: true } })) as Array<{groupId: string}>).map(g => g.groupId);
        if (groupIds.length > 0) {
          totalTarget = await adminDbQuery('groupMember', 'count', { where: { groupId: { in: groupIds } } });
        }
      } else if (assignment.classId) {
        totalTarget = await adminDbQuery('user', 'count', { where: { classId: assignment.classId, role: 'student' } });
      } else if (assignment.className) {
        // Fallback: lookup by className if classId is null
        const classRecord = await adminDbQuery('class', 'findFirst', { where: { name: assignment.className } });
        if (classRecord) {
          totalTarget = await adminDbQuery('user', 'count', { where: { classId: classRecord.id, role: 'student' } });
        }
      }
      if (totalTarget > 0) {
        const rate = Math.round((totalSubmissions / totalTarget) * 100);
        await adminDbQuery('assignment', 'update', { where: { id }, data: { completionRate: rate } });
      }
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
