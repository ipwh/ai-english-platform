// Sprint 93: Question Generation Use Case — canonical implementation
// Physically extracted from ai-service.ts

import { callLLM } from '../services/llm-call';
import { parseAIJSON } from '../services/json-utils';
import { validateAIResponse, GeneratedQuestionsArraySchema } from '../schemas/ai-schema';
import { isDSERAGEnabled, retrievePastPaperContent, retrieveMarkingScheme, buildDSEContextPrompt, type DSESkill } from '../services/rag-service';
import { buildCompactSystemPrompt } from '../prompts/generate-questions-prompt';
import { validateDSEtopicMatch } from '../services/dse-topics';
import { selectDiverseTopic } from '../services/topic-selector';
import { normalizeGeneratedQuestions } from '../services/question-normalizer';
import { validateAndFixQuestion } from '../services/question-validator';
import { validateListeningConsistency } from '../services/listening-normalizer';
import { verifyGeneratedAnswers, summarizeVerificationDrops } from '../services/answer-verification';
import { resolveEffectiveQuestionType } from '../services/open-ended-topics';
import { logger } from '@/shared/logger/logger';
import type { GenerateQuestionsInput, GeneratedQuestion } from '../types/generation-types';

export type { GenerateQuestionsInput, GeneratedQuestion };

/**
 * 生成選項（可選）。
 *
 * `acceptQuestion`：呼叫端注入的「交付條件」（例：聆聽題的
 * `isDeliverableListeningMc` —— 答案必須逐字出現在對話中）。條件在**生成
 * 階段**逐題套用，補題迴圈因而能為不合格的題目補生新題；若只在交付層
 * （route）過濾，題數會靜靜地少掉且永遠補不回來（2026-09-25 回報）。
 */
export interface GenerateQuestionsOptions {
  acceptQuestion?: (question: GeneratedQuestion) => boolean;
}

/**
 * Fisher-Yates shuffle for MCQ choices.
 * Randomizes choice positions and updates the answer letter accordingly.
 * Ensures LLM answer-position bias (usually B/C) does not affect the student.
 */
function shuffleMCAnswers(q: GeneratedQuestion): GeneratedQuestion {
  if (!q.choices || q.choices.length < 2 || q.type !== 'mc') return q;
  if (!q.answer || !/^[A-D]$/i.test(q.answer)) return q;

  const answerIndex = q.answer.toUpperCase().charCodeAt(0) - 65; // A=0, B=1, ...
  if (answerIndex < 0 || answerIndex >= q.choices.length) return q;

  const correctText = q.choices[answerIndex];
  const choices = [...q.choices];

  // Fisher-Yates shuffle
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }

  // Find new position of correct answer
  const newIndex = choices.indexOf(correctText);
  if (newIndex === -1) return q; // safety: if text not found (shouldn't happen), keep original

  const letters = ['A', 'B', 'C', 'D'];
  return { ...q, choices, answer: letters[newIndex] || q.answer };
}

