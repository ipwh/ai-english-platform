// ============================================
// API Route: POST /api/ai/analyze-material
// 分析教材內容
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeMaterial, isDeepSeekConfigured, getLastAIProvider, wasFallbackUsed, sanitizeForAI, isBudgetExceededError } from '@/modules/ai';
import { checkRateLimit, AI_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) return NextResponse.json({ error: authResult.error }, { status: 401 });
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = await checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-material:${ip}` });
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
    const { title, content, gradeLevel } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: '請提供 title 和 content。 / Please provide title and content' },
        { status: 400 }
      );
    }

    const analysis = await analyzeMaterial({
      userId: authResult.userId,
      title: sanitizeForAI(title),
      content: sanitizeForAI(content),
      gradeLevel,
    });

    return NextResponse.json({
      analysis,
      _meta: {
        provider: getLastAIProvider(),
        ...(wasFallbackUsed() ? { warning: 'DeepSeek 暫時無法使用，已自動切換至備用 AI（Gemini），分析品質可能略有差異。' } : {}),
      },
    }, {
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  } catch (err: unknown) {
    if (isBudgetExceededError(err)) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : '未知錯誤';
    logger.error({ module: 'analyze-material', error: message }, 'Material analysis failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


