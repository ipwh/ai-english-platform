import {
  verifyGeneratedAnswers,
  type AnswerVerificationDrop,
  type AnswerVerificationOptions,
} from '@/modules/ai/services/answer-verification';
import type { GeneratedQuestion } from '@/modules/ai/types/generation-types';

export interface ReadingDeliveryQuestion {
  type?: unknown;
  dseType?: unknown;
  question?: unknown;
  questionZh?: unknown;
  choices?: unknown;
  answer?: unknown;
  explanationZh?: unknown;
  explanationEn?: unknown;
  [key: string]: unknown;
}

export interface ReadingAnswerVerificationResult {
  kept: ReadingDeliveryQuestion[];
  dropped: AnswerVerificationDrop[];
  verifierUnavailable: boolean;
}

function stripChoicePrefix(value: string): string {
  return value.replace(/^\s*[A-D][).:\-、]\s*/i, '').trim();
}

/** Convert a persisted reading key to the option letter expected by the blind verifier. */
function resolveOptionLetter(answer: string, choices: string[]): string {
  const trimmed = answer.trim();
  if (/^[A-D]$/i.test(trimmed)) return trimmed.toUpperCase();

  const normalized = stripChoicePrefix(trimmed).toLowerCase();
  const index = choices.findIndex(choice => stripChoicePrefix(choice).toLowerCase() === normalized);
  return index >= 0 ? String.fromCharCode(65 + index) : trimmed;
}

/**
 * 題型 → 覆核嚴格度（2026-09-21 稽核修正）。
 *
 * 舊碼只覆核 `type==='mc'`、`summary_cloze`、`sentence_transformation` 及
 * 「答案含逗號的排序題」，令 reference / inference / vocabulary_in_context /
 * short_answer / tone_attitude（無選項而退化為短答）的 AI 答案鍵**從未**
 * blind-solve —— 但這些題目同樣以答案鍵評分（確定性或 AI 語意），
 * 錯誤的鍵會產生錯誤判決與回饋。
 *
 * 分類：
 * - `deterministic`：伺服器以字串／規則比對答案鍵（MC、TFNG、summary cloze、
 *   sentence transformation、排序）→ 沿用嚴格相等，不符即丟。
 * - `semantic`：答案鍵只是參考答案，由 AI 語意評分 → 容許內容詞重疊
 *   （`verificationAnswerMatch: 'overlap'`），只攔截完全錯誤的鍵。
 */
type VerificationClass = 'deterministic' | 'semantic';

/** 由 AI 語意評分（`requiresApiEvaluation` 為 true）的短答題型 */
const SEMANTIC_DSE_TYPES = new Set<string>([
  'reference',
  'inference',
  'vocabulary_in_context',
  'tone_attitude',
  'short_answer',
]);

/**
 * 以答案鍵評分的題型（＝一律要 blind-solve）。
 * 刻意使用**明確清單**而非「任何 dseType」：未知／未來新增的題型
 * 維持不覆核（fail-safe），不會突然被嚴格相等規則大量丟棄。
 */
const KEY_GRADED_DSE_TYPES = new Set<string>([
  'multiple_choice',
  'true_false_not_given',
  'summary_cloze',
  'sentence_transformation',
  ...SEMANTIC_DSE_TYPES,
]);

function isObjectivelyScored(question: ReadingDeliveryQuestion): boolean {
  if (question.type === 'mc') return true;
  if (typeof question.dseType === 'string' && KEY_GRADED_DSE_TYPES.has(question.dseType)) return true;
  // 排序題（answer 為逗號分隔序列、題幹含 order/arrange/sequence）
  return typeof question.question === 'string'
    && typeof question.answer === 'string'
    && question.answer.includes(',')
    && /\b(order|arrange|sequence)\b/i.test(question.question);
}

/** 決定覆核嚴格度；無法判定者採較保守的嚴格相等。 */
function verificationClassOf(question: ReadingDeliveryQuestion): VerificationClass {
  if (question.type === 'mc') return 'deterministic';
  const dseType = typeof question.dseType === 'string' ? question.dseType : '';
  if (dseType === 'summary_cloze' || dseType === 'sentence_transformation') return 'deterministic';
  if (SEMANTIC_DSE_TYPES.has(dseType)) return 'semantic';
  return 'deterministic';
}

/**
 * Applies the canonical answer gate to delivery-time reading objective items.
 * The original question objects and answer formats are preserved for
 * server-authoritative reading scoring; only MCQs receive a normalized option
 * letter, while cloze and transformation items are blind-solved as text.
 */
export async function verifyReadingQuestionsForDelivery(
  questions: ReadingDeliveryQuestion[],
  readingContent: string,
  options: AnswerVerificationOptions = {},
): Promise<ReadingAnswerVerificationResult> {
  const candidates = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => isObjectivelyScored(question));

  if (candidates.length === 0) {
    return { kept: questions, dropped: [], verifierUnavailable: false };
  }

  const generated = candidates.map(({ question }): GeneratedQuestion => {
    const choices = Array.isArray(question.choices) ? question.choices.map(String) : [];
    const answer = resolveOptionLetter(String(question.answer ?? ''), choices);
    const isMcq = question.type === 'mc';
    return {
      type: isMcq ? 'mc' : 'fill-blank',
      prompt: String(question.question ?? ''),
      promptZh: typeof question.questionZh === 'string' ? question.questionZh : undefined,
      choices,
      answer: isMcq ? answer : String(question.answer ?? ''),
      explanationZh: typeof question.explanationZh === 'string' ? question.explanationZh : '',
      explanationEn: typeof question.explanationEn === 'string' ? question.explanationEn : '',
      commonMistake: '',
      readingContent,
      verificationExpectedChoiceCount: isMcq && question.dseType === 'true_false_not_given' ? 3 : 4,
      // 2026-09-21：AI 語意評分的短答題採寬鬆（內容詞重疊）比對；
      // 確定性題型（MC／cloze／改錯／排序）維持嚴格相等。
      verificationAnswerMatch: isMcq ? 'exact' : verificationClassOf(question) === 'semantic' ? 'overlap' : 'exact',
    };
  });

  const verified = await verifyGeneratedAnswers(generated, options);
  const keptCandidateIndexes = new Set(
    verified.kept.map(question => generated.indexOf(question)),
  );
  const droppedOriginalIndexes = new Set(
    candidates
      .filter((_, candidateIndex) => !keptCandidateIndexes.has(candidateIndex))
      .map(({ index }) => index),
  );

  return {
    kept: questions.filter((_, index) => !droppedOriginalIndexes.has(index)),
    dropped: verified.dropped.map(drop => ({
      ...drop,
      index: (candidates[drop.index - 1]?.index ?? drop.index - 1) + 1,
    })),
    verifierUnavailable: verified.verifierUnavailable,
  };
}