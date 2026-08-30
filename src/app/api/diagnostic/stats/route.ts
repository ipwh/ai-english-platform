// ============================================
// API: POST/GET /api/diagnostic/stats
// POST — accumulate diagnostic scores for grade-level peer comparison
// GET  — retrieve average scores by grade level
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { adminDbQuery } from '@/modules/admin/services/admin-operations';

const VALID_SKILLS = ['grammar', 'vocabulary', 'reading', 'listening', 'writing'] as const;
const VALID_GRADES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const;

// POST: Accumulate a student's diagnostic scores into the aggregate table
export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body?.gradeLevel || !body?.results || !Array.isArray(body.results)) {
      return NextResponse.json({ error: 'Missing gradeLevel or results array' }, { status: 400 });
    }

    const { gradeLevel, results } = body as {
      gradeLevel: string;
      results: Array<{ skill: string; score: number; totalQuestions: number }>;
    };

    if (!VALID_GRADES.includes(gradeLevel as typeof VALID_GRADES[number])) {
      return NextResponse.json({ error: `Invalid gradeLevel: ${gradeLevel}` }, { status: 400 });
    }

    let updated = 0;

    for (const r of results) {
      if (!VALID_SKILLS.includes(r.skill as typeof VALID_SKILLS[number])) continue;
      // Only accumulate if the skill was actually tested (has questions)
      if (!Number.isFinite(r.totalQuestions) || r.totalQuestions <= 0 || r.totalQuestions > 1000) continue;
      // Skip writing with pending CLO (score === -1)
      if (r.score < 0) continue;
      // 🔒 2026-08-30 audit (R5): 自評分數必須為有限數值且夾取到 0-100，
      // 否則 999 等任意值會污染同級均值（peer average）
      if (!Number.isFinite(r.score)) continue;
      const clampedScore = Math.min(100, Math.max(0, r.score));

      // R3.10-L: dedupe per student — only the LATEST score of each student
      // counts towards the peer aggregate. Repeated submissions replace the
      // student's previous contribution instead of inflating the average.
      const studentId = authResult.userId;
      if (!studentId) continue;

      const existingContribution = await adminDbQuery('diagnosticStudentStat', 'findUnique', {
        where: { gradeLevel_skill_studentId: { gradeLevel, skill: r.skill, studentId } },
      });

      if (existingContribution) {
        const prevScore: number = existingContribution.lastScore;
        await adminDbQuery('diagnosticStudentStat', 'update', {
          where: { id: existingContribution.id },
          data: { lastScore: clampedScore },
        });
        await adminDbQuery('diagnosticStats', 'update', {
          where: { gradeLevel_skill: { gradeLevel, skill: r.skill } },
          data: { totalScore: { increment: clampedScore - prevScore } },
        });
      } else {
        await adminDbQuery('diagnosticStudentStat', 'create', {
          data: { gradeLevel, skill: r.skill, studentId, lastScore: clampedScore },
        });
        await adminDbQuery('diagnosticStats', 'upsert', {
          where: { gradeLevel_skill: { gradeLevel, skill: r.skill } },
          create: { gradeLevel, skill: r.skill, totalScore: clampedScore, totalCount: 1 },
          update: { totalScore: { increment: clampedScore }, totalCount: { increment: 1 } },
        });
      }
      updated++;
    }

    logger.info({ module: 'diagnostic-stats', gradeLevel, updated }, 'Diagnostic stats accumulated');

    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'diagnostic-stats', error: message }, 'Failed to accumulate stats');
    return NextResponse.json({ error: 'Failed to save stats' }, { status: 500 });
  }
}

// GET: Retrieve peer average scores for a grade level
export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const gradeLevel = searchParams.get('gradeLevel') || 'S4';

    if (!VALID_GRADES.includes(gradeLevel as typeof VALID_GRADES[number])) {
      return NextResponse.json({ error: `Invalid gradeLevel: ${gradeLevel}` }, { status: 400 });
    }

    const stats = await adminDbQuery('diagnosticStats', 'findMany', {
      where: { gradeLevel },
    });

    const averages: Record<string, { avg: number; count: number }> = {};
    for (const s of stats) {
      averages[s.skill] = {
        avg: s.totalCount > 0 ? Math.round(s.totalScore / s.totalCount) : 0,
        count: s.totalCount,
      };
    }

    // Fill in zeros for skills with no data
    for (const skill of VALID_SKILLS) {
      if (!averages[skill]) {
        averages[skill] = { avg: 0, count: 0 };
      }
    }

    return NextResponse.json({ gradeLevel, averages });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'diagnostic-stats', error: message }, 'Failed to retrieve stats');
    return NextResponse.json({ error: 'Failed to load peer stats' }, { status: 500 });
  }
}
