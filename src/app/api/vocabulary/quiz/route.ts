// ============================================
// API: POST /api/vocabulary/quiz
// 從學生生字簿中生成互動式測驗題目（配對題、填充題）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { callLLM } from '@/modules/ai/services/ai-service';
import { logger } from '@/shared/logger/logger';
import { serializeVocab } from '@/shared/utils/utils';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit, AI_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { listVocabFiltered } from '@/modules/student';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimit = await checkRateLimit({ ...AI_RATE_LIMIT, identifier: `vocab-quiz:${ip}` });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: rateLimit.message }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const body = await request.json();
    const { studentId, type, count, wordIds } = body;

    // 驗證 studentId 與已登入用戶一致（防止存取他人資料）
    if (studentId && authResult.userId && studentId !== authResult.userId && authResult.role !== 'teacher' && authResult.role !== 'admin') {
      return NextResponse.json({ error: '無權限存取此學生的資料' }, { status: 403 });
    }
    const effectiveStudentId = studentId || authResult.userId;

    if (!effectiveStudentId) {
      return NextResponse.json({ error: 'studentId 為必填' }, { status: 400 });
    }

    const vocabItems = wordIds && Array.isArray(wordIds) && wordIds.length > 0
      ? await listVocabFiltered({
          where: { studentId: effectiveStudentId, id: { in: wordIds } },
          orderBy: { masteryLevel: 'asc' },
          skip: 0,
          take: wordIds.length,
        })
      : await listVocabFiltered({
          where: { studentId: effectiveStudentId },
          orderBy: { masteryLevel: 'asc' },
          skip: 0,
          take: 30,
        });

    if (vocabItems.length === 0) {
      return NextResponse.json({ quiz: [], message: '你的生字簿還沒有單字，先加入一些吧！' });
    }

    const deserialized = vocabItems.map(serializeVocab);
    const quizType = type || 'mixed';
    const quizCount = Math.min(count || 5, deserialized.length);

    // === 模式 1：AI 生成選擇題（從生字中出題） ===
    if (quizType === 'mc' || quizType === 'mixed') {
      const wordsForMc = deserialized
        .filter((v): v is Record<string, unknown> & { meaningZh: string; word: string; partOfSpeech: string } => !!v.meaningZh)
        .slice(0, 10)
        .map((v) => ({ word: v.word as string, pos: v.partOfSpeech as string, meaning: v.meaningZh as string }));

      if (wordsForMc.length >= 3) {
        const systemPrompt = `你是一位香港中學英文教師，正在為學生準備詞彙測驗。
請根據以下學生已學的單字，生成 ${Math.min(quizCount, 5)} 道選擇題（MCQ）。

每道題的題目格式：給出中文意思，讓學生選出對應的英文單字。
4 個選項中只有 1 個正確答案，其他 3 個從提供的單字清單中選取（作為干擾選項）。

回覆純 JSON 陣列（不要 markdown）：
[
  {
    "type": "mc",
    "promptZh": "「環境」的英文是？",
    "choices": ["environment", "pollution", "climate", "nature"],
    "answer": "A",
    "word": "environment",
    "meaningZh": "環境"
  }
]`;

        const wordList = wordsForMc.map((w) => `${w.word} (${w.pos}) — ${w.meaning}`).join('\n');

        const userPrompt = `學生單字清單：\n${wordList}\n\n請生成 ${Math.min(quizCount, 5)} 道詞彙選擇題。`;

        try {
          const result = await callLLM(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            { temperature: 0.5, maxTokens: 2048, jsonMode: true, timeoutMs: 20000 }
          );

          const cleaned = result.replace(/```json|```/g, '').trim();
          const mcQuestions = JSON.parse(cleaned);

          return NextResponse.json({
            quiz: mcQuestions,
            type: 'mc',
            source: `從 ${vocabItems.length} 個生字中生成`,
          });
        } catch (aiErr) {
          console.warn('[vocab-quiz] AI MCQ generation failed, falling back to match mode');
        }
      }
    }

    // === 模式 2：配對題（fallback：不依賴 AI） ===
    const selected = deserialized.slice(0, Math.min(quizCount, 10));
    const quiz = selected.map((v, i) => ({
      type: 'match' as const,
      id: v.id as string,
      word: v.word as string,
      meaningZh: v.meaningZh as string,
      partOfSpeech: v.partOfSpeech as string,
      distractorMeanings: deserialized
        .filter((_, j) => j !== i)
        .slice(0, 3)
        .map((d) => d.meaningZh as string),
    }));

    return NextResponse.json({
      quiz,
      type: 'match',
      source: `從 ${vocabItems.length} 個生字中選取 ${quiz.length} 題`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    logger.error({ module: 'vocab-quiz', error: message }, 'Vocab quiz generation failed');
    return NextResponse.json({ quiz: [], error: message }, { status: 500 });
  }
}
