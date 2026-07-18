// ============================================
// API: POST /api/ai/generate-integrated-skills
// 生成 DSE Paper 3 Part B Integrated Skills 任務
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { generateIntegratedSkills, isDeepSeekConfigured, getLastAIProvider, wasFallbackUsed, sanitizeForAI } from '@/modules/ai/services/ai-service';

import { checkRateLimit, AI_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { verifyApiAuth } from '@/shared/auth/api-auth';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) return NextResponse.json({ error: authResult.error }, { status: 401 });
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = await checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-intsk:${ip}` });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.message }, {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
      });
    }

    if (!isDeepSeekConfigured()) {
      return NextResponse.json(
        { error: 'AI 服務尚未設定。' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { gradeLevel, difficulty, taskType, topicHint } = body;

    if (!gradeLevel || !difficulty || !taskType) {
      return NextResponse.json(
        { error: '請提供 gradeLevel, difficulty, taskType。' },
        { status: 400 }
      );
    }

    const validTaskTypes = ['summary', 'email-reply', 'short-article', 'report'];
    if (!validTaskTypes.includes(taskType)) {
      return NextResponse.json(
        { error: `taskType 必須是 ${validTaskTypes.join(' / ')} 之一。` },
        { status: 400 }
      );
    }

    const task = await generateIntegratedSkills({
      gradeLevel,
      difficulty,
      taskType,
      topicHint: topicHint ? sanitizeForAI(topicHint) : undefined,
      userId: authResult.userId,
    });

    return NextResponse.json({
      task,
      _meta: {
        provider: getLastAIProvider(),
        ...(wasFallbackUsed() ? { warning: 'DeepSeek 暫時無法使用，已自動切換至備用 AI。' } : {}),
      },
    }, {
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('[generate-integrated-skills] Error:', message);
    return NextResponse.json({
      error: `Integrated Skills 生成失敗：${message}`,
      _meta: { provider: getLastAIProvider() },
    }, {
      status: 500,
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  }
}
