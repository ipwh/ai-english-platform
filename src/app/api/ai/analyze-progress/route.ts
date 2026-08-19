import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// API Route: POST /api/ai/analyze-progress
// 分析學生學習進度 — 從 DB 讀取真實歷史數據
// R3.10-C.2: 所有評分數據（overallAccuracy / weakSkills / recentPerformance）
// 只來自 canonical verified evidence。客戶端評分數據永不作為證據。
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeProgress, isDeepSeekConfigured, getLastAIProvider, wasFallbackUsed } from '@/modules/ai';
import { checkRateLimit, AI_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import {
  getVerifiedPracticeSessions,
  projectVerifiedProgress,
} from '@/modules/exercise/services/practice-evidence-service';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) return NextResponse.json({ error: authResult.error }, { status: 401 });
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = await checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-progress:${ip}` });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.message }, {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
      });
    }

    if (!isDeepSeekConfigured()) {
      return NextResponse.json(
        { error: 'AI 服務尚未設定。請設定 DEEPSEEK_API_KEY，或設定 Vertex service account（GCP_PROJECT_ID + GCP_SERVICE_ACCOUNT_JSON/GOOGLE_APPLICATION_CREDENTIALS）。 / AI service is not configured. Set DEEPSEEK_API_KEY, or configure a Vertex service account (GCP_PROJECT_ID + GCP_SERVICE_ACCOUNT_JSON/GOOGLE_APPLICATION_CREDENTIALS).' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { studentId, studentLevel, overallAccuracy, weakSkills, recentPerformance, streakDays } = body;

    let resolvedLevel = studentLevel || 'S4';
    let resolvedAccuracy: number | null = null;
    let resolvedWeakSkills: Array<{ name: string; nameZh: string; accuracy: number }> = [];
    let resolvedRecentPerformance: Array<{ date: string; accuracy: number; questionsDone: number }> = [];
    let resolvedStreakDays = 0;
    // 'database' = server-verified evidence; 'client' = unverified UI context (narrative only).
    let sourceLabel: 'database' | 'client' = 'client';

    if (studentId) {
      sourceLabel = 'database';
      try {
        // R3.10-C.2: 客戶端 overallAccuracy/weakSkills/recentPerformance 一律忽略。
        // 只從 canonical verified evidence + 伺服器持有的 user 聚合值推導。
        const [user, verifiedSessions, mistakes] = await Promise.all([
          adminDbQuery('user', 'findUnique', {
            where: { id: studentId },
            select: { level: true, overallAccuracy: true, streakDays: true },
          }) as Promise<{level: string | null; overallAccuracy: number | null; streakDays: number} | null>,
          getVerifiedPracticeSessions(studentId, 30),
          adminDbQuery('mistake', 'findMany', {
            where: { studentId },
            select: { mistakeType: true },
          }) as Promise<Array<{mistakeType: string}>>,
        ]);

        if (user) {
          resolvedLevel = user.level || resolvedLevel;
          // user.overallAccuracy 由 syncActivityMetrics 從 verified evidence 推導 —
          // 是 canonical 的權威聚合值。
          resolvedAccuracy = typeof user.overallAccuracy === 'number' ? user.overallAccuracy : null;
          resolvedStreakDays = user.streakDays ?? 0;
        }

        // 弱項 / 近期表現只來自 verified sessions（row-derived evidence）。
        const projection = projectVerifiedProgress(verifiedSessions);
        if (resolvedAccuracy === null && projection.overallAccuracy !== null) {
          resolvedAccuracy = projection.overallAccuracy;
        }
        resolvedWeakSkills = projection.weakSkills;
        resolvedRecentPerformance = projection.recentPerformance;

        // 錯題類型分布（伺服器持有的輔助信號，只在已有權威準確率時使用）
        if (mistakes.length > 0 && resolvedWeakSkills.length === 0 && resolvedAccuracy !== null) {
          const mistakeTypes = [...new Set(mistakes.map(m => m.mistakeType))];
          resolvedWeakSkills = mistakeTypes.map(t => ({
            name: t,
            nameZh: t,
            accuracy: Math.round((1 - mistakes.filter(m => m.mistakeType === t).length / Math.max(1, mistakes.length)) * 100),
          }));
        }

        // 如果弱項太少，加入整體弱項（accuracy 為伺服器權威值）
        if (resolvedWeakSkills.length === 0 && resolvedAccuracy !== null) {
          resolvedWeakSkills = [{ name: 'general', nameZh: '綜合', accuracy: resolvedAccuracy }];
        }
      } catch (err: unknown) {
        // DB 驗證失敗 → 一律視為證據不足；絕不回退客戶端評分數據。
        logger.warn({ module: 'analyze-progress', studentId, error: err instanceof Error ? err.message : String(err) }, 'Verified evidence query failed — treating as insufficient evidence');
      }

      // R3.10-C.2: 證據不足 → 明確的 insufficient-evidence 狀態。
      // NEVER fabricate a fallback from client totals.
      if (resolvedAccuracy === null && resolvedWeakSkills.length === 0 && resolvedRecentPerformance.length === 0) {
        return NextResponse.json({
          analysis: null,
          insufficientEvidence: true,
          message: '尚無足夠的已驗證練習紀錄可進行分析 / Not enough verified practice history to analyse yet',
          _source: sourceLabel,
          _meta: {
            provider: getLastAIProvider(),
            ...(wasFallbackUsed() ? { warning: 'DeepSeek 暫時無法使用，已自動切換至備用 AI（Gemini）。' } : {}),
          },
        }, {
          headers: { 'X-AI-Provider': getLastAIProvider() },
        });
      }
    } else {
      // 無 studentId：客戶端值僅作為 UI/context 敘事輸入，明確標記為
      // non-authoritative（_source: 'client'），且永不持久化。
      resolvedAccuracy = typeof overallAccuracy === 'number' ? overallAccuracy : 0;
      resolvedWeakSkills = Array.isArray(weakSkills) ? weakSkills : [];
      resolvedRecentPerformance = Array.isArray(recentPerformance) ? recentPerformance : [];
      resolvedStreakDays = typeof streakDays === 'number' ? streakDays : 0;
    }

    const analysis = await analyzeProgress({
      userId: authResult.userId,
      studentLevel: resolvedLevel,
      overallAccuracy: resolvedAccuracy ?? 0,
      weakSkills: resolvedWeakSkills,
      recentPerformance: resolvedRecentPerformance,
      streakDays: resolvedStreakDays,
    });

    return NextResponse.json({
      analysis,
      _source: sourceLabel,
      _meta: {
        provider: getLastAIProvider(),
        ...(wasFallbackUsed() ? { warning: 'DeepSeek 暫時無法使用，已自動切換至備用 AI（Gemini）。' } : {}),
      },
    }, {
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    logger.error({ module: 'analyze-progress', error: message }, 'Progress analysis failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}



