// ============================================
// API: GET /api/assignments/[id] — 取得單一作業詳情（含題目）
// API: POST /api/assignments/[id]/submit — 提交作業答案（AI 批改）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { verifySessionToken } from '@/shared/auth/jwt';
import { analyzeAnswer } from '@/modules/ai/services/ai-service';
import { notifySubmissionReceived } from '@/shared/utils/notifications';

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
      return NextResponse.json({ error: auth.error || '請先登入' }, { status: 401 });
    }
    if (auth.role !== 'teacher' && auth.role !== 'admin') {
      return NextResponse.json({ error: '權限不足：僅教師可查看此視圖' }, { status: 403 });
    }
  }

  try {
    const assignment = await db.assignment.findUnique({
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
    });

    if (!assignment) {
      return NextResponse.json({ error: '找不到此作業' }, { status: 404 });
    }

    // 學生視圖：取得當前學生的提交記錄
    let studentSubmission = null;
    if (!isTeacher) {
      const token = request.cookies.get('session_token')?.value;
      if (token) {
        const payload = await verifySessionToken(token);
        if (payload) {
          studentSubmission = await db.submission.findFirst({
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
    console.error('[assignments/[id]] GET error:', msg);
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
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }

    const payload = await verifySessionToken(token);
    if (!payload) {
      return NextResponse.json({ error: '登入已過期' }, { status: 401 });
    }

    const body = await request.json();
    const { answers } = body; // { questionId: studentAnswer }

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: '請提供答案' }, { status: 400 });
    }

    // 取得作業及題目
    const assignment = await db.assignment.findUnique({
      where: { id },
      include: { questions: true },
    });

    if (!assignment) {
      return NextResponse.json({ error: '找不到此作業' }, { status: 404 });
    }

    // 檢查是否已有提交
    const existing = await db.submission.findFirst({
      where: { assignmentId: id, studentId: payload.userId },
    });

    // 批改每道題目
    let totalScore = 0;
    const gradedAnswers: Record<string, { correct: boolean; feedback: string }> = {};
    const aiFeedbackParts: string[] = [];

    for (const q of assignment.questions) {
      const studentAnswer = answers[q.id] || '';
      const isMcq = q.questionType === 'mc';

      if (isMcq) {
        // MC 題：直接比對
        const correct = studentAnswer.trim().toUpperCase() === q.answer.trim().toUpperCase();
        if (correct) totalScore++;
        gradedAnswers[q.id] = { correct, feedback: correct ? '正確！' : `正確答案為 ${q.answer}` };
      } else {
        // 文字題：呼叫 AI 批改
        try {
          const analysis = await analyzeAnswer({
            question: q.prompt,
            studentAnswer,
            correctAnswer: q.answer,
            questionType: q.questionType,
          });
          const correct = analysis.isCorrect;
          if (correct) totalScore++;
          gradedAnswers[q.id] = {
            correct,
            feedback: analysis.feedbackZh || analysis.explanation || (correct ? '正確！' : '答案不正確'),
          };
          if (analysis.feedbackZh) aiFeedbackParts.push(`Q${q.orderIndex + 1}: ${analysis.feedbackZh}`);
        } catch {
          // AI 不可用時 fallback 到簡單比對
          const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
          const correct = normalize(studentAnswer) === normalize(q.answer);
          if (correct) totalScore++;
          gradedAnswers[q.id] = { correct, feedback: correct ? '正確！' : `參考答案：${q.answer}` };
        }
      }
    }

    const score = assignment.questions.length > 0
      ? Math.round((totalScore / assignment.questions.length) * 100)
      : 0;

    const aiFeedback = aiFeedbackParts.length > 0
      ? aiFeedbackParts.join('\n\n')
      : `得分：${score}%（${totalScore}/${assignment.questions.length}）`;

    // Upsert submission
    const submission = existing
      ? await db.submission.update({
          where: { id: existing.id },
          data: {
            answers: JSON.stringify(answers),
            score,
            aiFeedback,
            status: 'submitted',
            submittedAt: new Date(),
          },
        })
      : await db.submission.create({
          data: {
            assignmentId: id,
            studentId: payload.userId,
            answers: JSON.stringify(answers),
            score,
            aiFeedback,
            status: 'submitted',
            submittedAt: new Date(),
          },
        });

    // 🔔 通知教師：學生已提交作業
    const student = await db.user.findUnique({
      where: { id: payload.userId },
      select: { name: true, nameZh: true },
    });
    const studentDisplayName = student?.nameZh || student?.name || payload.userId;
    notifySubmissionReceived(studentDisplayName, assignment.title, id, assignment.createdBy);

    // 更新作業完成率
    try {
      const totalSubmissions = await db.submission.count({
        where: { assignmentId: id, status: { in: ['submitted', 'graded'] } },
      });
      // 估算目標人數：targetStudents / targetGroups / class 學生數
      let totalTarget = 0;
      if (assignment.targetType === 'students') {
        totalTarget = await db.assignmentStudent.count({ where: { assignmentId: id } });
      } else if (assignment.targetType === 'group') {
        const groupIds = (await db.assignmentGroup.findMany({ where: { assignmentId: id }, select: { groupId: true } })).map(g => g.groupId);
        if (groupIds.length > 0) {
          totalTarget = await db.groupMember.count({ where: { groupId: { in: groupIds } } });
        }
      } else if (assignment.classId) {
        totalTarget = await db.user.count({ where: { classId: assignment.classId, role: 'student' } });
      }
      if (totalTarget > 0) {
        const rate = Math.round((totalSubmissions / totalTarget) * 100);
        await db.assignment.update({ where: { id }, data: { completionRate: rate } });
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
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    console.error('[assignments/[id]] POST error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
