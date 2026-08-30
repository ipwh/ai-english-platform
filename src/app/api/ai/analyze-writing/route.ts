// ============================================
// API Route: POST /api/ai/analyze-writing
// 批改學生寫作
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeWriting, isDeepSeekConfigured, getLastAIProvider, wasFallbackUsed, sanitizeForAI, isBudgetExceededError } from '@/modules/ai';
import { checkRateLimit, AI_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { validateRequest, analyzeWritingSchema, resolveWritingStudentLevel } from '@/shared/validation/schemas';
import { logger } from '@/shared/logger/logger';

export async function POST(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = await checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-writing:${ip}` });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.message }, {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
      });
    }

    if (!isDeepSeekConfigured()) {
      return NextResponse.json(
        { error: 'AI 服務尚未設定。請設定 DEEPSEEK_API_KEY，或設定 Vertex service account（GCP_PROJECT_ID + GCP_SERVICE_ACCOUNT_JSON/GOOGLE_APPLICATION_CREDENTIALS）。 / AI service is not configured. Set DEEPSEEK_API_KEY, or configure a Vertex service account (GCP_PROJECT_ID + GCP_SERVICE_ACCOUNT_JSON/GOOGLE_APPLICATION_CREDENTIALS).' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const parsed = validateRequest(analyzeWritingSchema, body);
    const { title, prompt, studentDraft, textType } = parsed;
    // Contract boundary: the UI sends `gradeLevel`; normalize once to the
    // internal `studentLevel` (explicit mapping, no silent field stripping).
    const studentLevel = resolveWritingStudentLevel(parsed);

    // Artifact identity (e.g. generated_model) — echo-only context.
    // Client-supplied metadata can NEVER alter canonical scoring.
    const artifact = parsed.artifact;

    // 限制草稿長度，防止 token 超限
    const MAX_DRAFT_LENGTH = 5000;
    const safeDraft = typeof studentDraft === 'string' && studentDraft.length > MAX_DRAFT_LENGTH
      ? studentDraft.slice(0, MAX_DRAFT_LENGTH)
      : studentDraft;

    const analysis = await analyzeWriting({
      title: sanitizeForAI(title),
      prompt: prompt ? sanitizeForAI(prompt) : '',
      studentDraft: sanitizeForAI(safeDraft),
      studentLevel,
      textType,
      artifact,
      userId: authResult.userId,
    });

    return NextResponse.json({
      analysis,
      _meta: {
        provider: getLastAIProvider(),
        ...(wasFallbackUsed() ? { warning: 'DeepSeek 暫時無法使用，已自動切換至備用 AI。 / DeepSeek is temporarily unavailable; switched to a fallback AI provider.' } : {}),
      },
    }, {
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  } catch (err: unknown) {
    if (isBudgetExceededError(err)) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : '未知錯誤';
    logger.error({ module: 'analyze-writing', error: message }, 'Writing analysis failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


