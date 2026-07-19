// ============================================
// POST /api/diagnostic — 儲存診斷測驗結果
// GET  /api/diagnostic?studentId=... — 讀取歷史診斷
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { db } from '@/shared/db/db';
import { validateRequest, studentId } from '@/shared/validation/schemas';
import { z } from 'zod';

const diagnosticSaveSchema = z.object({
  studentId,
  results: z.array(z.object({
    skill: z.string(),
    skillZh: z.string(),
    accuracy: z.number().min(0).max(100),
    weakAreas: z.array(z.string()).optional(),
    recommendedGrammar: z.string().optional(),
    recommendedSkill: z.string().optional(),
  })).min(1, '至少需要一個結果'),
});

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
    const parsed = validateRequest(diagnosticSaveSchema, body);
    const { studentId, results } = parsed;

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
