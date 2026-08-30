// ============================================
// API: POST /api/ai/generate-integrated-skills
// 生成 DSE Paper 3 Part B Integrated Skills 任務
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { generateIntegratedSkills } from '@/modules/ai';
import { isDeepSeekConfigured, getLastAIProvider, wasFallbackUsed, sanitizeForAI, isBudgetExceededError } from '@/modules/ai';

import { checkRateLimit, AI_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';

const VALID_TASK_TYPES = [
  'summary', 'email-reply', 'short-article', 'report',
  'speech', 'proposal', 'notice', 'press-release', 'letter-to-editor',
] as const;

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
        { error: 'AI 服務尚未設定。 / AI service is not configured.' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { gradeLevel, difficulty, taskType, topicHint } = body;

    if (!gradeLevel || !difficulty || !taskType) {
      return NextResponse.json(
        { error: '請提供 gradeLevel, difficulty, taskType。 / Please provide gradeLevel, difficulty and taskType' },
        { status: 400 }
      );
    }

    const validTaskTypes = VALID_TASK_TYPES as readonly string[];
    if (!validTaskTypes.includes(taskType)) {
      return NextResponse.json(
        { error: `taskType 必須是 ${validTaskTypes.join(' / ')} 之一。 / taskType must be one of ${validTaskTypes.join(' / ')}` },
        { status: 400 }
      );
    }

    // 🔒 2026-08-30 audit (R5): 未驗證的 difficulty 會令 config 查表回 undefined → 500
    const validDifficulties = ['remedial', 'core', 'challenge'] as const;
    if (!validDifficulties.includes(difficulty)) {
      return NextResponse.json(
        { error: `difficulty 必須是 ${validDifficulties.join(' / ')} 之一。 / difficulty must be one of ${validDifficulties.join(' / ')}` },
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
    if (isBudgetExceededError(err)) {
      return NextResponse.json({
        error: `Integrated Skills 生成失敗：${err.message} / Integrated Skills generation failed: ${err.message}`,
        _meta: { provider: getLastAIProvider() },
      }, { status: 503, headers: { 'X-AI-Provider': getLastAIProvider() } });
    }
    const message = err instanceof Error ? err.message : '未知錯誤 / Unknown error';
    logger.error({ module: 'generate-integrated-skills', error: message }, 'Integrated skills generation failed');
    return NextResponse.json({
      error: `Integrated Skills 生成失敗：${message} / Integrated Skills generation failed: ${message}`,
      _meta: { provider: getLastAIProvider() },
    }, {
      status: 500,
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  }
}
