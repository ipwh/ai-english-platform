// ============================================
// API Route: POST /api/ai/analyze-progress
// 分析學生學習進度
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeProgress, isDeepSeekConfigured } from '@/lib/ai-service';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limiter';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-progress:${ip}` });
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
    const { studentLevel, overallAccuracy, weakSkills, recentPerformance, streakDays } = body;

    if (!studentLevel) {
      return NextResponse.json(
        { error: '請提供 studentLevel。' },
        { status: 400 }
      );
    }

    const analysis = await analyzeProgress({
      studentLevel,
      overallAccuracy: overallAccuracy ?? 0,
      weakSkills: weakSkills || [],
      recentPerformance: recentPerformance || [],
      streakDays: streakDays ?? 0,
    });

    return NextResponse.json({ analysis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('analyze-progress error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
