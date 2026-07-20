// ============================================
// GET /api/admin/students/[studentId]/analytics
// 學生個人分析聚合數據（供管理員使用）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifyAdmin } from '@/shared/auth/admin-auth';
import { logger } from '@/shared/logger/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    // ---- 認證：僅 admin ----
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const { studentId } = await params;

    // ---- 學生基本資料 ----
    const student = await db.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        email: true,
        nameZh: true,
        nameEn: true,
        role: true,
        level: true,
        classNumber: true,
        overallAccuracy: true,
        streakDays: true,
        xp: true,
        academicYear: true,
        badgeIds: true,
        createdAt: true,
        class: { select: { id: true, name: true, gradeLevel: true, academicYear: true } },
        _count: {
          select: {
            sessions: true,
            mistakes: true,
            vocabItems: true,
            submissions: true,
            writingDrafts: true,
            listeningSessions: true,
            spellingSessions: true,
          },
        },
      },
    });

    if (!student || student.role !== 'student') {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // ---- 並行獲取各項分析數據 ----

    // 1. 學習掌握度 (Mastery)
    const { getLearningProfile } = await import(
      '@/modules/student-mastery/services/student-mastery-service'
    );
    const { buildWeaknessProfile } = await import(
      '@/modules/mistake-intelligence/services/mistake-intelligence-service'
    );
    const { buildStudentTrends, buildLearningStats } = await import(
      '@/modules/learning-analytics/services/learning-analytics-service'
    );

    const [masteryProfile, weaknessProfile, trends, stats] = await Promise.all([
      getLearningProfile(studentId).catch(() => null),
      buildWeaknessProfile(studentId, 10, true).catch(() => null),
      buildStudentTrends(studentId, 12).catch(() => null),
      buildLearningStats(studentId).catch(() => null),
    ]);

    // 2. 最近練習記錄（含教師指派任務）
    // NOTE: 排除 source='assignment' 的 practiceSession，避免與 submission 重複
    // 放寬 completedAt 條件：優先取已完成，但也包含未標記完成的記錄
    const [recentSessions, recentSubmissions] = await Promise.all([
      db.practiceSession.findMany({
        where: {
          studentId,
          source: { not: 'assignment' },
        },
        orderBy: [{ completedAt: { sort: 'desc', nulls: 'last' } }, { startedAt: 'desc' }],
        take: 20,
        select: {
          id: true,
          skill: true,
          skillZh: true,
          difficulty: true,
          totalQuestions: true,
          correctCount: true,
          startedAt: true,
          completedAt: true,
          source: true,
        },
      }),
      db.submission.findMany({
        where: { studentId, submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 15,
        select: {
          id: true,
          assignmentId: true,
          score: true,
          status: true,
          submittedAt: true,
          answers: true,
          assignment: {
            select: { title: true, grammarItem: true, difficulty: true, questionCount: true },
          },
        },
      }),
    ]);

    // 合併練習記錄 + 任務提交，按完成時間排序，去重
    const mergedSessions = [
      ...recentSessions.map(s => ({
        id: s.id,
        type: 'practice' as const,
        skill: s.skill,
        skillZh: s.skillZh,
        difficulty: s.difficulty,
        totalQuestions: s.totalQuestions,
        correctCount: s.correctCount,
        accuracy: s.totalQuestions > 0 ? Math.round((s.correctCount / s.totalQuestions) * 100) : 0,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        source: s.source,
      })),
      ...recentSubmissions.map(sub => {
        let ansCount = 0;
        try { const a = JSON.parse(sub.answers); ansCount = Array.isArray(a) ? a.length : Object.keys(a).length; } catch { /* */ }
        return {
          id: sub.id,
          type: 'assignment' as const,
          skill: sub.assignment?.grammarItem || 'assignment',
          skillZh: sub.assignment?.title || '教師任務',
          difficulty: sub.assignment?.difficulty || 'core',
          totalQuestions: sub.assignment?.questionCount || ansCount,
          correctCount: sub.score != null ? Math.round((sub.score / 100) * (sub.assignment?.questionCount || ansCount || 1)) : 0,
          accuracy: sub.score != null ? Math.round(sub.score) : 0,
          startedAt: sub.submittedAt!,
          completedAt: sub.submittedAt!,
          source: 'assignment',
        };
      }),
    ]
      .sort((a, b) => new Date(b.completedAt || b.startedAt).getTime() - new Date(a.completedAt || a.startedAt).getTime())
      // 依內容去重：相同 skill + 題數 + 正確數 + source 只保留最新
      .filter((s, _i, arr) => {
        const key = `${s.skill}|${s.totalQuestions}|${s.correctCount}|${s.source}`;
        const firstIdx = arr.findIndex(x => `${x.skill}|${x.totalQuestions}|${x.correctCount}|${x.source}` === key);
        return _i === firstIdx;
      })
      .slice(0, 15);

    // 3. 最近錯題（去重：同一 questionId 只保留最新一筆）
    const rawMistakes = await db.mistake.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        questionId: true,
        questionSummary: true,
        studentAnswer: true,
        correctAnswer: true,
        mistakeType: true,
        createdAt: true,
      },
    });

    // 依 questionId 去重，保留最新
    const seenQuestionIds = new Set<string>();
    const recentMistakes = rawMistakes.filter(m => {
      if (seenQuestionIds.has(m.questionId)) return false;
      seenQuestionIds.add(m.questionId);
      return true;
    }).slice(0, 10);

    // 4. 詞彙概覽
    const vocabStats = await db.vocabItem.groupBy({
      by: ['familiarity'],
      where: { studentId },
      _count: { id: true },
    });

    // 5. 寫作提交概覽
    const writingStats = await db.writingDraft.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        draft: true,
        revisedVersion: true,
        teacherComment: true,
        createdAt: true,
      },
    });

    // 6. 每週快照數據 (Weekly snapshots)
    const weeklySnapshots = await db.weeklySnapshot.findMany({
      where: { userId: studentId },
      orderBy: { weekStart: 'asc' },
      take: 24,
      select: {
        weekStart: true,
        totalQuestions: true,
        correctCount: true,
        accuracy: true,
        sessionsCount: true,
        xpGained: true,
      },
    });

    // 7. 總練習統計（按技能分類）
    const sessionStatsBySkill = await db.practiceSession.groupBy({
      by: ['skill'],
      where: { studentId },
      _sum: { totalQuestions: true, correctCount: true },
      _count: { id: true },
    });

    // 8. HKDSE 診斷結果
    const diagnosticResults = await db.diagnosticResult.findMany({
      where: { studentId },
      orderBy: { completedAt: 'desc' },
      select: { skill: true, skillZh: true, accuracy: true, weakAreas: true },
    });

    return NextResponse.json({
      student: {
        id: student.id,
        email: student.email,
        nameZh: student.nameZh,
        nameEn: student.nameEn,
        level: student.level,
        classNumber: student.classNumber,
        overallAccuracy: student.overallAccuracy,
        streakDays: student.streakDays,
        xp: student.xp,
        academicYear: student.academicYear,
        badgeIds: (() => {
          try { return JSON.parse(student.badgeIds); } catch { return []; }
        })(),
        createdAt: student.createdAt,
        class: student.class,
        counts: student._count,
      },
      mastery: masteryProfile,
      weakness: weaknessProfile,
      trends,
      stats,
      recentSessions: mergedSessions,
      recentMistakes,
      vocabStats: vocabStats.map(v => ({
        familiarity: v.familiarity,
        count: v._count.id,
      })),
      writingStats: writingStats.map(w => ({
        id: w.id,
        hasRevision: !!w.revisedVersion,
        hasComment: !!w.teacherComment,
        createdAt: w.createdAt,
        preview: w.draft.slice(0, 100),
      })),
      weeklySnapshots,
      sessionStatsBySkill: sessionStatsBySkill.map(s => ({
        skill: s.skill,
        sessions: s._count.id,
        totalQuestions: s._sum.totalQuestions || 0,
        correctCount: s._sum.correctCount || 0,
        accuracy: (s._sum.totalQuestions || 0) > 0
          ? Math.round(((s._sum.correctCount || 0) / (s._sum.totalQuestions || 1)) * 100)
          : 0,
      })),
      diagnosticResults: diagnosticResults.map(d => {
        let parsedWeakAreas: string[] = [];
        try { parsedWeakAreas = JSON.parse(d.weakAreas); } catch { /* keep empty */ }
        return {
          skill: d.skill,
          skillZh: d.skillZh,
          accuracy: d.accuracy,
          weakAreas: Array.isArray(parsedWeakAreas) ? parsedWeakAreas.join('、') : d.weakAreas,
        };
      }),
      generatedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    logger.error({ module: 'admin-student-analytics', error: msg }, 'Admin student analytics failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
