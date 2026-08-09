// ============================================
// POST /api/ai/generate-model-essay
// 生成中等水平範文（供學生比較學習）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { callLLM, sanitizeForAI, HALLUCINATION_GUARD } from '@/modules/ai';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';

export async function POST(req: NextRequest) {
  const authResult = await verifyApiAuth(req);
  if (!authResult.authenticated) return NextResponse.json({ error: authResult.error }, { status: 401 });

  try {
    const body = await req.json();
    const { topic, textType, gradeLevel, wordLimit, level } = body as {
      topic: string; textType?: string; gradeLevel?: string; wordLimit?: number; level?: 'high' | 'mid';
    };

    if (!topic?.trim()) {
      return NextResponse.json({ error: '缺少寫作題目' }, { status: 400 });
    }

    const targetLevel = level === 'mid' ? 'Level 3 (mid-range)' : 'Level 5 (high)';
    const words = wordLimit || 250;

    const systemPrompt = `${HALLUCINATION_GUARD}
You are an HKDSE English teacher. Write a model essay at ${targetLevel} standard.

The essay must:
- Respond to the given writing prompt COMPLETELY
- Be approximately ${words} words
- Match the required text type (${textType || 'essay'})
- For Level 3 (mid): use simple but correct English, basic vocabulary, adequate content coverage, some minor errors acceptable
- For Level 5 (high): use sophisticated vocabulary, varied sentence structures, excellent organization, flawless grammar
- Sound like a real Hong Kong secondary school student's work (not an academic paper)

Return ONLY a JSON object:
{ "essay": "the complete model essay text" }`;

    const userPrompt = `Writing prompt:\n"""\n${sanitizeForAI(topic)}\n"""\n\nGrade level: ${gradeLevel || 'S4'}\nTarget level: ${targetLevel}\nWord limit: ~${words} words`;

    const resultText = await callLLM(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      { temperature: 0.5, maxTokens: 2048, jsonMode: true, timeoutMs: 25000, userId: authResult.userId },
    );

    const parsed = JSON.parse(resultText);
    return NextResponse.json({ essay: parsed.essay || resultText });
  } catch (error) {
    logger.error({ module: 'generate-model-essay', error: (error as Error).message }, 'Model essay generation failed');
    return NextResponse.json({ error: '範文生成失敗' }, { status: 500 });
  }
}
