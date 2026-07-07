// ============================================
// API Route: POST /api/ai/analyze-answer
// 分析學生答案並提供回饋
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeAnswer, isDeepSeekConfigured } from '@/lib/ai-service';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limiter';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-answer:${ip}` });
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
    const { question, questionType, correctAnswer, studentAnswer, grammarItem, grammarItemZh, studentLevel } = body;

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
      grammarItem,
      grammarItemZh,
      studentLevel,
    });

    return NextResponse.json({ analysis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('analyze-answer error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
