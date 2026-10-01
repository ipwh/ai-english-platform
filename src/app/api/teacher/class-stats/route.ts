// ============================================
// GET /api/teacher/class-stats — 全校班級練習數據總覽（教師主頁用）
// ============================================
// 單一職責：回傳 `getClassPracticeStats()` 的聚合結果（每班一列：
// 名單人數／參與人數／參與率／完成次數／正確率）。
//
// 認證：教師或管理員（JWT session_token 或 NextAuth，與 /api/teacher/students
// 相同的雙重認證邏輯）。資料為全校聚合數字，不含學生層級資料。
//
// 2026-10-01 用戶回報修正：教師主頁原本只在客戶端以
// `classes.slice(0, 8)` ＋ 作業完成率拼出圖表 → 全院 25 班只看 8 班、
// 沒有作業的班別全空白。本路由為該區塊的唯一資料來源。
import { NextRequest, NextResponse } from 'next/server';
import { findUserByIdSelect } from '@/modules/student';
import { verifySessionToken } from '@/shared/auth/jwt';
import { auth } from '@/shared/auth/auth-next';
import { getClassPracticeStats } from '@/modules/teacher/monitoring/services/class-stats-service';
import { cacheFor, CACHE_SHORT } from '@/shared/utils/api-cache';
import { logger } from '@/shared/logger/logger';

async function getTeacherAuth(request: NextRequest): Promise<{ userId: string; isAdmin: boolean } | null> {
  const token = request.cookies.get('session_token')?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload && (payload.role === 'teacher' || payload.role === 'admin')) {
      return { userId: payload.userId, isAdmin: payload.role === 'admin' };
    }
  }
  const session = await auth();
  if (session?.user?.id) {
    const user = await findUserByIdSelect(session.user.id, { role: true }) as { role: string } | null;
    if (user && (user.role === 'teacher' || user.role === 'admin')) {
      return { userId: session.user.id, isAdmin: user.role === 'admin' };
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const teacherAuth = await getTeacherAuth(request);
    if (!teacherAuth) {
      return NextResponse.json({ error: '請先登入教師帳號 / Please sign in with a teacher account' }, { status: 403 });
    }

    const classes = await getClassPracticeStats();
    return NextResponse.json({ classes }, { headers: cacheFor(CACHE_SHORT) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    logger.error({ module: 'teacher-class-stats', error: msg }, 'Class stats GET failed');
    // 回傳空陣列令客戶端可優雅降級（但保持非 2xx，客戶端據此顯示區塊錯誤，
    // 不得把「查詢失敗」與「真的沒有班別」混為一談）
    return NextResponse.json({ error: '載入班級數據失敗 / Failed to load class stats', classes: [] }, { status: 500 });
  }
}
