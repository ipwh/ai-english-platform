// ============================================
// API Route: POST /api/ai/study-help
// 個人化學習求助（帶學生上下文）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { answerStudyHelp, isDeepSeekConfigured } from '@/lib/ai-service';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limiter';

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-study-help:${ip}` });
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
    const { question, studentLevel, weakSkills, recentMistakes, recentPerformance } = body;

    if (!question || !studentLevel) {
      return NextResponse.json({ error: '請提供 question 與 studentLevel。' }, { status: 400 });
    }

    const help = await answerStudyHelp({
      question,
      studentLevel,
      weakSkills: weakSkills || [],
      recentMistakes: recentMistakes || [],
      recentPerformance: recentPerformance || [],
    });

    return NextResponse.json(help);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('study-help error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
