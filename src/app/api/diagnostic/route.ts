import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// POST /api/diagnostic — 儲存診斷測驗結果
// GET  /api/diagnostic?studentId=... — 讀取歷史診斷
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { logger } from '@/shared/logger/logger';
import { submitDiagnostic, type DiagnosticAnswerInput, type DiagnosticResultInput } from '@/modules/assessment/services/diagnostic-scoring-service';

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
    const { studentId, results, answers, runId } = body as {
      studentId: string;
      results: DiagnosticResultInput[];
      /**
       * 可選：診斷作答列。僅包含「伺服器持有答案鍵」的題目（文法／閱讀）——
       * 這些會經正典練習管道評分並持久化，成為可驗證證據（D2b/D3）。
       */
      answers?: DiagnosticAnswerInput[];
      /** 同一輪診斷的穩定 id（正典提交的冪等鍵） */
      runId?: string;
    };

    if (!studentId || !results?.length) {
      return NextResponse.json({ error: '缺少 studentId 或 results / studentId and results are required' }, { status: 400 });
    }

    // 🔒 Ownership check: only the student themselves or a teacher/admin can save diagnostic data
    if (authResult.userId !== studentId && authResult.role !== 'teacher' && authResult.role !== 'admin') {
      return NextResponse.json({ error: '無權限為其他用戶儲存診斷結果 / You cannot save diagnostic results for another user' }, { status: 403 });
    }

    // R3.10-D.3 / 2026-09-20：可評分的題組（文法／閱讀）經 `submitPractice` 成為
    // 可驗證證據並以**伺服器分數**覆寫自評值；其餘題型（聆聽／詞彙／寫作）
    // 維持自評（selfReported），不計入準確率。全部商業邏輯由服務擁有。
    const outcome = await submitDiagnostic({
      studentId,
      runId: typeof runId === 'string' && runId ? runId : `diagnostic-${studentId}-${Date.now()}`,
      results,
      answers,
    });

    return NextResponse.json(
      {
        results: outcome.results,
        authoritative: outcome.authoritative,
        selfReported: outcome.authoritative.length === 0,
      },
      { status: 201 },
    );
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
