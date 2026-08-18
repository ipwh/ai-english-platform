// Sprint 102.5: AI-Powered Short Answer Evaluator
// Uses callLLM for true semantic understanding of student answers.
// Replaces the rule-based keyword matcher with genuine HKDSE-examiner-style grading.

import { callLLM } from './llm-call';
import { parseAIJSON } from './json-utils';
import { logger } from '@/shared/logger/logger';

export interface AIEvaluationResult {
  score: number;
  maxScore: number;
  isCorrect: boolean;
  isPartiallyCorrect: boolean;
  feedbackZh: string;
  feedbackEn: string;
  /**
   * Provenance of the verdict.
   * - 'ai': scored by the LLM semantic evaluator (trusted evidence).
   * - 'rule-based': LLM failed and a keyword-overlap heuristic produced this
   *   result. Callers that persist scoring evidence MUST treat this as
   *   unavailable — never as AI-scored ground truth (R3.10-L).
   */
  evaluationMethod: 'ai' | 'rule-based';
}

/**
 * Evaluate a short-answer response using AI semantic understanding.
 * Accepts synonyms, paraphrases, passive/active voice, different grammar.
 * Marks generously like a real HKDSE examiner.
 */
export async function evaluateWithAI(
  studentAnswer: string,
  correctAnswer: string,
  questionText: string,
  marks: number,
  passageContext?: string,
): Promise<AIEvaluationResult> {
  if (!studentAnswer || !studentAnswer.trim()) {
    return {
      score: 0, maxScore: marks, isCorrect: false, isPartiallyCorrect: false,
      feedbackZh: '❌ 未作答。',
      feedbackEn: '❌ No answer provided.',
      // Blank answers are deterministically zero — no LLM needed, and a
      // zero is the only defensible score (an examiner would award 0 too).
      evaluationMethod: 'ai',
    };
  }

  const contextInfo = passageContext
    ? `\n\n相關文章段落：\n"""\n${passageContext.slice(0, 500)}\n"""` : '';

  const prompt = `你是香港 DSE English Paper 1 閱讀理解評卷員。請根據以下標準評估學生答案：

題目：${questionText}
參考答案：${correctAnswer}
滿分：${marks} 分${contextInfo}

學生答案："""${studentAnswer}"""

評分原則（HKDSE 標準）：
- 接受同義詞、改寫、被動/主動語態轉換、不同文法結構
- 只要語意正確就給分，不扣 wording/grammar 分數
- 多餘資訊不扣分（除非改變了正確含義）
- 部分正確給半分
- 評分時寧可給分，標準與真實 HKDSE 評卷員一致

請以純 JSON 回覆：
{
  "score": 數字 (0-${marks}),
  "maxScore": ${marks},
  "isCorrect": true/false,
  "isPartiallyCorrect": true/false,
  "feedbackZh": "繁體中文評語，50字內，指出對在哪裡或錯在哪裡",
  "feedbackEn": "English feedback, 50 words max"
}`;

  try {
    const result = await callLLM(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, maxTokens: 512, jsonMode: true, timeoutMs: 8000 },
    );
    const parsed = parseAIJSON<AIEvaluationResult>(result);
    return { ...parsed, evaluationMethod: 'ai' as const };
  } catch (err) {
    logger.warn({ module: 'semantic-eval', error: (err as Error).message }, 'AI evaluation failed, falling back to rule-based');
    // Rule-based fallback is honest about its provenance: scoring-evidence
    // consumers must check evaluationMethod and refuse to persist it as
    // trusted AI evidence (R3.10-L).
    return { ...fallbackEvaluate(studentAnswer, correctAnswer, marks), evaluationMethod: 'rule-based' as const };
  }
}

/**
 * Rule-based fallback when AI is unavailable.
 * Provenance is attached by the caller (evaluationMethod: 'rule-based').
 */
function fallbackEvaluate(
  studentAnswer: string,
  correctAnswer: string,
  marks: number,
): Omit<AIEvaluationResult, 'evaluationMethod'> {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,;:'"]+$/g, '').trim();
  const ns = norm(studentAnswer);
  const nc = norm(correctAnswer);

  if (!ns) return { score: 0, maxScore: marks, isCorrect: false, isPartiallyCorrect: false, feedbackZh: '❌ 未作答。', feedbackEn: '❌ No answer.' };
  if (ns === nc) return { score: marks, maxScore: marks, isCorrect: true, isPartiallyCorrect: false, feedbackZh: '✅ 正確！', feedbackEn: '✅ Correct!' };

  // Containment
  if (nc.includes(ns) && ns.length > 5) {
    return { score: Math.ceil(marks / 2), maxScore: marks, isCorrect: false, isPartiallyCorrect: true, feedbackZh: '⚠️ 部分正確，方向對但不完整。', feedbackEn: '⚠️ Partially correct.' };
  }
  if (ns.includes(nc) && nc.length > 3) {
    return { score: marks, maxScore: marks, isCorrect: true, isPartiallyCorrect: false, feedbackZh: '✅ 答案可接受，已涵蓋關鍵內容。', feedbackEn: '✅ Acceptable.' };
  }

  // Keyword overlap
  const cw = nc.split(' ').filter(w => w.length > 3);
  const sw = new Set(ns.split(' '));
  const overlap = cw.filter(w => sw.has(w)).length;
  const ratio = cw.length > 0 ? overlap / cw.length : 0;
  if (ratio >= 0.6) {
    return { score: ratio >= 0.8 ? marks : Math.ceil(marks * 0.7), maxScore: marks, isCorrect: ratio >= 0.8, isPartiallyCorrect: true, feedbackZh: `⚠️ 語意約 ${Math.round(ratio * 100)}% 相符。`, feedbackEn: `⚠️ ~${Math.round(ratio * 100)}% match.` };
  }
  if (ratio >= 0.4) {
    return { score: Math.ceil(marks / 2), maxScore: marks, isCorrect: false, isPartiallyCorrect: true, feedbackZh: '⚠️ 部分正確。', feedbackEn: '⚠️ Partial.' };
  }

  return { score: 0, maxScore: marks, isCorrect: false, isPartiallyCorrect: false, feedbackZh: `❌ 不正確。參考答案：${correctAnswer}`, feedbackEn: `❌ Incorrect. Expected: ${correctAnswer}` };
}
