// ============================================
// API Route: POST /api/ai/analyze-writing
// 批改學生寫作
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeWriting, isDeepSeekConfigured, getLastAIProvider, wasFallbackUsed } from '@/lib/ai-service';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limiter';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-writing:${ip}` });
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
    const { title, prompt, studentDraft, studentLevel, textType } = body;

    if (!title || !studentDraft) {
      return NextResponse.json(
        { error: '請提供 title 和 studentDraft。' },
        { status: 400 }
      );
    }

    const analysis = await analyzeWriting({
      title,
      prompt: prompt || '',
      studentDraft,
      studentLevel,
      textType,
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
    console.error('analyze-writing error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


