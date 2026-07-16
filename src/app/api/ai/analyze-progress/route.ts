// ============================================
// API Route: POST /api/ai/analyze-progress
// 分析學生學習進度 — 從 DB 讀取真實歷史數據
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeProgress, isDeepSeekConfigured, getLastAIProvider, wasFallbackUsed } from '@/lib/ai-service';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limiter';
import { verifyApiAuth } from '@/lib/api-auth';
import db from '@/lib/db';

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
        { error: 'AI 服務尚未設定。請設定 DEEPSEEK_API_KEY，或設定 Vertex service account（GCP_PROJECT_ID + GCP_SERVICE_ACCOUNT_JSON/GOOGLE_APPLICATION_CREDENTIALS）。' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { studentId, studentLevel, overallAccuracy, weakSkills, recentPerformance, streakDays } = body;

    // 優先使用伺服器端查詢的真實數據；若客戶端已提供完整數據則作為 fallback
    let resolvedLevel = studentLevel || 'S4';
    let resolvedAccuracy = overallAccuracy ?? 0;
    let resolvedWeakSkills = weakSkills || [];
    let resolvedRecentPerformance = recentPerformance || [];
    let resolvedStreakDays = streakDays ?? 0;

    if (studentId) {
      try {
        // 從 DB 讀取學生真實數據
        const [user, sessions, mistakes, vocabItems] = await Promise.all([
          db.user.findUnique({
            where: { id: studentId },
            select: { level: true, overallAccuracy: true, streakDays: true },
          }),
          db.practiceSession.findMany({
            where: { studentId },
            orderBy: { startedAt: 'desc' },
            take: 30,
            select: { skillZh: true, totalQuestions: true, correctCount: true, startedAt: true },
          }),
          db.mistake.findMany({
            where: { studentId },
            select: { mistakeType: true },
          }),
          db.vocabItem.findMany({
            where: { studentId },
            select: { familiarity: true },
          }),
        ]);

        if (user) {
          resolvedLevel = user.level || resolvedLevel;
          resolvedAccuracy = user.overallAccuracy ?? resolvedAccuracy;
          resolvedStreakDays = user.streakDays ?? resolvedStreakDays;
        }

        // 計算各技能準確率（弱項分析）
        if (sessions.length > 0) {
          const skillMap = new Map<string, { total: number; correct: number }>();
          sessions.forEach(s => {
            const key = s.skillZh || 'general';
            const entry = skillMap.get(key) || { total: 0, correct: 0 };
            entry.total += s.totalQuestions;
            entry.correct += s.correctCount;
            skillMap.set(key, entry);
          });
          resolvedWeakSkills = Array.from(skillMap.entries())
            .map(([name, v]) => ({
              name,
              nameZh: name,
              accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
            }))
            .filter(s => s.accuracy < 70);

          resolvedRecentPerformance = sessions.slice(0, 10).map(s => ({
            date: new Date(s.startedAt).toLocaleDateString(),
            accuracy: Math.round((s.correctCount / Math.max(1, s.totalQuestions)) * 100),
            questionsDone: s.totalQuestions,
          }));
        }

        // 錯題類型分布（補充弱項信號）
        if (mistakes.length > 0 && resolvedWeakSkills.length === 0) {
          const mistakeTypes = [...new Set(mistakes.map(m => m.mistakeType))];
          resolvedWeakSkills = mistakeTypes.map(t => ({
            name: t,
            nameZh: t,
            accuracy: Math.round((1 - mistakes.filter(m => m.mistakeType === t).length / Math.max(1, mistakes.length)) * 100),
          }));
        }

        // 如果弱項太少，加入整體弱項
        if (resolvedWeakSkills.length === 0) {
          resolvedWeakSkills = [{ name: 'general', nameZh: '綜合', accuracy: resolvedAccuracy }];
        }
      } catch { /* DB 查詢失敗時使用客戶端提供的數據 */ }
    }

    const analysis = await analyzeProgress({
      userId: authResult.userId,
      studentLevel: resolvedLevel,
      overallAccuracy: resolvedAccuracy,
      weakSkills: resolvedWeakSkills,
      recentPerformance: resolvedRecentPerformance,
      streakDays: resolvedStreakDays,
    });

    return NextResponse.json({
      analysis,
      _source: studentId ? 'database' : 'client',
      _meta: {
        provider: getLastAIProvider(),
        ...(wasFallbackUsed() ? { warning: 'DeepSeek 暫時無法使用，已自動切換至備用 AI（Gemini）。' } : {}),
      },
    }, {
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('analyze-progress error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


