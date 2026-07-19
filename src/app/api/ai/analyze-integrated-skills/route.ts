// ============================================
// API: POST /api/ai/analyze-integrated-skills
// 批改 DSE Paper 3 Part B Integrated Skills 答案
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeIntegratedSkills, isDeepSeekConfigured, getLastAIProvider, wasFallbackUsed, sanitizeForAI } from '@/modules/ai/services/ai-service';

import { checkRateLimit, AI_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { detectOverCopying } from '@/modules/assessment/services/plagiarism';
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
        { error: 'AI 服務尚未設定。' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const {
      listeningContent, noteTakingGuide, expectedContentPoints,
      writingTask, taskType, studentNotes, studentWriting, gradeLevel,
    } = body;

    if (!listeningContent || !writingTask || !studentWriting) {
      return NextResponse.json(
        { error: '請提供 listeningContent, writingTask, studentWriting。' },
        { status: 400 }
      );
    }

    // 🔒 Input length limits — prevent token exhaustion attacks
    const MAX_LISTENING = 15000;
    const MAX_WRITING_TASK = 5000;
    const MAX_STUDENT_WRITING = 10000;
    const MAX_STUDENT_NOTES = 10000;

    const analysis = await analyzeIntegratedSkills({
      listeningContent: listeningContent.length > MAX_LISTENING ? listeningContent.slice(0, MAX_LISTENING) : listeningContent,
      noteTakingGuide: noteTakingGuide || [],
      expectedContentPoints: expectedContentPoints || [],
      writingTask: writingTask.length > MAX_WRITING_TASK ? writingTask.slice(0, MAX_WRITING_TASK) : writingTask,
      taskType: taskType || 'summary',
      studentNotes: sanitizeForAI((studentNotes || '').length > MAX_STUDENT_NOTES ? (studentNotes || '').slice(0, MAX_STUDENT_NOTES) : (studentNotes || '')),
      studentWriting: sanitizeForAI(studentWriting.length > MAX_STUDENT_WRITING ? studentWriting.slice(0, MAX_STUDENT_WRITING) : studentWriting),
      gradeLevel,
      userId: authResult.userId,
    });

    // === 抄襲檢測：檢查學生寫作是否過度複製聆聽文稿 ===
    const overCopyResult = detectOverCopying(listeningContent, studentWriting);

    return NextResponse.json({
      analysis,
      overCopyCheck: overCopyResult,
      _meta: { provider: getLastAIProvider(), fallback: wasFallbackUsed() },
    }, {
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    logger.error({ module: 'analyze-integrated-skills', error: message }, 'Integrated skills analysis failed');
    return NextResponse.json({
      error: `Integrated Skills 批改失敗：${message}`,
      _meta: { provider: getLastAIProvider(), fallback: wasFallbackUsed() },
    }, {
      status: 500,
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  }
}
