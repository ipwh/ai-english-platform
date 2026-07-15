// ============================================
// API: POST /api/ai/analyze-integrated-skills
// 批改 DSE Paper 3 Part B Integrated Skills 答案
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeIntegratedSkills, isDeepSeekConfigured, getLastAIProvider } from '@/lib/ai-service';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limiter';import { verifyApiAuth } from '@/lib/api-auth';
export async function POST(request: NextRequest) {
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

    const analysis = await analyzeIntegratedSkills({
      listeningContent,
      noteTakingGuide: noteTakingGuide || [],
      expectedContentPoints: expectedContentPoints || [],
      writingTask,
      taskType: taskType || 'summary',
      studentNotes: studentNotes || '',
      studentWriting,
      gradeLevel,
    });

    return NextResponse.json({
      analysis,
      _meta: { provider: getLastAIProvider() },
    }, {
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('[analyze-integrated-skills] Error:', message);
    return NextResponse.json({
      error: `Integrated Skills 批改失敗：${message}`,
      _meta: { provider: getLastAIProvider() },
    }, {
      status: 500,
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  }
}