export async function generateQuestions(
  input: GenerateQuestionsInput,
  options: GenerateQuestionsOptions = {},
): Promise<GeneratedQuestion[]> {
  const count = input.count || 5;
  const skillDesc = input.grammarItemZh || input.languageSkillZh || input.grammarItem || input.languageSkill || '綜合';
  const typeDesc = input.questionType || 'mc';
  const diffMap = { remedial: '補底', core: '核心', challenge: '挑戰' };

  const isListening = input.languageSkill === 'listening';
  const isReading = input.languageSkill === 'reading';
  const isWriting = input.languageSkill === 'writing';
  const isSpeaking = input.languageSkill === 'speaking';

  // 寫作技能自動使用 short-writing 題型；開放式文法主題的填充題強制改 MC
  const effectiveQuestionType = resolveEffectiveQuestionType(typeDesc, input.grammarItem, input.languageSkill);

  // 聽力/閱讀/口語題使用較低 temperature 提高準確性
  const qTemperature = (isListening || isReading || isSpeaking) ? 0.45 : 0.7;

  // ============================================
  // DSE RAG 整合：檢索相關歷屆試題與 Marking Scheme
  // ============================================
  const skillMap: Record<string, DSESkill> = {
    reading: 'Reading',
    writing: 'Writing',
    listening: 'Listening',
    speaking: 'Speaking',
    integrated: 'Integrated',
  };
  const dseSkill: DSESkill = (input.languageSkill && skillMap[input.languageSkill]) || 'General';

  let dseContextPrompt = '';
  try {
    if (isDSERAGEnabled()) {
      logger.info({ module: 'dse-rag', dseSkill, topic: input.topic, difficulty: input.difficulty, userId: input.userId }, 'Retrieving past paper content...');

      const [pastPaperChunks, markingSchemeChunks] = await Promise.all([
        retrievePastPaperContent(dseSkill, input.topic, input.difficulty, input.gradeLevel, 3),
        retrieveMarkingScheme(dseSkill, 2),
      ]);

      dseContextPrompt = buildDSEContextPrompt(
        pastPaperChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        markingSchemeChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'generate_questions'
      );

      if (dseContextPrompt) {
        logger.info({ module: 'dse-rag', pastPaperChunks: pastPaperChunks.length, markingSchemeChunks: markingSchemeChunks.length }, 'Retrieved past paper and marking scheme chunks');
      } else {
        logger.info({ module: 'dse-rag' }, 'No relevant past papers, using pure prompt mode');
      }
    }
  } catch (err) {
    // RAG 失敗不應中斷出題流程，fallback 到純 prompt
    logger.warn({ module: 'dse-rag', error: err instanceof Error ? err.message : String(err) }, 'RAG retrieval failed, falling back to pure prompt');
    dseContextPrompt = '';
  }

  /** 每輪的題數可能不同（補題輪只補不足），題目敘述必須與該輪題數一致。 */
  const buildUserPrompt = (n: number) => `請生成 ${n} 道 ${skillDesc}（${diffMap[input.difficulty]}程度，${input.gradeLevel}）的${effectiveQuestionType === 'mc' ? '選擇題' : effectiveQuestionType === 'fill-blank' ? '填充題' : effectiveQuestionType === 'error-correction' ? '改錯題' : effectiveQuestionType === 'short-writing' ? '短文寫作題' : '練習題'}。`;

  // ============================================
  // Generation with retry — ensure question count + quality
  // ============================================
  /**
   * 2026-09-25（使用者回報「預設 5 題最後不足 5 題」）：
   * 舊碼在數量不足時**整批重新生成**，而且只回傳最後一輪的存活題目 ——
   * 答案覆核／交付條件每丟一題，交付數量就少一題，永遠補不回來。
   * 現改為「累積 + 補題」：每輪只補不足的題數，通過全部閘門的題目會累積，
   * 直到達到要求數量或用完輪數（仍不足則 best-effort 交付並記錄 warning）。
   */
  const MAX_ROUNDS = 3;
  const accepted: GeneratedQuestion[] = [];
  /** 已交付題目的 prompt 鍵（完全相同 ⇒ 重複） */
  const acceptedPromptKeys = new Set<string>();
  /** 已交付題目的內容鍵（同一段對話／篇章不得重用於兩題） */
  const acceptedContextKeys = new Set<string>();
  let lastError = '';
  /** 上一輪被答案覆核否決的原因 — 帶入補題提示，避免重犯同一種題目（例如憑空拼出的片語） */
  let verificationFeedback = '';
  /** 上一輪被交付條件否決的原因 — 同樣帶入補題提示，否則模型只會重複同一種錯 */
  let deliveryFeedback = '';

  const normText = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const promptKey = (q: GeneratedQuestion) => normText(q.prompt);
  /** 題目所依附的內容（聆聽對話／閱讀篇章）；文法題為空字串 */
  const contextKey = (q: GeneratedQuestion) =>
    normText(q.listeningContent || q.readingContent).slice(0, 200);

  /**
   * 交付條件（呼叫端注入，例：`isDeliverableListeningMc`）+ 跨輪去重。
   *
   * 必須在生成階段套用，補題輪才會為「交付時會被丟棄」的題目補生新題；
   * 只在交付層過濾的話，少掉的題數永遠補不回來（2026-09-25 回報的成因之一）。
   * 被否決的原因會寫入 `deliveryFeedback`，令補題輪知道**為何**上一批不合格
   * —— 否則補題只會盲目再生成一批同樣不合格的題目（數量追不上、品質亦無改善）。
   *
   * 去重同時比對 prompt 與所依附的內容：同一段對話／篇章即使配上不同問題，
   * 對學生而言仍是重複內容（湊數不得靠重用同一份材料）。
   */
  const acceptDeliverable = (questions: GeneratedQuestion[], label: string): GeneratedQuestion[] => {
    let kept = questions;
    if (options.acceptQuestion) {
      const before = kept.length;
      kept = kept.filter((q) => options.acceptQuestion!(q));
      const rejected = before - kept.length;
      deliveryFeedback = rejected === 0
        ? ''
        : isListening
          ? `${rejected} listening item(s) were rejected because the keyed answer does NOT appear verbatim in listeningContent (or the dialogue was too short/unusable). The correct option text must be copied EXACTLY into the dialogue (at least 2 dialogue lines per item).`
          : `${rejected} item(s) did not satisfy the caller delivery condition.`;
      if (rejected > 0) {
        logger.warn(
          { module: 'generate-questions', label, rejectedByCaller: rejected, keptCount: kept.length },
          'Questions dropped by caller delivery condition',
        );
      }
    } else {
      deliveryFeedback = '';
    }

    const seenPrompt = new Set<string>();
    const seenContext = new Set<string>();
    return kept.filter((q) => {
      const pk = promptKey(q);
      const ck = contextKey(q);
      const duplicate = !pk
        || acceptedPromptKeys.has(pk)
        || seenPrompt.has(pk)
        || (ck !== '' && (acceptedContextKeys.has(ck) || seenContext.has(ck)));
      if (duplicate) {
        logger.info(
          { module: 'generate-questions', label, prompt: (q.prompt || '').slice(0, 80) },
          'Duplicate question/content skipped during top-up',
        );
        return false;
      }
      seenPrompt.add(pk);
      if (ck) seenContext.add(ck);
      return true;
    });
  };

  /**
   * 逐輪交付前品質閘（聆聽對話一致性／閱讀內容完整性）。
   * 主路徑與 JSON 格式修復路徑**共用**，任何路徑都不得繞過。
   * 整輪不合格 ⇒ 回傳空陣列（由下一輪補題），永不交付有缺陷的題目。
   */
  const applyRoundQualityGates = (questions: GeneratedQuestion[], label: string): GeneratedQuestion[] => {
    let roundUsable = questions;

    if (isListening) {
      const check = validateListeningConsistency(roundUsable);
      if (!check.passed) {
        logger.warn({ module: 'ai-service', label, errors: check.errors, warnings: check.warnings }, 'Listening consistency issues');
        // 2026-09-25：QA 判為 error 的題目**一律**不交付 —— 舊碼只在「半數以上」
        // 不合格時才作廢整輪，令少數缺陷題（例如只有一行的「對話」）仍被交付。
        // 逐題丟棄後由補題輪補回數量；品質閘永不因湊數而放寬。
        const flagged = new Set(check.questionIndices);
        roundUsable = roundUsable.filter((_, i) => !flagged.has(i));
        if (roundUsable.length === 0) {
          lastError = check.errors.join('; ');
        }
      } else {
        logger.info({ module: 'ai-service', label }, 'Listening consistency passed');
      }
    }

    // === Reading Content Validation ===
    if (isReading) {
      const usableReading = roundUsable.filter(q => !!q.readingContent && q.readingContent.trim().length >= 50);
      if (usableReading.length < roundUsable.length) {
        logger.warn(
          { module: 'ai-service', label, readingIssueCount: roundUsable.length - usableReading.length, totalQuestions: roundUsable.length },
          'Reading questions with missing/short readingContent dropped',
        );
        if (usableReading.length === 0) {
          lastError = 'Reading questions had missing or insufficient content';
        }
        roundUsable = usableReading;
      }
    }

    return roundUsable;
  };

  /** 累積本輪可用題目（補題輪會繼續補足差額） */
  const accumulate = (questions: GeneratedQuestion[]): void => {
    for (const q of questions) {
      accepted.push(q);
      acceptedPromptKeys.add(promptKey(q));
      const ck = contextKey(q);
      if (ck) acceptedContextKeys.add(ck);
    }
  };
  
  for (let attempt = 0; attempt < MAX_ROUNDS && accepted.length < count; attempt++) {
    const deficit = count - accepted.length;
    // 首輪照原要求出題；補題輪只補不足的數量（略為多要，抵銷再次被丟棄的部分），
    // 總 token 用量因而低於舊碼「一不足就整批重生」。
    const batchSize = attempt === 0
      ? count
      : Math.min(count, deficit + Math.max(2, Math.ceil(deficit / 2)));

    // On top-up rounds: force different topic and slightly lower temperature
    const retryTopic = attempt > 0
      ? selectDiverseTopic({ userId: input.userId || 'anonymous', skill: isListening ? 'listening' : isReading ? 'reading' : isWriting ? 'writing' : isSpeaking ? 'speaking' : 'grammar', gradeLevel: input.gradeLevel })
      : undefined;
    const retryPrompt = attempt > 0
      ? `\n\n⚠️ TOP-UP INSTRUCTION: ${accepted.length} of ${count} questions have already been accepted. Generate ${batchSize} ADDITIONAL questions with COMPLETE fields, using different scenarios and topics from the accepted ones. Use topic: "${retryTopic}". Ensure every question has a valid answer that appears verbatim in the listening/reading content.\n\nDO NOT repeat the accepted questions.`
        + (verificationFeedback
          ? `\n\n⚠️ ANSWER VERIFICATION FEEDBACK (previous items were REJECTED):\n${verificationFeedback}\nRules: every MC item needs EXACTLY 4 distinct options (never generic advice text such as "Check the sentence structure carefully."); every option must be real, correctly-spelled English (no invented collocations such as "update up"); the keyed answer must be the ONLY defensible option, and every distractor must be clearly wrong — never also correct.`
          : '')
        + (deliveryFeedback
          ? `\n\n⚠️ DELIVERY-REQUIREMENT FEEDBACK (previous items were REJECTED):\n${deliveryFeedback}`
          : '')
      : '';
    
    // 每輪重建系統提示：補題輪的題數必須與題目敘述一致，否則模型會照原數量出題。
    const effectiveSystemPrompt = buildCompactSystemPrompt({ ...input, count: batchSize }, dseContextPrompt) + retryPrompt;
    const userPrompt = buildUserPrompt(batchSize);

    // `result` must be declared before the guarded block: a failing round
    // (budget/provider/timeout) has to be able to fall back to the questions
    // already accepted instead of discarding them.
    let result = '';

  const tryValidate = (rawText: string, label: string = '') => {
    const prefix = label ? `[${label}] ` : '';
    const parsed = parseGeneratedQuestions(rawText);
    logger.info({ module: 'generate-questions', parsedCount: parsed.length, parsedTypes: parsed.map(q => q.type), label }, 'Questions parsed');
    if (parsed.length === 0) {
      throw new Error(`${prefix}AI 回傳無法解析為題目陣列（原始回應前 500 字：${rawText.slice(0, 500)}）`);
    }
    const normalized = normalizeGeneratedQuestions(parsed);
    logger.info({ module: 'generate-questions', normalizedCount: normalized.length, parsedCount: parsed.length, label }, 'Questions normalized');
    if (normalized.length === 0) {
      throw new Error(`${prefix}所有題目在標準化過程中被過濾（原始題目數：${parsed.length}，範例：${JSON.stringify(parsed[0]).slice(0, 200)}）`);
    }
    const validated = validateAIResponse(GeneratedQuestionsArraySchema, normalized);
    if (!validated.success) {
      logger.error({ module: 'generate-questions', zodError: validated.error, normalizedCount: normalized.length }, 'Zod validation failed');
      throw new Error(`${prefix}${validated.error}`);
    }
    return validated.data;
  };

  try {
    logger.info({ module: 'generate-questions', attempt, systemPromptLen: effectiveSystemPrompt.length, userPromptLen: userPrompt.length, estimatedTokens: Math.ceil((effectiveSystemPrompt.length + userPrompt.length) / 4), skill: input.languageSkill, difficulty: input.difficulty }, 'Calling LLM for question generation');

    result = await callLLM(
      [
        { role: 'system', content: effectiveSystemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: attempt > 0 ? Math.max(0.3, qTemperature - 0.15) : qTemperature, maxTokens: 4096, jsonMode: true, timeoutMs: 30000, userId: input.userId }
    );

    logger.info({ module: 'generate-questions', resultLen: result.length, resultPreview: result.slice(0, 300), attempt }, 'LLM response received');

    const questions = tryValidate(result, `attempt${attempt + 1}`);
    // 後驗證：逐題一致性檢查與自動修正
    const allWarnings: string[] = [];
    const fixedQuestions: typeof questions = [];
    for (let i = 0; i < questions.length; i++) {
      const { fixed, warnings, rejected } = validateAndFixQuestion(questions[i], i + 1);
      allWarnings.push(...warnings);
      // R3.10-L: defective questions (unresolvable answer key) are DROPPED,
      // never delivered with a guessed "correct" option.
      if (rejected) {
        logger.warn({ module: 'ai-service', questionIndex: i + 1 }, 'Generated question rejected by consistency check — dropped');
        continue;
      }
      // ValidatableQuestion is a structural mirror of GeneratedQuestion —
      // the validator only copies/normalizes fields, never changes shape.
      fixedQuestions.push(fixed as unknown as (typeof questions)[number]);
    }
    if (allWarnings.length > 0) {
      logger.warn({ module: 'ai-service', warnings: allWarnings }, 'Generated questions had consistency issues (auto-fixed)');
    }

    // === 交付前答案覆核（Answer Verification Gate）===
    // 結構驗證無法察覺「四個選項全錯」的題目（2026-09-20 實例：
    // Always ___ your passwords. → update in / update up / update with /
    // update on，並由 AI 自己在解說中承認「選項中沒有正確的，因此題目有誤」）。
    // 逐題由第二次獨立 pass blind-solve；不通過即丟棄，令下方重試機制重新出題。
    const verification = await verifyGeneratedAnswers(fixedQuestions, { userId: input.userId });
    verificationFeedback = verification.dropped.length > 0
      ? summarizeVerificationDrops(verification.dropped)
      : '';
    if (verification.dropped.length > 0) {
      logger.warn({
        module: 'generate-questions',
        attempt: attempt + 1,
        droppedCount: verification.dropped.length,
        keptCount: verification.kept.length,
        reasons: verificationFeedback,
      }, 'Questions dropped by answer verification');
    }
    // 交付條件（例：聆聽題答案必須逐字出現在對話中）在生成階段就套用，
    // 令補題輪為被丟棄的題目補生新題，而不是交付一份少於要求的練習。
    const verifiedQuestions = acceptDeliverable(verification.kept, `attempt${attempt + 1}`);
    const roundUsable = applyRoundQualityGates(verifiedQuestions, `attempt${attempt + 1}`);
    accumulate(roundUsable);

    if (accepted.length < count && verification.verifierUnavailable) {
      // 覆核器不可用：之後每一輪都會被同一原因丟棄 → 立即停止補題，避免浪費 AI 額度
      logger.error({ module: 'generate-questions', attempt: attempt + 1 }, 'Answer verifier unavailable — stopping top-up rounds');
      break;
    }
  } catch (firstErr: unknown) {
    const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    // Include raw output snippet in error for debugging
    const rawSnippet = result.slice(0, 500);
    const isParseLike = /AI 回傳格式無法解析|AI 回傳資料格式異常|JSON/i.test(firstMsg) && result.length > 0;
    if (!isParseLike) {
      // 2026-09-25：補題輪失敗（額度耗盡／供應商錯誤／逾時）不得拖垮
      // **已通過全部交付前閘門**的題目。首輪失敗（accepted 為空）則往外拋，
      // 且必須**保留原始錯誤型別**（例如 BudgetExceededError → route 回 503），
      // 不得包成新的 Error（否則 `isBudgetExceededError` 的 instanceof 檢查會失效）。
      if (accepted.length > 0) {
        lastError = firstMsg;
        logger.warn(
          { module: 'generate-questions', attempt: attempt + 1, error: firstMsg, acceptedCount: accepted.length },
          'Round failed — returning the questions already accepted',
        );
        break;
      }
      const enriched = firstErr instanceof Error ? firstErr : new Error(firstMsg);
      (enriched as Error & { rawResponse?: string }).rawResponse = rawSnippet;
      throw enriched;
    }

    logger.warn({ module: 'generate-questions', attempt: attempt + 1, error: firstMsg }, 'AI output not parseable — attempting JSON format repair');
    try {
      // 第二階段：請模型只做「格式修復」，避免偶發非 JSON 輸出導致 500
      const repairSystemPrompt = `你是 JSON 格式修復器。請將輸入內容轉為有效 JSON 物件，格式為 {"questions": [...]}。
不要新增或刪除題目，只修正格式。
回覆必須是純 JSON 物件，以 { 開頭，以 } 結尾，不可包含任何其他文字。`;

      const repairUserPrompt = `請把以下內容轉成有效 JSON 物件 {"questions": [...]}，每題需包含：
type, prompt, promptZh, choices, answer, explanationZh, explanationEn, commonMistake, grammarPoint

原始內容：
${result.slice(0, 12000)}`;

      const repaired = await callLLM(
        [
          { role: 'system', content: repairSystemPrompt },
          { role: 'user', content: repairUserPrompt },
        ],
        { temperature: 0, maxTokens: 4096, jsonMode: true, timeoutMs: 15000, userId: input.userId }
      );

      const repairedQuestions = tryValidate(repaired, 'repair');
      if (repairedQuestions.length === 0) {
        throw new Error('AI 回傳格式修復後仍未產生有效題目');
      }
      // 格式修復路徑同樣必須通過答案覆核與交付條件，不得繞過交付前把關。
      const repairedVerification = await verifyGeneratedAnswers(repairedQuestions, { userId: input.userId });
      verificationFeedback = repairedVerification.dropped.length > 0
        ? summarizeVerificationDrops(repairedVerification.dropped)
        : '';
      if (repairedVerification.dropped.length > 0) {
        logger.warn({
          module: 'generate-questions',
          droppedCount: repairedVerification.dropped.length,
          reasons: verificationFeedback,
        }, 'Repaired questions dropped by answer verification');
      }
      // 修復路徑的題目同樣必須通過交付條件與逐輪品質閘 —— 與主路徑完全相同的標準，
      // 補題迴圈只增加嘗試次數，永不降低合格門檻。
      const repairedUsable = applyRoundQualityGates(
        acceptDeliverable(repairedVerification.kept, 'repair'),
        'repair',
      );
      if (repairedUsable.length === 0 && repairedVerification.kept.length === 0) {
        throw new Error(`未能生成可靠的題目（格式修復後的題目未通過答案覆核）。請重試 / Could not generate reliable questions (repaired items failed the pre-delivery answer check). Please retry. [diagnostic: ${summarizeVerificationDrops(repairedVerification.dropped).slice(0, 300)}]`);
      }
      accumulate(repairedUsable);
      if (accepted.length < count && repairedVerification.verifierUnavailable) {
        logger.error({ module: 'generate-questions' }, 'Answer verifier unavailable — stopping top-up rounds after format repair');
        break;
      }
      continue;
    } catch (repairErr: unknown) {
      if (accepted.length > 0) {
        lastError = repairErr instanceof Error ? repairErr.message : String(repairErr);
        logger.warn(
          { module: 'generate-questions', attempt: attempt + 1, error: lastError, acceptedCount: accepted.length },
          'Format repair failed — returning the questions already accepted',
        );
        break;
      }
      throw repairErr;
    }
  }
  } // end top-up loop

  if (accepted.length === 0) {
    // 學生可見訊息必須雙語且可行動；技術細節壓縮後放在 diagnostic 段
    // （route 會原樣顯示 error 字串）。
    const diagnostic = (lastError
      || (verificationFeedback ? `答案覆核未通過：${verificationFeedback}` : 'all questions rejected by quality checks'))
      .slice(0, 300);
    throw new Error(`未能生成可靠的題目（所有生成的題目都未通過交付前答案覆核）。請重試，或選擇其他文法項目 / Could not generate reliable questions this time (every generated item failed the pre-delivery answer check). Please retry, or choose another grammar item. [diagnostic: ${diagnostic}]`);
  }
  if (accepted.length < count) {
    logger.warn({ module: 'ai-service', rounds: MAX_ROUNDS, actualCount: accepted.length, expectedCount: count, lastError: lastError || undefined }, 'Returning best effort after top-up rounds');
  }

  // DSE topic validation (informational only)
  const skillForValidation: 'writing' | 'reading' | 'listening' =
    isListening ? 'listening' : isReading ? 'reading' : 'writing';
  const finalQuestions = accepted.slice(0, count);
  const topicCheck = validateDSEtopicMatch(
    finalQuestions.map(q => (q.prompt || '') + ' ' + (q.explanationEn || '')).join(' '),
    skillForValidation,
  );
  if (!topicCheck.matched) {
    logger.warn({ module: 'ai-service', dseTopicScore: topicCheck.score }, 'DSE topic match LOW');
  }

  // === Post-generation answer shuffle: ensure uniform distribution ===
  // LLMs tend to bias correct answers toward B/C. Fisher-Yates shuffle
  // randomizes choice positions and updates answer letters accordingly.
  return finalQuestions.map(q => shuffleMCAnswers(q));
}

/**
 * 穩健地解析 AI 生成的題目 JSON
 */
function parseGeneratedQuestions(raw: string): GeneratedQuestion[] {
  const parsed = parseAIJSON<GeneratedQuestion[] | { questions: GeneratedQuestion[] }>(raw);
  return Array.isArray(parsed) ? parsed : (parsed.questions || []);
}

