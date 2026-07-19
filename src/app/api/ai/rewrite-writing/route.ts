// ============================================
// AI 寫作改寫 API — 根據 AI 建議改寫學生作文
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { callLLM, sanitizeForAI } from '@/modules/ai/services/ai-service';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';

export async function POST(req: NextRequest) {
  const authResult = await verifyApiAuth(req);
  if (!authResult.authenticated) return NextResponse.json({ error: authResult.error }, { status: 401 });

  try {
    const body = await req.json();
    const { originalDraft, aiFeedback, gradeLevel } = body as {
      originalDraft: string;
      aiFeedback?: string;
      gradeLevel?: string;
    };

    if (!originalDraft?.trim()) {
      return NextResponse.json({ error: '缺少原文內容' }, { status: 400 });
    }

    const level = gradeLevel || 'S4';
    const sanitized = sanitizeForAI(originalDraft);

    const systemPrompt = `You are an expert HKDSE English writing tutor. Your task is to REWRITE the student's essay to improve it while PRESERVING their original ideas and voice.

GUIDELINES:
- Fix grammar errors and Chinglish expressions
- Improve vocabulary and sentence variety where appropriate
- Enhance coherence and organization
- Keep the same word count range (±20%)
- Mark changes clearly: use **bold** for improved/changed phrases
- Add brief inline comments explaining WHY you made significant changes (in [brackets])
- Match the HKDSE level: ${level}

Return ONLY a JSON object:
{
  "revisedText": "the complete rewritten essay with **bold** improvements and [inline comments]",
  "changesSummary": ["list of key changes made"],
  "improvedAreas": ["grammar", "vocabulary", "structure", "chinglish"],
  "wordCountBefore": number,
  "wordCountAfter": number
}`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: aiFeedback
        ? `Original essay:\n"""\n${sanitized}\n"""\n\nAI feedback received:\n${aiFeedback}\n\nPlease rewrite based on the feedback above.`
        : `Original essay:\n"""\n${sanitized}\n"""\n\nPlease rewrite and improve this essay.`
      },
    ];

    const result = await callLLM(messages, {
      temperature: 0.3,
      maxTokens: 4096,
      jsonMode: true,
    });

    const cleaned = result
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({
        error: 'AI returned invalid format. Please try again.',
        rewrite: null,
      }, { status: 422 });
    }

    return NextResponse.json({
      rewrite: {
        revisedText: parsed.revisedText || parsed.revisedVersion || '',
        changesSummary: parsed.changesSummary || [],
        improvedAreas: parsed.improvedAreas || [],
        wordCountBefore: parsed.wordCountBefore || sanitized.split(/\s+/).length,
        wordCountAfter: parsed.wordCountAfter || 0,
      },
    });

  } catch (error: unknown) {
    logger.error({ module: 'rewrite-writing', error }, 'Writing rewrite failed');
    const msg = error instanceof Error ? error.message : '未知錯誤';
    return NextResponse.json({ error: `AI 改寫失敗：${msg}` }, { status: 500 });
  }
}
