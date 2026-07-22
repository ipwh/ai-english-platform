// ============================================
// POST /api/diagnostic — 儲存診斷測驗結果
// GET  /api/diagnostic?studentId=... — 讀取歷史診斷
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { db } from '@/shared/db/db';
import { logger } from '@/shared/logger/logger';
import { MASTERY_SKILLS } from '@/modules/student-mastery/types';
import type { MasterySkill } from '@/modules/student-mastery/types';

const DIAGNOSTIC_RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  // 🔒 Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimit = await checkRateLimit({ ...DIAGNOSTIC_RATE_LIMIT, identifier: `diagnostic:${ip}` });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: rateLimit.message }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const body = await request.json();
    const { studentId, results } = body as {
      studentId: string;
      results: { skill: string; skillZh: string; accuracy: number; weakAreas: string[]; recommendedGrammar?: string; recommendedSkill?: string }[];
    };

    if (!studentId || !results?.length) {
      return NextResponse.json({ error: '缺少 studentId 或 results' }, { status: 400 });
    }

    // 🔒 Ownership check: only the student themselves or a teacher/admin can save diagnostic data
    if (authResult.userId !== studentId && authResult.role !== 'teacher' && authResult.role !== 'admin') {
      return NextResponse.json({ error: '無權限為其他用戶儲存診斷結果' }, { status: 403 });
    }

    // 清除舊診斷結果（保留最新一次）
    await db.diagnosticResult.deleteMany({ where: { studentId } });

    // 寫入新結果
    const created = await Promise.all(
      results.map(r =>
        db.diagnosticResult.create({
          data: {
            studentId,
            skill: r.skill,
            skillZh: r.skillZh,
            accuracy: r.accuracy,
            weakAreas: JSON.stringify(r.weakAreas || []),
            recommendedGrammar: r.recommendedGrammar || null,
            recommendedSkill: r.recommendedSkill || null,
            completedAt: new Date(),
          },
        })
      )
    );

    // 🔧 Sync diagnostic results to StudentMastery so dashboard shows real scores (not 0)
    try {
      // Map diagnostic skill names to MasterySkill enum
      const skillMap: Record<string, MasterySkill> = {
        grammar: 'grammar', vocabulary: 'vocabulary',
        reading: 'reading', writing: 'writing',
        listening: 'listening', speaking: 'speaking',
      };
      for (const r of results) {
        const masterySkill = skillMap[r.skill];
        if (!masterySkill) continue;
        // Initialize mastery with the diagnostic accuracy as the baseline score
        // and a single practice entry to bootstrap the system
        await db.studentMastery.upsert({
          where: { studentId_skill_subSkill: { studentId, skill: masterySkill, subSkill: r.skill } },
          create: {
            studentId,
            skill: masterySkill,
            subSkill: r.skill,
            masteryScore: Math.round(r.accuracy),
            confidenceScore: 50, // moderate confidence for diagnostic results
            retentionScore: 100,  // just completed, full retention
            correctCount: Math.round(r.accuracy / 100 * 5), // estimate: ~5 questions per skill
            practiceCount: 5,
            mistakeCount: Math.round((100 - r.accuracy) / 100 * 5),
            lastPracticedAt: new Date(),
          },
          update: {
            masteryScore: Math.round(r.accuracy),
            confidenceScore: 50,
            retentionScore: 100,
            lastPracticedAt: new Date(),
          },
        });
      }
      logger.info({ module: 'diagnostic', studentId, skillCount: results.length }, 'Synced diagnostic results to StudentMastery');
    } catch (syncErr) {
      logger.warn({ module: 'diagnostic', studentId, error: syncErr instanceof Error ? syncErr.message : String(syncErr) }, 'Failed to sync diagnostic to mastery (non-critical)');
    }

    return NextResponse.json({ results: created }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    if (!studentId) return NextResponse.json({ error: '缺少 studentId' }, { status: 400 });

    // 🔒 Ownership check: only the student themselves or a teacher/admin can read diagnostic data
    if (authResult.userId !== studentId && authResult.role !== 'teacher' && authResult.role !== 'admin') {
      return NextResponse.json({ error: '無權限查看其他用戶的診斷結果' }, { status: 403 });
    }

    const results = await db.diagnosticResult.findMany({
      where: { studentId },
      orderBy: { completedAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
