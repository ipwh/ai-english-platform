// ============================================
// API: POST /api/vocabulary/example
// 為單字生成年級自適應的例句（取代 generate-questions hack）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { callLLM, isBudgetExceededError } from '@/modules/ai';
import { logger } from '@/shared/logger/logger';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit, AI_RATE_LIMIT } from '@/shared/utils/rate-limiter';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimit = await checkRateLimit({ ...AI_RATE_LIMIT, identifier: `vocab-example:${ip}` });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: rateLimit.message }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const body = await request.json();
    const { word, partOfSpeech, meaningZh, gradeLevel } = body;

    if (!word) {
      return NextResponse.json({ error: 'word 為必填 / word is required' }, { status: 400 });
    }

    const grade = gradeLevel || 'S4';
    const difficultyHint = grade === 'S1' || grade === 'S2'
      ? 'Use simple vocabulary and familiar school/family contexts. Keep the sentence short (8-12 words).'
      : grade === 'S3' || grade === 'S4'
        ? 'Use intermediate vocabulary and everyday situations. 12-18 words.'
        : 'Use DSE-level vocabulary and authentic contexts (news, social issues, academic). 15-22 words.';

    const systemPrompt = `You are a Hong Kong secondary school English teacher.
Generate ONE natural, grade-appropriate example sentence for the given English word.

CRITICAL: Output ONLY the JSON object. Do NOT write instructions like "Write an example sentence..." — just output the actual sentence.

Requirements:
- The sentence MUST use the word naturally in context
- ${difficultyHint}
- The sentence should be relevant to Hong Kong students' life
- For negative/superlative words (worst, terrible, etc.), use neutral contexts like describing weather, traffic, or fictional scenarios — NEVER about students, schools, or Hong Kong
- Output ONLY a valid JSON object (start with {, end with }), no markdown, no extra text

JSON format:
{
  "exampleSentence": "The complete English example sentence.",
  "exampleZh": "繁體中文翻譯 of the sentence"
}`;

    const userPrompt = `Word: ${word}
Part of speech: ${partOfSpeech || 'unknown'}
Chinese meaning: ${meaningZh || 'unknown'}
Grade level: ${grade}

Generate one example sentence.`;

    const result = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.7, maxTokens: 512, jsonMode: true, timeoutMs: 12000 }
    );

    let parsed: { exampleSentence: string; exampleZh: string };
    try {
      const cleaned = result.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const match = result.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('AI 回傳格式無法解析');
    }

    return NextResponse.json({
      exampleSentence: parsed.exampleSentence || '',
      exampleZh: parsed.exampleZh || '',
    });
  } catch (err: unknown) {
    if (isBudgetExceededError(err)) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : '未知錯誤';
    logger.error({ module: 'vocab-example', error: message }, 'Vocab example generation failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
