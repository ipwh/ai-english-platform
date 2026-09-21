// ============================================
// API Route: POST /api/ai/generate-questions
// 生成練習題目
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { generateQuestions, isDeepSeekConfigured, getLastAIProvider, wasFallbackUsed, sanitizeForAI, isBudgetExceededError } from '@/modules/ai';
import { checkRateLimit, AI_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { validateRequest, generateQuestionsSchema } from '@/shared/validation/schemas';
import { logger } from '@/shared/logger/logger';
import { persistGeneratedGrammarQuestions } from '@/modules/exercise/services/grammar-question-service';
import { persistGeneratedReadingQuestions } from '@/modules/reading/services/reading-question-service';
import { persistGeneratedListeningQuestions, isDeliverableListeningMc } from '@/modules/listening/services/listening-question-service';
import type { GeneratedQuestion } from '@/modules/ai';

// R3.10-D: 文法題目（grammarItem 驅動，非閱讀/聆聽/寫作/口語）在交付前
// 必須持久化到伺服器 GrammarQuestion store，並以伺服器 id 作為正典身份。
const NON_GRAMMAR_LANGUAGE_SKILLS = new Set(['reading', 'listening', 'writing', 'speaking', 'integrated', 'vocabulary']);

/**
 * 2026-09-21 ADR-045：聆聽選擇題能否交付的判準由 listening 模組持有
 * （`isDeliverableListeningMc`，單一 owner，可單元測試）。
 * 此處僅保留給舊呼叫端的別名。
 */
export const isVerbatimListeningMc = isDeliverableListeningMc;

function isRetryableGenerationError(message: string): boolean {
  return /AI 回傳格式無法解析|AI 回傳資料格式異常|Unexpected end of JSON|is not valid JSON/i.test(message);
}

export async function POST(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = await checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-gen:${ip}` });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.message }, {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
      });
    }

    if (!isDeepSeekConfigured()) {
      return NextResponse.json(
        { error: 'AI 服務尚未設定。請設定 DEEPSEEK_API_KEY，或設定 Vertex service account（GCP_PROJECT_ID + GCP_SERVICE_ACCOUNT_JSON/GOOGLE_APPLICATION_CREDENTIALS）。 / AI service is not configured. Set DEEPSEEK_API_KEY, or configure a Vertex service account (GCP_PROJECT_ID + GCP_SERVICE_ACCOUNT_JSON/GOOGLE_APPLICATION_CREDENTIALS).' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const parsed = validateRequest(generateQuestionsSchema, body);
    const { grammarItem, grammarItemZh, languageSkill, languageSkillZh, difficulty, gradeLevel, count, questionType, topic } = parsed;

    const safeCount = Math.min(Math.max(1, count), 20);

    let questions: Awaited<ReturnType<typeof generateQuestions>> | null = null;
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        questions = await generateQuestions({
          grammarItem,
          grammarItemZh: grammarItemZh ? sanitizeForAI(grammarItemZh) : undefined,
          languageSkill,
          languageSkillZh: languageSkillZh ? sanitizeForAI(languageSkillZh) : undefined,
          difficulty,
          gradeLevel,
          count: safeCount,
          questionType,
          topic: topic ? sanitizeForAI(topic) : undefined,
          userId: authResult.userId,
        });
        break;
      } catch (err) {
        lastErr = err;
        const message = err instanceof Error ? err.message : String(err);
        if (attempt === 1 && isRetryableGenerationError(message)) {
          logger.warn({ module: 'generate-questions', error: message }, 'Transient AI output issue, retrying');
          continue;
        }
        throw err;
      }
    }

    if (!questions || (Array.isArray(questions) && questions.length === 0)) {
      if (lastErr) throw (lastErr instanceof Error ? lastErr : new Error(String(lastErr)));
      throw new Error('AI 題目生成失敗：返回空結果，請更換文法項目或調整設定後重試 / AI question generation failed: empty result. Please change the grammar item or adjust settings and retry.');
    }

    // R3.10-D: 文法題目在交付前持久化，伺服器 id 為正典身份。
    // 持久化失敗 → 不交付（客戶端無法在伺服器評分，絕不回退客戶端 key）。
    const isGrammarRequest = !NON_GRAMMAR_LANGUAGE_SKILLS.has(String(languageSkill ?? '').trim().toLowerCase());
    let questionsWithIds = questions;
    if (isGrammarRequest && questions.length > 0) {
      try {
        const ids = await persistGeneratedGrammarQuestions(
          questions.map(q => ({
            questionType: q.type,
            prompt: q.prompt,
            promptZh: q.promptZh ?? null,
            choices: q.choices ?? null,
            answer: q.answer,
            acceptedAnswers: null,
            grammarItem: grammarItem ?? null,
            languageSkill: null,
            difficulty,
            gradeLevel,
            explanationZh: q.explanationZh || null,
            explanationEn: q.explanationEn || null,
            provenance: 'ai-generated',
          })),
        );
        questionsWithIds = questions.map((q, i) => ({ ...q, id: ids[i] }));
      } catch (err) {
        logger.error({ module: 'generate-questions', error: err instanceof Error ? err.message : String(err) }, 'Grammar question persistence failed');
        throw new Error('文法題目伺服器持久化失敗，請重試 / Server persistence of grammar questions failed. Please retry.');
      }
    }

    // 2026-09-20（D2b/D3）：閱讀選擇題同樣在交付前持久化（ReadingQuestion），
    // 令診斷等呼叫端可經 `scoreReadingAnswers` 用伺服器持有的答案鍵評分
    // （reading-server-exact-match → 可驗證證據）。只有客觀題（MC）才持久化；
    // 其他題型無法以確定性規則評分，維持不持久化（自評顯示）。
    const isReadingRequest = String(languageSkill ?? '').trim().toLowerCase() === 'reading';
    if (isReadingRequest && questionType === 'mc' && questionsWithIds.length > 0) {
      try {
        const ids = await persistGeneratedReadingQuestions(
          questionsWithIds.map((q, i) => ({
            questionType: 'mcq',
            dseType: 'multiple_choice',
            questionText: q.prompt,
            choices: q.choices ?? null,
            answer: q.answer,
            marks: 1,
            orderIndex: i,
          })),
        );
        questionsWithIds = questionsWithIds.map((q, i) => ({ ...q, id: ids[i] }));
      } catch (err) {
        logger.error({ module: 'generate-questions', error: err instanceof Error ? err.message : String(err) }, 'Reading question persistence failed');
        throw new Error('閱讀題目伺服器持久化失敗，請重試 / Server persistence of reading questions failed. Please retry.');
      }
    }

    // 2026-09-21 ADR-045：聆聽選擇題同樣在交付前持久化（ListeningQuestion），
    // 令提交時可用伺服器答案鍵評分（listening-server-exact-match → 可驗證證據），
    // 練習因而計入準確率、技能掌握度與錯題本。
    //
    // 只持久化「答案在對話中逐字出現」的 MC：
    //   1. 沒有逐字依據的題目無法確定性評分（需要語意判斷）→ 不交付，
    //      避免學生收到無法公平批改的題目。
    //   2. 同一批交付的聆聽題必須**全部**有伺服器 id，否則提交時
    //      `resolveSubmissionAuthorityClass()` 會因部分解析而回退 legacy，
    //      令整場練習仍然不計分（那就是本修正要消除的症狀）。
    //   3. 全部被丟棄 → 結構化 422（可重試），不交付無解答的題目。
    const isListeningRequest = String(languageSkill ?? '').trim().toLowerCase() === 'listening';
    if (isListeningRequest && questionsWithIds.length > 0) {
      const deliverable = questionsWithIds.filter(q => isDeliverableListeningMc(q));
      const droppedCount = questionsWithIds.length - deliverable.length;
      if (droppedCount > 0) {
        logger.warn({ module: 'generate-questions', droppedCount, keptCount: deliverable.length }, 'Dropped listening questions whose answer is not verbatim in the dialogue');
      }
      if (deliverable.length === 0) {
        return NextResponse.json({
          error: '系統未能生成可公平批改的聆聽題目（答案未在對話中出現）。請再試一次。 / Could not generate fairly gradable listening questions (the answer was not stated in the dialogue). Please try again.',
          code: 'LISTENING_QUESTIONS_NOT_DELIVERABLE',
          recoverable: true,
        }, { status: 422 });
      }
      try {
        const ids = await persistGeneratedListeningQuestions(
          deliverable.map((q, i) => ({
            questionType: 'mc',
            listeningType: null,
            questionText: q.prompt,
            choices: q.choices ?? null,
            answer: q.answer,
            marks: 1,
            orderIndex: i,
            dialogue: q.listeningContent ?? null,
            dialogueZh: q.listeningContentZh ?? null,
            provenance: 'ai-generated',
          })),
        );
        questionsWithIds = deliverable.map((q, i) => ({ ...q, id: ids[i] }));
      } catch (err) {
        logger.error({ module: 'generate-questions', error: err instanceof Error ? err.message : String(err) }, 'Listening question persistence failed');
        throw new Error('聆聽題目伺服器持久化失敗，請重試 / Server persistence of listening questions failed. Please retry.');
      }
    }

    return NextResponse.json({
      questions: questionsWithIds,
      _meta: {
        provider: getLastAIProvider(),
        count: questions.length,
        ...(wasFallbackUsed() ? { warning: 'DeepSeek 暫時無法使用，已自動切換至備用 AI，生成品質可能略有差異。 / DeepSeek is temporarily unavailable; switched to a fallback AI provider. Quality may differ.' } : {}),
      },
    }, {
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  } catch (err: unknown) {
    // R3.10-L: validation errors are thrown as NextResponse (400) — return
    // them so clients see the real status instead of a masked 500.
    // (Re-throwing here yields an empty 500 in this Next.js version.)
    if (err instanceof NextResponse) return err;
    if (isBudgetExceededError(err)) {
      return NextResponse.json({ error: `AI 生成失敗：${err.message}` }, { status: 503 });
    }
    let message: string;
    if (err instanceof Error) {
      message = err.message;
    } else if (err && typeof err === 'object' && 'status' in err && 'statusText' in err) {
      // Handle fetch Response objects thrown as exceptions
      const r = err as Response;
      message = `HTTP ${r.status} ${r.statusText}`;
      try { const body = await r.text(); message += ` — ${body.slice(0, 200)}`; } catch { logger.warn({ module: 'generate-questions' }, 'Failed to read error response body'); }
    } else {
      message = String(err);
    }
    logger.error({ module: 'generate-questions', error: message, deepseekConfigured: isDeepSeekConfigured(), stack: err instanceof Error ? (err.stack || '').slice(0, 500) : undefined }, 'AI generation failed');
    return NextResponse.json({
      error: `AI 生成失敗：${message}`,
      _diagnostic: {
        provider: getLastAIProvider(),
        deepseekConfigured: isDeepSeekConfigured(),
        revision: process.env.K_REVISION || 'unknown',
      },
    }, {
      status: 500,
      headers: { 'X-AI-Provider': getLastAIProvider() },
    });
  }
}


