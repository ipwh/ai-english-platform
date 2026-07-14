// ============================================
// API: POST /api/writing/model-essays
// 為指定寫作題目生成 L3 / L4 / L5 三級範文
// 學生可對比學習不同等級的寫作要求
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/api-auth';
import { callLLM } from '@/lib/ai-service';

const HKDSE_WRITING_RUBRIC = `
HKDSE English Language Writing Level Descriptors:

L5 (Level 5):
- Content: Highly relevant, well-developed ideas with sophisticated arguments and examples
- Language & Style: Wide range of accurate sentence structures, precise vocabulary, appropriate register
- Organization: Excellent coherence, logical paragraphing, effective transitions

L4 (Level 4):
- Content: Relevant ideas with good development and supporting details
- Language & Style: Good range of structures with only minor errors, appropriate vocabulary
- Organization: Clear organization with logical paragraphing

L3 (Level 3):
- Content: Adequate ideas, some development with basic examples
- Language & Style: Simple but mostly accurate sentence structures, basic vocabulary
- Organization: Basic organization with some paragraphing
`;

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { prompt, textType, wordLimit, gradeLevel, studentLevel } = body as {
      prompt: string;
      textType?: string;
      wordLimit?: number;
      gradeLevel?: string;
      studentLevel?: string; // 學生目前水平，用於 highlight 差距
    };

    if (!prompt) {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 });
    }

    const limit = wordLimit || 200;
    const level = gradeLevel || 'S4';

    const result = await callLLM([
      {
        role: 'system',
        content: `You are an HKDSE English Writing examiner. Generate THREE model essays for the same prompt at L3, L4, and L5 levels.

${HKDSE_WRITING_RUBRIC}

Requirements:
- Text type: ${textType || 'essay'}, grade: ${level}, word limit: ~${limit} words
- L3 essay: Simple sentences, basic vocabulary, some minor errors, adequate content
- L4 essay: Good sentence variety, appropriate vocabulary, minor errors only, well-developed
- L5 essay: Sophisticated structures, precise vocabulary, near-perfect accuracy, highly developed ideas
- Each essay should be REALISTIC — L3 should have typical student errors, not be perfect
- Annotate each essay with marginal comments highlighting strengths and weaknesses

Return JSON:
{
  "prompt": "original prompt",
  "textType": "${textType || 'essay'}",
  "wordLimit": ${limit},
  "gradeLevel": "${level}",
  "essays": {
    "L3": {
      "content": "essay text...",
      "wordCount": N,
      "annotations": [
        { "text": "highlighted phrase", "commentZh": "簡單但正確的句子結構", "commentEn": "Simple but correct sentence structure", "type": "strength|weakness" }
      ],
      "scoreBreakdown": { "content": 3, "language": 3, "organization": 3 },
      "overallCommentZh": "L3 評語...",
      "overallCommentEn": "L3 comment..."
    },
    "L4": { ...same structure... },
    "L5": { ...same structure... }
  },
  "comparisonTable": {
    "content": { "L3": "..., L4": "...", "L5": "..." },
    "language": { "L3": "..., L4": "...", "L5": "..." },
    "organization": { "L3": "..., L4": "...", "L5": "..." }
  },
  "upgradeTips": ["tip1 zh", "tip2 zh"] ${studentLevel ? `(focus on how to level up from ${studentLevel})` : ''}
}`,
      },
      { role: 'user', content: `Generate L3/L4/L5 model essays for this DSE ${level} writing prompt:\n\n"${prompt}"\n\n${studentLevel ? `The student is currently at ${studentLevel} level.` : ''}` },
    ], { temperature: 0.6, maxTokens: 6144, jsonMode: true, timeoutMs: 35000 });

    const parsed = JSON.parse(result);
    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
