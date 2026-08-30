// Sprint 37: GET /api/student/analytics
// Sprint 59: Uses StudentStateBuilder (canonical state)
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { validateQuery } from '@/shared/validation/schemas';
import { studentAnalyticsQuerySchema } from '@/modules/learning-analytics/schemas';
import { studentStateBuilder } from '@/modules/student/state/StudentStateBuilder';
import { studentBelongsToTeacher } from '@/modules/teacher/services/student-access';

export async function GET(request: NextRequest) {
  const auth = await verifyApiAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = validateQuery(studentAnalyticsQuerySchema, searchParams);
    const { studentId, weeks } = query;

    // 2026-08-30 audit (R5): 學生只可看自己；教師只可看任教班級學生（主班級 ∪ StudentClass）；admin 豁免
    if (auth.role === 'student' && studentId !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (auth.role === 'teacher' && !(await studentBelongsToTeacher(studentId, auth.userId!))) {
      return NextResponse.json({ error: 'Forbidden — you do not teach this student' }, { status: 403 });
    }

    const state = await studentStateBuilder.build(studentId);
    const stats = {
      totalSessions: state.practice.totalSessions,
      totalQuestions: state.practice.totalQuestions,
      overallAccuracy: state.engagement.overallAccuracy ?? 0,
      streakDays: state.engagement.streakDays,
      level: state.engagement.level,
      xp: state.engagement.xp,
      skillAccuracy: state.mastery.bySkill,
    };
    const trends = state.knowledge.strongSkills.map(s => ({
      skill: s.skill,
      currentScore: s.currentScore,
      predictedScore: s.predictedScore,
      trend: s.trend,
    }));
    return NextResponse.json({ trends, stats });

    return NextResponse.json({ trends, stats });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'learning-analytics', error: message }, 'GET /api/student/analytics failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
