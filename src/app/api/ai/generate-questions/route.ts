// ============================================
// API Route: POST /api/ai/generate-questions
// 生成練習題目
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { generateQuestions, isDeepSeekConfigured, getLastAIProvider, wasFallbackUsed, sanitizeForAI } from '@/modules/ai/services/ai-service';
import { checkRateLimit, AI_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { validateRequest, generateQuestionsSchema } from '@/shared/validation/schemas';
import { logger } from '@/shared/logger/logger';

function isRetryableGenerationError(message: string): boolean {
  return /AI 回傳格式無法解析|AI 回傳資料格式異常|Vertex Gemini 回傳為空|Unexpected end of JSON|is not valid JSON/i.test(message);
}

export async function POST(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = await checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-gen:${ip}` });
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
    const parsed = validateRequest(generateQuestionsSchema, body);
    const { grammarItem, grammarItemZh, languageSkill, languageSkillZh, difficulty, gradeLevel, count, questionType, topic } = parsed;

    const safeCount = Math.min(Math.max(1, count), 20);

    let questions: Awaited<ReturnType<typeof generateQuestions>> | null = null;
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        questions = await generateQuestions({
          grammarItem,
          grammarItemZh: grammarItemZh ? sanitizeForAI(grammarItemZh) : undefined,
          languageSkill,
          languageSkillZh: languageSkillZh ? sanitizeForAI(languageSkillZh) : undefined,
          difficulty,
          gradeLevel,
          count: safeCount,
          questionType,
          topic: topic ? sanitizeForAI(topic) : undefined,
          userId: authResult.userId,
        });
        break;
      } catch (err) {
        lastErr = err;
        const message = err instanceof Error ? err.message : String(err);
        if (attempt === 1 && isRetryableGenerationError(message)) {
          logger.warn({ module: 'generate-questions', error: message }, 'Transient AI output issue, retrying');
          continue;
        }
        throw err;
      }
    }

    if (!questions || (Array.isArray(questions) && questions.length === 0)) {
      if (lastErr) throw (lastErr instanceof Error ? lastErr : new Error(String(lastErr)));
      throw new Error('AI 題目生成失敗：返回空結果，請更換文法項目或調整設定後重試');
    }

    return NextResponse.json({
      questions,
      _meta: {
        provider: getLastAIProvider(),
        ...(wasFallbackUsed() ? { warning: 'DeepSeek 暫時無法使用，已自動切換至備用 AI（Gemini），生成品質可能略有差異。' } : {}),
      },
    }, {
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  } catch (err: unknown) {
    let message: string;
    if (err instanceof Error) {
      message = err.message;
    } else if (err && typeof err === 'object' && 'status' in err && 'statusText' in err) {
      // Handle fetch Response objects thrown as exceptions
      const r = err as Response;
      message = `HTTP ${r.status} ${r.statusText}`;
      try { const body = await r.text(); message += ` — ${body.slice(0, 200)}`; } catch { logger.warn({ module: 'generate-questions' }, 'Failed to read error response body'); }
    } else {
      message = String(err);
    }
    logger.error({ module: 'generate-questions', error: message, deepseekConfigured: isDeepSeekConfigured() }, 'AI generation failed');
    return NextResponse.json({
      error: `AI 生成失敗：${message}`,
      _meta: { provider: getLastAIProvider(), deepseekConfigured: isDeepSeekConfigured() },
    }, {
      status: 500,
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  }
}


