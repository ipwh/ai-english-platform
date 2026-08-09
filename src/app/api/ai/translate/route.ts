// ============================================
// POST /api/ai/translate
// 翻譯英文至繁體中文（供筆記指引中英對照使用）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { callLLM } from '@/modules/ai/services/llm-call';
import { logger } from '@/shared/logger/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items } = body as { items: { question: string; hint: string }[] };
    if (!items?.length) return NextResponse.json({ translations: [] });

    const text = items.map((item, i) => `${i + 1}. Q: ${item.question}\n   Hint: ${item.hint}`).join('\n\n');
    const result = await callLLM(
      [{ role: 'system', content: 'Translate the following English note-taking guide to Traditional Chinese (繁體中文). Return ONLY a JSON array: [{"q":"中文問題","h":"中文提示"}]. No other text.' },
       { role: 'user', content: text }],
      { temperature: 0.1, maxTokens: 1024, jsonMode: true, timeoutMs: 10000 },
    );

    const match = result.match(/\[[\s\S]*\]/);
    const translations = match ? JSON.parse(match[0]) : [];
    return NextResponse.json({ translations });
  } catch (error) {
    logger.error({ module: 'translate', error: (error as Error).message }, 'Translation failed');
    return NextResponse.json({ translations: [] });
  }
}
