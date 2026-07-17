// ============================================
// API Route: POST /api/ai/analyze-answer
// 分析學生答案並提供回饋
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeAnswer, isDeepSeekConfigured, getLastAIProvider, wasFallbackUsed } from '@/lib/ai-service';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limiter';
import { verifyApiAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = await checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-answer:${ip}` });
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
    const { question, questionType, correctAnswer, studentAnswer, choices, listeningContent, readingContent, grammarItem, grammarItemZh, studentLevel } = body;

    if (!question || !correctAnswer || !studentAnswer) {
      return NextResponse.json(
        { error: '請提供 question、correctAnswer 和 studentAnswer。' },
        { status: 400 }
      );
    }

    const analysis = await analyzeAnswer({
      question,
      questionType: questionType || 'mc',
      correctAnswer,
      studentAnswer,
      choices: Array.isArray(choices) ? choices : undefined,
      listeningContent: listeningContent || undefined,
      readingContent: readingContent || undefined,
      grammarItem,
      grammarItemZh,
      studentLevel,
      userId: authResult.userId,
    });

    return NextResponse.json({
      analysis,
      _meta: {
        provider: getLastAIProvider(),
        ...(wasFallbackUsed() ? { warning: 'DeepSeek 暫時無法使用，已自動切換至備用 AI（Gemini）。' } : {}),
      },
    }, {
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('analyze-answer error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


