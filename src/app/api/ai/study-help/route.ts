// ============================================
// API Route: POST /api/ai/study-help
// 個人化學習求助（帶學生上下文）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { answerStudyHelp, isDeepSeekConfigured, getLastAIProvider, wasFallbackUsed, sanitizeForAI } from '@/modules/ai';

import { checkRateLimit, AI_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) return NextResponse.json({ error: authResult.error }, { status: 401 });

  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = await checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-study-help:${ip}` });
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
    const { question, studentLevel, weakSkills, recentMistakes, recentPerformance } = body;

    if (!question || !studentLevel) {
      return NextResponse.json({ error: '請提供 question 與 studentLevel / Please provide question and studentLevel' }, { status: 400 });
    }

    const help = await answerStudyHelp({
      userId: authResult.userId,
      question: sanitizeForAI(question),
      studentLevel,
      weakSkills: weakSkills || [],
      recentMistakes: recentMistakes || [],
      recentPerformance: recentPerformance || [],
    });

    return NextResponse.json({
      ...help,
      _meta: {
        provider: getLastAIProvider(),
        ...(wasFallbackUsed() ? { warning: 'DeepSeek 暫時無法使用，已自動切換至備用 AI（Gemini）。' } : {}),
      },
    }, {
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    logger.error({ module: 'study-help', error: message }, 'Study help failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


