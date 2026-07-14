// ============================================
// API: /api/reading — 閱讀理解獨立模組
// DSE Paper 1 完整對標：篇章 → 漸進式問題
//   Literal → Inferential → Evaluative
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/api-auth';
import { callLLM } from '@/lib/ai-service';

const READING_RUBRIC = `
DSE English Language Reading Level Descriptors:
L5: Understand and interpret complex texts. Identify attitudes, assumptions, and implicit meanings.
L4: Understand detailed information and infer meaning from context.
L3: Understand main ideas and some details in familiar texts.
L2: Understand basic facts in simple texts.
L1: Identify isolated words/phrases.
`;

const QUESTION_TIERS = {
  literal: 'Literal comprehension — 直接從文本中找答案（what/who/when/where）',
  inferential: 'Inferential — 需要推理、歸納（why/how/what does X imply）',
  evaluative: 'Evaluative — 批判性評價（tone/attitude/purpose/effectiveness）',
};

// POST — Generate reading passage + progressive questions
export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { gradeLevel, topic, difficulty, questionCount } = body as {
      gradeLevel?: string;
      topic?: string;
      difficulty?: string;
      questionCount?: number;
    };

    const level = gradeLevel || 'S4';
    const totalQ = Math.min(questionCount || 6, 10);

    const result = await callLLM([
      {
        role: 'system',
        content: `You are an HKDSE English Paper 1 examiner. Create a reading comprehension passage with progressive questions.

${READING_RUBRIC}

Requirements:
- Passage: 250-400 words, DSE ${level} level, topic: ${topic || 'general interest'}
- Include 3 tiers of questions (Literal → Inferential → Evaluative), ${totalQ} total
- Each question must specify which paragraph the answer is found in
- ALL answers must be directly supported by the passage

Return JSON:
{
  "passage": { "title": "...", "content": "...", "wordCount": N, "source": "adapted from..." },
  "vocabularyHints": [{ "word": "...", "meaningZh": "..." }],
  "questions": [
    {
      "index": 1, "tier": "literal|inferential|evaluative",
      "paragraphRef": 2,
      "question": "...", "questionZh": "...",
      "type": "mc", "choices": ["A...", "B...", "C...", "D..."], "answer": "A",
      "explanationZh": "...", "explanationEn": "..."
    }
  ]
}`,
      },
      { role: 'user', content: `Generate a DSE ${level} reading comprehension passage about "${topic || 'general interest'}" with ${totalQ} progressive questions.` },
    ], { temperature: 0.5, maxTokens: 4096, jsonMode: true, timeoutMs: 25000 });

    const parsed = JSON.parse(result);
    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET — List available reading topics by grade
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    topics: [
      { id: 'environment', zh: '環境保護', en: 'Environment' },
      { id: 'technology', zh: '科技與社會', en: 'Technology & Society' },
      { id: 'health', zh: '健康與生活', en: 'Health & Lifestyle' },
      { id: 'culture', zh: '文化與節日', en: 'Culture & Festivals' },
      { id: 'education', zh: '教育與學習', en: 'Education & Learning' },
      { id: 'science', zh: '科學探索', en: 'Science & Discovery' },
      { id: 'sports', zh: '運動與競技', en: 'Sports & Competition' },
      { id: 'travel', zh: '旅遊與冒險', en: 'Travel & Adventure' },
      { id: 'animals', zh: '動物與自然', en: 'Animals & Nature' },
      { id: 'history', zh: '歷史人物與事件', en: 'History' },
      { id: 'careers', zh: '職業與未來', en: 'Careers & Future' },
      { id: 'media', zh: '媒體與新聞', en: 'Media & News' },
    ],
    gradeLevels: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
    questionTiers: QUESTION_TIERS,
  });
}
