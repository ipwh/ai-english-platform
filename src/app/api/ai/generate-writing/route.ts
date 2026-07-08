// ============================================
// API Route: POST /api/ai/generate-writing
// 生成寫作題目與大綱（獨立於練習題目生成）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { generateWritingPrompt, generateWritingOutline, isDeepSeekConfigured } from '@/lib/ai-service';
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
        { error: 'DeepSeek API 尚未設定，請在 .env.local 中設定 DEEPSEEK_API_KEY。' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { action, textType, gradeLevel, wordLimit, topicHint, writingPrompt, lang } = body;

    if (!textType || !gradeLevel || !wordLimit) {
      return NextResponse.json(
        { error: '請提供 textType、gradeLevel 和 wordLimit。' },
        { status: 400 }
      );
    }

    if (action === 'prompt') {
      const prompt = await generateWritingPrompt({
        textType,
        gradeLevel,
        wordLimit: wordLimit || 200,
        topicHint: topicHint || undefined,
        lang: lang || 'en',
      });

      return NextResponse.json({ prompt });
    }

    if (action === 'outline') {
      if (!writingPrompt) {
        return NextResponse.json(
          { error: '生成大綱需要提供 writingPrompt。' },
          { status: 400 }
        );
      }

      const outline = await generateWritingOutline({
        textType,
        gradeLevel,
        wordLimit: wordLimit || 200,
        writingPrompt,
        topicHint: topicHint || undefined,
        lang: lang || 'en',
      });

      return NextResponse.json({ outline });
    }

    return NextResponse.json(
      { error: 'action 必須為 "prompt" 或 "outline"。' },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('[generate-writing] Error:', message);
    return NextResponse.json({ error: `AI 生成失敗：${message}` }, { status: 500 });
  }
}
