// ============================================
// API Route: POST /api/ai/explain-mistake
// AI 解釋錯題
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { explainMistake, isDeepSeekConfigured } from '@/lib/ai-service';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limiter';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-mistake:${ip}` });
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
    const { question, correctAnswer, studentAnswer, grammarItemZh, studentLevel } = body;

    if (!question || !correctAnswer || !studentAnswer) {
      return NextResponse.json(
        { error: '請提供 question、correctAnswer 和 studentAnswer。' },
        { status: 400 }
      );
    }

    const explanation = await explainMistake({
      question,
      correctAnswer,
      studentAnswer,
      grammarItemZh,
      studentLevel,
    });

    return NextResponse.json({ explanation });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('explain-mistake error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
