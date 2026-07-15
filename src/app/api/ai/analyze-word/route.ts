// ============================================
// API: POST /api/ai/analyze-word — AI 單字分析
// 輸入一個英文單字 + 學生年級，自動分析詞性、意思、例句、同反義字、搭配詞
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { callLLM, sanitizeForAI } from '@/lib/ai-service';
import { WordAnalysisSchema, validateAIResponse } from '@/lib/ai-schema';
import { verifyApiAuth } from '@/lib/api-auth';
import { z } from 'zod';

const RequestSchema = z.object({
  word: z.string().min(1).max(100),
  gradeLevel: z.enum(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']).optional().default('S4'),
});

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) return NextResponse.json({ error: authResult.error }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: '無效的請求：word 為必填，gradeLevel 為 S1-S6' },
        { status: 400 }
      );
    }

    const { word: rawWord, gradeLevel } = parsed.data;
    const word = sanitizeForAI(rawWord.trim());

    const userMessage = `請分析以下英文單字：${word}\n學生年級：${gradeLevel}`;

    const systemPrompt = `你是香港中學英語教學專家，專門幫助 S1-S6 學生建立個人化生字簿。

分析英文單字，以 JSON 格式回傳完整詞彙資料。

## 輸出格式
{
  "word": "單字",
  "partOfSpeech": "主要詞性 (noun/verb/adjective/adverb/preposition/conjunction/pronoun/phrase)",
  "allPartOfSpeech": ["所有常見詞性"],
  "meaningZh": "主要中文意思（繁體中文）",
  "secondaryMeaningZh": "次要中文意思（如有，否則 null）",
  "exampleSentence": "英文例句",
  "exampleZh": "例句中文翻譯（繁體中文）",
  "synonyms": ["同義字"],
  "antonyms": ["反義字"],
  "collocations": ["搭配詞，格式如 make a decision"]
}

## 規則
- meaningZh 使用繁體中文
- 例句難度適應 ${gradeLevel} 年級：
  S1-S2: 簡單句、基礎詞彙
  S3-S4: 中等複雜度、加入從句
  S5-S6: DSE 程度、複雜句式
- collocations 格式: "動詞 + 名詞" 或常見片語
- 不要輸出 markdown，只輸出純 JSON`;

    const result = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      { temperature: 0.3, maxTokens: 1024, jsonMode: true, timeoutMs: 15000 }
    );

    // Parse and validate
    let data: unknown;
    try {
      data = JSON.parse(result);
    } catch {
      // Try to extract JSON from text
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { data = JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
      }
      if (!data) {
        return NextResponse.json(
          { error: 'AI 回傳格式無法解析，請重試。' },
          { status: 500 }
        );
      }
    }

    const validation = validateAIResponse(WordAnalysisSchema, data);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ analysis: validation.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI 分析失敗';
    console.error('[analyze-word]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
