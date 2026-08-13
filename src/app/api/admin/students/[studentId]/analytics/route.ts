import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// GET /api/admin/students/[studentId]/analytics
// 學生個人分析聚合數據（供管理員及教師使用）
// R3.10-C.2: 練習 session 的 scored 準確率只來自 canonical verified
// evidence；不可驗證 session 保留 recorded 原始值但不標為 verified。
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import {
  classifySessionEvidence,
  getVerifiedPracticeSessions,
  type SessionEvidenceEntry,
} from '@/modules/exercise/services/practice-evidence-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    // ---- 認證：admin 或 teacher ----
    const auth = await verifyApiAuth(request, ['teacher', 'admin']);
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const { studentId } = await params;

    // ---- 學生基本資料 ----
    const student = await adminDbQuery('user', 'findUnique', {
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
    }) as {id: string; email: string; nameZh: string | null; nameEn: string | null; role: string; level: string | null; classNumber: number | null; overallAccuracy: number | null; streakDays: number; xp: number; academicYear: string | null; badgeIds: string | null; createdAt: Date; class: {id: string; name: string; gradeLevel: string; academicYear: string | null} | null; _count: {sessions: number; mistakes: number; vocabItems: number; submissions: number; writingDrafts: number; listeningSessions: number; spellingSessions: number}} | null;

    if (!student || student.role !== 'student') {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // ---- 並行獲取各項分析數據 ----

    // 1. 學習掌握度 (Mastery)
    const { getLearningProfile } = await import(
      '@/modules/student/mastery/services/student-mastery-service'
    );
    const { buildWeaknessProfile } = await import(
      '@/modules/mistake/intelligence/services/mistake-intelligence-service'
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
      adminDbQuery('practiceSession', 'findMany', {
        where: {
          studentId,
          source: { not: 'assignment' },
        },
        orderBy: [{ completedAt: { sort: 'desc', nulls: 'last' } }, { startedAt: 'desc' }],
        take: 50,
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
          answers: {
            select: {
              questionId: true,
              result: true,
              awardedScore: true,
              maxScore: true,
              countsTowardScore: true,
              scoredBy: true,
              scoringMethod: true,
            },
            orderBy: { questionIndex: 'asc' },
          },
        },
      }) as Promise<Array<{id: string; skill: string; skillZh: string | null; difficulty: string | null; totalQuestions: number; correctCount: number; startedAt: Date; completedAt: Date | null; source: string; answers: unknown[]}>>,
      adminDbQuery('submission', 'findMany', {
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
      }) as Promise<Array<{id: string; assignmentId: string | null; score: number | null; status: string; submittedAt: Date | null; answers: string; assignment: {title: string; grammarItem: string | null; difficulty: string | null; questionCount: number} | null}>>,
    ]);

    // 合併練習記錄 + 任務提交，按完成時間排序，去重
    // R3.10-C.2: 練習 session 的 accuracy 只從 verified evidence 計算；
    // 不可驗證 session → accuracy=null（下游明確顯示「未驗證」），
    // recorded 原始值保留供歷史顯示。
    const mergedSessions: Array<{
      id: string; type: 'practice' | 'assignment'; skill: string; skillZh: string;
      difficulty: string; totalQuestions: number; correctCount: number;
      recordedTotalQuestions: number; recordedCorrectCount: number;
      accuracy: number | null; startedAt: Date | string; completedAt: Date | string | null; source: string;
      verified: { status: string } | null;
    }> = [
      ...recentSessions.map(s => {
        const cls = classifySessionEvidence(s);
        return {
          id: s.id,
          type: 'practice' as const,
          skill: s.skill,
          skillZh: s.skillZh || '',
          difficulty: s.difficulty || 'core',
          recordedTotalQuestions: s.totalQuestions,
          recordedCorrectCount: s.correctCount,
          verified: cls.evidence,
          totalQuestions: cls.verifiedTotals?.totalQuestions ?? s.totalQuestions,
          correctCount: cls.verifiedTotals?.correctCount ?? s.correctCount,
          accuracy: cls.verifiedTotals
            ? Math.round((cls.verifiedTotals.correctCount / Math.max(1, cls.verifiedTotals.totalQuestions)) * 100)
            : null,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          source: s.source,
        };
      }),
      ...recentSubmissions.map(sub => {
        let ansCount = 0;
        try { const a = JSON.parse(sub.answers); ansCount = Array.isArray(a) ? a.length : Object.keys(a).length; } catch { /* */ }
        const total = sub.assignment?.questionCount || ansCount;
        const correct = sub.score != null ? Math.round((sub.score / 100) * (sub.assignment?.questionCount || ansCount || 1)) : 0;
        return {
          id: sub.id,
          type: 'assignment' as const,
          skill: sub.assignment?.grammarItem || 'assignment',
          skillZh: sub.assignment?.title || '教師任務',
          difficulty: sub.assignment?.difficulty || 'core',
          recordedTotalQuestions: total,
          recordedCorrectCount: correct,
          verified: null,
          totalQuestions: total,
          correctCount: correct,
          accuracy: sub.score != null ? Math.round(sub.score) : null,
          startedAt: sub.submittedAt!,
          completedAt: sub.submittedAt!,
          source: 'assignment',
        };
      }),
    ]
      .sort((a, b) => new Date(b.completedAt || b.startedAt).getTime() - new Date(a.completedAt || a.startedAt).getTime())
      // 智能去重：相同 (skill, totalQuestions, source) 且 startedAt 在 2 分鐘內 → 只保留 correctCount 最高者
      // 解決舊 bug 遺留的 Q1→Q5 逐題儲存問題
      .reduce((acc, s) => {
        const sTime = new Date(s.startedAt).getTime();
        const dup = acc.find(x =>
          x.skill === s.skill &&
          x.totalQuestions === s.totalQuestions &&
          x.source === s.source &&
          Math.abs(new Date(x.startedAt).getTime() - sTime) < 120_000
        );
        if (dup) {
          if (s.correctCount > dup.correctCount) {
            Object.assign(dup, s);
          }
        } else {
          acc.push(s);
        }
        return acc;
      }, [] as typeof mergedSessions)
      .slice(0, 15);

    // 3. 最近錯題（去重：同一 questionId 只保留最新一筆）
    const rawMistakes = await adminDbQuery('mistake', 'findMany', {
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
    }) as Array<{id: string; questionId: string | null; questionSummary: string; studentAnswer: string | null; correctAnswer: string | null; mistakeType: string; createdAt: Date}>;

    // 依 questionSummary 去重（同一題目文字只保留最新一筆）
    const seenSummaries = new Set<string>();
    const recentMistakes = rawMistakes.filter(m => {
      const key = m.questionSummary.trim().toLowerCase();
      if (!key || seenSummaries.has(key)) return false;
      seenSummaries.add(key);
      return true;
    }).slice(0, 10);

    // 4. 詞彙概覽
    const vocabStats = await adminDbQuery('vocabItem', 'groupBy', {
      by: ['familiarity'],
      where: { studentId },
      _count: { id: true },
    }) as Array<{familiarity: number | null; _count: {id: number}}>;

    // 5. 寫作提交概覽
    const writingStats = await adminDbQuery('writingDraft', 'findMany', {
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
    }) as Array<{id: string; draft: string; revisedVersion: string | null; teacherComment: string | null; createdAt: Date}>;

    // 6. 每週快照數據 (Weekly snapshots)
    const weeklySnapshots = await adminDbQuery('weeklySnapshot', 'findMany', {
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
    }) as Array<{weekStart: Date; totalQuestions: number; correctCount: number; accuracy: number | null; sessionsCount: number; xpGained: number}>;

    // 7. 總練習統計（按技能分類）— R3.10-C.2:
    // sessions 計數 = 原始 engagement；question/correct/accuracy = verified evidence only。
    const [sessionCountsBySkill, verifiedSkillSessions] = await Promise.all([
      adminDbQuery('practiceSession', 'groupBy', {
        by: ['skill'],
        where: { studentId },
        _count: { id: true },
      }) as Promise<Array<{skill: string; _count: {id: number}}>>,
      getVerifiedPracticeSessions(studentId, 300).catch(() => [] as SessionEvidenceEntry[]),
    ]);

    const skillTotals = new Map<string, { sessions: number; total: number; correct: number }>();
    for (const c of sessionCountsBySkill) {
      skillTotals.set(c.skill, { sessions: c._count.id, total: 0, correct: 0 });
    }
    for (const s of verifiedSkillSessions) {
      const key = s.skill || 'general';
      let entry = skillTotals.get(key);
      if (!entry) { entry = { sessions: 0, total: 0, correct: 0 }; skillTotals.set(key, entry); }
      if (s.evidence.status === 'verified') {
        entry.total += s.evidence.totalQuestions;
        entry.correct += s.evidence.correctCount;
      }
    }

    // 8. HKDSE 診斷結果
    const diagnosticResults = await adminDbQuery('diagnosticResult', 'findMany', {
      where: { studentId },
      orderBy: { completedAt: 'desc' },
      select: { skill: true, skillZh: true, accuracy: true, weakAreas: true },
    }) as Array<{skill: string; skillZh: string | null; accuracy: number | null; weakAreas: string | null}>;

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
          try { return JSON.parse(student.badgeIds ?? '[]'); } catch { return []; }
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
      sessionStatsBySkill: Array.from(skillTotals.entries()).map(([skill, v]) => ({
        skill,
        sessions: v.sessions,
        totalQuestions: v.total,
        correctCount: v.correct,
        accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 100) : null,
      })),
      diagnosticResults: diagnosticResults.map(d => {
        let parsedWeakAreas: string[] = [];
        try { parsedWeakAreas = JSON.parse(d.weakAreas ?? '[]'); } catch { /* keep empty */ }
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
