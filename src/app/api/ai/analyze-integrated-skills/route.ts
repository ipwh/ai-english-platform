// ============================================
// API: POST /api/ai/analyze-integrated-skills
// 批改 DSE Paper 3 Part B Integrated Skills 答案
// ============================================

import { NextRequest, NextResponse } from 'next/server';
// R3.10-L: use the canonical facade usecase (executeAI + Zod-validated schema),
// NOT the legacy callLLM-based service — single AI pipeline per project rules.
import { analyzeIntegratedSkills, sanitizeForAI, isDeepSeekConfigured, getLastAIProvider, wasFallbackUsed, isBudgetExceededError } from '@/modules/ai';

import { checkRateLimit, AI_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { detectOverCopyingAcrossSources } from '@/modules/assessment/services/plagiarism';
import { logger } from '@/shared/logger/logger';
export async function POST(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = await checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-intsk-analyze:${ip}` });
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
    const {
      listeningContent, noteTakingGuide, expectedContentPoints,
      writingTask, taskType, studentNotes, studentWriting, gradeLevel,
      dataFileSources,
    } = body;

    if (!listeningContent || !writingTask || !studentWriting) {
      return NextResponse.json(
        { error: '請提供 listeningContent, writingTask, studentWriting。 / Please provide listeningContent, writingTask and studentWriting' },
        { status: 400 }
      );
    }

    // 🔒 Input length limits — prevent token exhaustion attacks
    const MAX_LISTENING = 15000;
    const MAX_WRITING_TASK = 5000;
    const MAX_STUDENT_WRITING = 10000;
    const MAX_STUDENT_NOTES = 10000;
    // 2026-08-29 audit: the Data File must reach the analyzer — otherwise
    // dataManipulationFeedback is produced about material the AI never saw.
    const sanitizedDataFileSources = Array.isArray(dataFileSources)
      ? dataFileSources
          .filter((s: unknown): s is { type?: unknown; title?: unknown; content?: unknown } => !!s && typeof s === 'object')
          .map(s => ({
            type: typeof s.type === 'string' ? s.type.slice(0, 40) : 'source',
            title: typeof s.title === 'string' ? s.title.slice(0, 200) : '',
            content: typeof s.content === 'string' ? sanitizeForAI(s.content.slice(0, 2000)) : '',
          }))
          .filter(s => s.content.length > 0)
          .slice(0, 8)
      : [];

    const analysis = await analyzeIntegratedSkills({
      listeningContent: sanitizeForAI(listeningContent.length > MAX_LISTENING ? listeningContent.slice(0, MAX_LISTENING) : listeningContent),
      noteTakingGuide: noteTakingGuide || [],
      expectedContentPoints: expectedContentPoints || [],
      writingTask: sanitizeForAI(writingTask.length > MAX_WRITING_TASK ? writingTask.slice(0, MAX_WRITING_TASK) : writingTask),
      taskType: taskType || 'summary',
      studentNotes: sanitizeForAI((studentNotes || '').length > MAX_STUDENT_NOTES ? (studentNotes || '').slice(0, MAX_STUDENT_NOTES) : (studentNotes || '')),
      studentWriting: sanitizeForAI(studentWriting.length > MAX_STUDENT_WRITING ? studentWriting.slice(0, MAX_STUDENT_WRITING) : studentWriting),
      gradeLevel,
      dataFileSources: sanitizedDataFileSources,
      userId: authResult.userId,
    });

    // === 抄襲檢測：比較學生寫作與聆聽文稿 + 每份 Data File 來源 ===
    // （2026-08-30 audit: 以往只比對聆聽文稿，直接抄 Data File 不會被偵測）
    const overCopyResult = detectOverCopyingAcrossSources(
      [listeningContent, ...sanitizedDataFileSources.map(s => s.content)],
      studentWriting,
    );

    return NextResponse.json({
      analysis,
      overCopyCheck: overCopyResult,
      _meta: { provider: getLastAIProvider(), fallback: wasFallbackUsed() },
    }, {
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  } catch (err: unknown) {
    if (isBudgetExceededError(err)) {
      return NextResponse.json({
        error: `Integrated Skills 批改失敗：${err.message} / Integrated Skills analysis failed: ${err.message}`,
        _meta: { provider: getLastAIProvider(), fallback: wasFallbackUsed() },
      }, { status: 503, headers: { 'X-AI-Provider': getLastAIProvider() } });
    }
    const message = err instanceof Error ? err.message : '未知錯誤 / Unknown error';
    logger.error({ module: 'analyze-integrated-skills', error: message }, 'Integrated skills analysis failed');
    return NextResponse.json({
      error: `Integrated Skills 批改失敗：${message} / Integrated Skills analysis failed: ${message}`,
      _meta: { provider: getLastAIProvider(), fallback: wasFallbackUsed() },
    }, {
      status: 500,
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  }
}
