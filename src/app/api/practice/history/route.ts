// ============================================
// API: /api/practice/history — 學生練習歷史（逐日回顧）
// ============================================
// 2026-10-01：學生端「我的進度」原本只顯示最近 5 筆練習，無法回看每日的
// 練習次數與類型。此端點提供：
//   · view=month（預設）：指定香港月的「每日 × 技能」聚合
//     （DB 端 GROUP BY，只回傳聚合列 —— 遵守 ADR-046 egress 契約）
//   · view=day：指定香港日的逐場明細（單日有界，附正典證據投影）；
//     `includeAnswers=1`（**僅教師／管理員**）額外回傳逐題答案 —— 教師端
//     「學生詳情」的歷史瀏覽用（學生端維持精簡，不放大 egress）。
// 權限與 /api/practice GET 相同：本人 / admin / 任教該生的教師。

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { resolveTeacherStudentClass } from '@/modules/teacher/copilot/services/teacher-copilot-service';
import {
  getPracticeHistoryMonth,
  getPracticeHistoryDay,
  getPracticeHistoryDayForTeacher,
} from '@/modules/exercise/services/practice-history-service';
import { hkMonthKey } from '@/shared/utils/hk-date';

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 逐日回顧是學生與教師的主動操作（切月／展開日期）；兩個頁面共用此端點，
// 且校內多使用者常共用同一 NAT IP → 放寬至 120 次/分鐘 per IP
// （與平台其他 in-memory limiter 相同的近似保證）。
const HISTORY_RATE_LIMIT = { maxRequests: 120, windowMs: 60_000 } as const;

/** 真實存在的日 key（阻擋 2026-02-31 等不存在日期，避免 Invalid Date 查詢） */
function isValidDayKey(value: string): boolean {
  if (!DAY_KEY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  // 🔒 Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimit = await checkRateLimit({ ...HISTORY_RATE_LIMIT, identifier: `practice-history:${ip}` });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: rateLimit.message }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

    const canAccessStudent = authResult.userId === studentId
      || authResult.role === 'admin'
      || (authResult.role === 'teacher' && await resolveTeacherStudentClass(authResult.userId!, studentId));
    if (!canAccessStudent) {
      return NextResponse.json({ error: '無權限查看其他用戶的練習記錄 / You cannot view another user\'s practice history' }, { status: 403 });
    }

    const view = searchParams.get('view') || 'month';

    if (view === 'month') {
      const month = searchParams.get('month') || hkMonthKey();
      if (!MONTH_KEY_PATTERN.test(month)) {
        return NextResponse.json({ error: 'month 格式須為 YYYY-MM / month must be YYYY-MM' }, { status: 400 });
      }
      const data = await getPracticeHistoryMonth(studentId, month);
      return NextResponse.json({ view: 'month', ...data });
    }

    if (view === 'day') {
      const day = searchParams.get('day') || '';
      if (!isValidDayKey(day)) {
        return NextResponse.json({ error: 'day 格式須為 YYYY-MM-DD / day must be a valid YYYY-MM-DD' }, { status: 400 });
      }
      // 2026-10-01：逐題答案僅供教師／管理員（教師端歷史瀏覽）；學生端維持精簡。
      const includeAnswers = searchParams.get('includeAnswers') === '1';
      const isStaff = authResult.role === 'teacher' || authResult.role === 'admin';
      if (includeAnswers && !isStaff) {
        return NextResponse.json({ error: '僅教師可查看逐題明細 / Per-question detail is available to teachers only' }, { status: 403 });
      }
      const data = includeAnswers
        ? await getPracticeHistoryDayForTeacher(studentId, day)
        : await getPracticeHistoryDay(studentId, day);
      return NextResponse.json({ view: 'day', ...data });
    }

    return NextResponse.json({ error: '不支援的 view（month | day）/ Unsupported view' }, { status: 400 });
  } catch (err: unknown) {
    logger.error({ module: 'practice-history', error: err instanceof Error ? err.message : String(err) }, 'Practice history GET failed');
    return NextResponse.json({ error: 'Failed to load practice history' }, { status: 500 });
  }
}
