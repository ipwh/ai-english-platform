// ============================================
// API: POST /api/vocabulary/suggest
// 從練習內容中自動建議「值得加入生字簿」的單字
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { callLLM } from '@/modules/ai/services/ai-service';;
import { validateRequest, vocabularySuggestSchema } from '@/shared/validation/schemas'

export async function POST(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { studentId, text, source, gradeLevel } = body;

    if (!studentId || !text) {
      return NextResponse.json({ error: 'studentId, text 為必填' }, { status: 400 });
    }

    // 🔒 Ownership: students can only get suggestions for themselves
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能為自己的帳號獲取建議' }, { status: 403 });
    }

    // 取得學生已有的生字（避免重複建議）
    const existingVocab = await db.vocabItem.findMany({
      where: { studentId },
      select: { word: true },
    });
    const existingWords = new Set(existingVocab.map(v => v.word.toLowerCase()));

    const systemPrompt = `你是一位香港中學英文教師，專注協助學生累積詞彙。
請分析以下英文文本，找出 **3-5 個值得學生學習的單字**。

篩選條件：
- 優先選擇 DSE 程度或對學生有挑戰性的單字
- 優先選擇在學術寫作 / 考試中有用的詞彙
- 跳過非常基礎的單字（如 "the", "and", "is", "school", "student"）
- 跳過專有名詞（人名、地名）
- 根據年級調整難度：${gradeLevel || 'S4'}（S1-S3 偏基礎詞彙，S4-S6 偏 DSE 程度）

回覆格式（純 JSON 陣列）：
[
  {
    "word": "example",
    "reasonZh": "為什麼建議學這個字（繁體中文，簡短一句）",
    "partOfSpeech": "noun"
  }
]

只回覆 JSON 陣列，不要其他文字。`;

    const userPrompt = `文本來源：${source || '練習'}\n年級：${gradeLevel || '未知'}\n已有單字（避免重複）：${[...existingWords].slice(0, 30).join(', ')}\n\n文本內容：\n"""\n${text.slice(0, 3000)}\n"""\n\n請推薦 3-5 個值得學習的單字。`;

    const result = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.3, maxTokens: 1024, jsonMode: true, timeoutMs: 15000 }
    );

    // 解析 AI 回傳
    let suggestions: { word: string; reasonZh: string; partOfSpeech: string }[] = [];
    try {
      const cleaned = result.replace(/```json|```/g, '').trim();
      suggestions = JSON.parse(cleaned);
    } catch {
      // Try regex extraction
      const match = result.match(/\[[\s\S]*\]/);
      if (match) suggestions = JSON.parse(match[0]);
    }

    // 過濾已有單字
    const filtered = suggestions.filter(s => !existingWords.has(s.word.toLowerCase()));

    return NextResponse.json({ suggestions: filtered.slice(0, 5) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('[vocab-suggest] Error:', message);
    return NextResponse.json({ suggestions: [], error: message }, { status: 500 });
  }
}
