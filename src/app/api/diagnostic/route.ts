import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// POST /api/diagnostic — 儲存診斷測驗結果
// GET  /api/diagnostic?studentId=... — 讀取歷史診斷
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { logger } from '@/shared/logger/logger';
import { clearDiagnosticResults, createDiagnosticResult } from '@/modules/student';

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
      return NextResponse.json({ error: '缺少 studentId 或 results / studentId and results are required' }, { status: 400 });
    }

    // 🔒 Ownership check: only the student themselves or a teacher/admin can save diagnostic data
    if (authResult.userId !== studentId && authResult.role !== 'teacher' && authResult.role !== 'admin') {
      return NextResponse.json({ error: '無權限為其他用戶儲存診斷結果 / You cannot save diagnostic results for another user' }, { status: 403 });
    }

    await clearDiagnosticResults(studentId);

    const created = await Promise.all(
      results.map(r =>
        createDiagnosticResult({
          studentId,
          skill: r.skill,
          skillZh: r.skillZh,
          accuracy: r.accuracy,
          weakAreas: r.weakAreas || [],
          recommendedGrammar: r.recommendedGrammar || null,
          recommendedSkill: r.recommendedSkill || null,
        })
      )
    );

    // R3.10-D.3 (Priority 1): 診斷結果為客戶端自評（self-reported）。
    // 客戶端 accuracy 絕不寫入 studentMastery 或任何 trusted learning state。
    // 診斷只作為學生自我評估的參考顯示（selfReported: true）。

    return NextResponse.json({ results: created, selfReported: true }, { status: 201 });
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
    if (!studentId) return NextResponse.json({ error: '缺少 studentId / studentId is required' }, { status: 400 });

    // 🔒 Ownership check: only the student themselves or a teacher/admin can read diagnostic data
    if (authResult.userId !== studentId && authResult.role !== 'teacher' && authResult.role !== 'admin') {
      return NextResponse.json({ error: '無權限查看其他用戶的診斷結果 / You cannot view another user\'s diagnostic results' }, { status: 403 });
    }

    const results = await adminDbQuery('diagnosticResult', 'findMany', {
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
