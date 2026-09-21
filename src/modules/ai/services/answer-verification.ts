// ============================================
// Answer Verification — pre-delivery gate for generated answer keys
//
// Two layers, both required before a generated question may be delivered:
//
//   Layer A (deterministic, zero cost, always on)
//     - option count / duplicate options / invalid key letter
//     - system fallback filler delivered as a real option
//     - the item's own explanation admits the item is defective
//       ("選項中沒有正確的…因此題目有誤", "no correct option", …)
//
//   Layer B (independent LLM pass, blind solve)
//     The generator's key is NEVER shown to the verifier. The verifier solves
//     each item itself, then reports `soundness`:
//       ok        → exactly one defensible option
//       ambiguous → more than one defensible answer
//       flawed    → no option is acceptable (e.g. all four are invented
//                   collocations: "update in / update up / update with /
//                   update on"), or the item is unanswerable
//     Kept only when soundness === 'ok' AND the blind answer equals the key.
//     Error-correction items are inverted: their key is the option CONTAINING
//     the mistake, so they are verified in 'option-error' mode.
//
// 2026-09-20 incident this gate exists for: a vocabulary item was delivered
// with an answer key pointing at "update up" while its own explanation said no
// option was correct. Structural validation could not catch it — the key
// resolved to a real option, and the option count was 4.
//
// Any missing verdict or unavailable verifier drops the item before delivery.
// ============================================

import { logger } from '@/shared/logger/logger';
import { executeAI } from './ai-execution';
import { normalizeAnswer, stripMcqPrefix } from './question-validator';
import {
  DEFAULT_FALLBACK_FILLERS,
  LISTENING_FALLBACK_FILLERS,
  READING_FALLBACK_FILLERS,
} from './mcq-filters';
import {
  ANSWER_VERIFICATION_SYSTEM_PROMPT,
  ANSWER_VERIFICATION_VERSION,
  buildAnswerVerificationUserPrompt,
  type AnswerVerificationPromptItem,
} from '../prompts/grammar/answer-verification';
import {
  AnswerVerificationSchema,
  type AnswerVerificationResponse,
} from '../schemas/ai-schema';
import type { GeneratedQuestion } from '../types/generation-types';

export const ANSWER_VERIFICATION_PROMPT_NAME = 'GenerateQuestionsAnswerVerification';

/**
 * 'option'       → key is the letter of the CORRECT option (MC)
 * 'option-error' → key is the letter of the option CONTAINING the error (error-correction)
 * 'text'         → fill-blank answer string
 */
type VerifyMode = 'option' | 'option-error' | 'text';

export interface AnswerVerificationDrop {
  /** 1-based position in the input array (for logs) */
  index: number;
  prompt: string;
  reasons: string[];
}

export interface GeneratedAnswerVerificationResult {
  kept: GeneratedQuestion[];
  dropped: AnswerVerificationDrop[];
  /** true when the independent verifier could not be reached (degraded run) */
  verifierUnavailable: boolean;
  /** number of items actually blind-solved by the verifier */
  verifiedCount: number;
}

/** Injected in tests; defaults to the LLM verifier. */
export type AnswerVerifier = (
  items: AnswerVerificationPromptItem[],
) => Promise<AnswerVerificationResponse | null>;

export interface AnswerVerificationOptions {
  userId?: string;
  /** Injection point for tests / experiments. */
  verify?: AnswerVerifier;
}

// ============================================
// Layer A — deterministic defect detection
// ============================================

/**
 * Phrases an item may only contain when its own explanation admits the item is
 * defective — never as a legitimate explanation of a wrong distractor.
 *
 * Deliberately narrow: a correct item explaining why distractor B is wrong says
 * 「B 不是正確的片語」/「選項 C 沒有正確的詞形」/「本題易錯點……」, none of which
 * may match. Every pattern below requires the *absence of a correct option or a
 * defective item*, not a wrong distractor.
 */
const SELF_ADMITTED_DEFECT_PATTERNS: RegExp[] = [
  // 選項中／答案裡「沒有正確的…」（必須有 中／裡，排除「選項 C 沒有正確的詞形」）
  /(選項|答案)[^。；\n]{0,10}(中|裡)[^。；\n]{0,6}(並無|沒有|無)[^。；\n]{0,6}正確/,
  // 四個／所有／任何選項都「沒有正確的」
  /(四個|全部|所有|任何|每個)[^。；\n]{0,6}選項[^。；\n]{0,10}(並無|沒有|無|皆不|都不|均不|全不)[^。；\n]{0,6}正確/,
  // 「沒有／並無／不存在（任何）正確的選項／答案」
  /(並無|沒有|不存在)[^。；\n]{0,6}(任何|一個)?[^。；\n]{0,3}正確的?(選項|答案)/,
  // 題目有誤／出題有誤／此題有問題
  /(題目|出題|試題|此題|本題)(本身)?(有誤|有錯|有問題)/,
  // 題目錯誤（排除「本題錯誤選項…」這類正常用法）
  /(題目|出題|試題|此題|本題)(本身)?錯誤(?!(的)?(選項|答案|用法|說法))/,
  // 答案鍵／答案欄位有誤、無法對應
  /(答案鍵|答案欄位|正確答案欄位)[^。；\n]{0,4}(有誤|有錯|無法對應)/,
  // English equivalents
  /\bno correct (answer|option|choice)\b/i,
  /\bnone of the (four |given )?(options|choices|answers)\b[^.\n]{0,30}\b(correct|right|valid)\b/i,
  /\bthe (question|item) (is|appears|seems) (to be )?(flawed|erroneous|defective|incorrect|wrong)\b/i,
  /\b(question|item) (is|contains|has) (an? )?(error|defect|flaw)\b/i,
  /\banswer key (is|appears to be|seems) (wrong|incorrect|invalid)\b/i,
];

const ALL_FALLBACK_FILLERS: readonly string[] = [
  ...LISTENING_FALLBACK_FILLERS,
  ...READING_FALLBACK_FILLERS,
  ...DEFAULT_FALLBACK_FILLERS,
];

function isFallbackFiller(choice: string): boolean {
  const norm = normalizeAnswer(choice);
  return ALL_FALLBACK_FILLERS.some((f) => normalizeAnswer(f) === norm);
}

function isOptionBased(question: GeneratedQuestion): boolean {
  if (question.type === 'mc') return true;
  return question.type === 'error-correction' && (question.choices?.length ?? 0) >= 2;
}

function expectedChoiceCount(question: GeneratedQuestion): number {
  return question.verificationExpectedChoiceCount ?? 4;
}

function verifyMode(question: GeneratedQuestion): VerifyMode | null {
  // 改錯題的答案鍵是【含有錯誤】的那個選項（其餘三個正確）→ 方向與一般 MC 相反，
  // 必須用 'option-error' 讓驗證器以正確方向判斷（見 grammar/v1.ts 改錯題規格）。
  if (question.type === 'error-correction' && (question.choices?.length ?? 0) >= 2) return 'option-error';
  if (question.type === 'error-correction') return 'text';
  if (question.type === 'mc') return 'option';
  if (question.type === 'fill-blank') return 'text';
  return null;
}

/**
 * Layer A: returns human-readable defect reasons (empty array = clean).
 * Pure and synchronous — safe to call anywhere, never calls AI.
 */
export function inspectGeneratedQuestion(question: GeneratedQuestion): string[] {
  const defects: string[] = [];
  const choices = (question.choices || []).map((c) => String(c));
  const answer = (question.answer || '').trim();

  if (!question.prompt || !question.prompt.trim()) {
    defects.push('題目陳述為空（無題目文字）');
  }
  if (!answer) {
    defects.push('答案欄位為空');
  }

  if (isOptionBased(question)) {
    const expected = expectedChoiceCount(question);
    if (choices.length !== expected) {
      defects.push(`選擇題選項數目必須為 ${expected}（實際 ${choices.length} 個）`);
    }

    const seen = new Map<string, number>();
    choices.forEach((choice, i) => {
      const norm = normalizeAnswer(stripMcqPrefix(choice));
      if (!norm) {
        defects.push(`選項 ${String.fromCharCode(65 + i)} 為空`);
        return;
      }
      const first = seen.get(norm);
      if (first !== undefined) {
        defects.push(
          `選項重複：${String.fromCharCode(65 + first)} 與 ${String.fromCharCode(65 + i)} 同為「${stripMcqPrefix(choice)}」`,
        );
      } else {
        seen.set(norm, i);
      }
      if (isFallbackFiller(choice)) {
        defects.push(
          `選項 ${String.fromCharCode(65 + i)} 是系統補位文字（非真實選項）：「${stripMcqPrefix(choice)}」`,
        );
      }
    });

    const keyIndex = answer.toUpperCase().charCodeAt(0) - 65;
    if (!/^[A-Da-d]$/.test(answer)) {
      defects.push(`答案鍵「${answer}」不是 A–D 選項字母`);
    } else if (keyIndex < 0 || keyIndex >= choices.length) {
      defects.push(`答案鍵「${answer}」指向不存在的選項`);
    }
  }

  // Self-admitted defect: the generator's own explanation is the evidence.
  const narrative = [question.explanationZh, question.explanationEn, question.commonMistake]
    .filter(Boolean)
    .join('\n');
  for (const pattern of SELF_ADMITTED_DEFECT_PATTERNS) {
    const hit = narrative.match(pattern);
    if (hit) {
      defects.push(`解說自認題目有誤：「${hit[0].trim()}」`);
      break;
    }
  }

  return defects;
}

// ============================================
// Layer B — independent blind-solve verification
// ============================================

function normalizeSoundness(raw: string | undefined): 'ok' | 'ambiguous' | 'flawed' | 'unknown' {
  const value = (raw || '').trim().toLowerCase();
  if (!value) return 'unknown';
  if (['ok', 'fine', 'valid', 'sound', 'correct', 'good', 'pass', 'acceptable'].includes(value)) return 'ok';
  if (['ambiguous', 'unclear', 'multiple', 'multiple_correct', 'several', 'vague'].includes(value)) return 'ambiguous';
  if (['flawed', 'invalid', 'invalid_all', 'error', 'errors', 'wrong', 'none', 'broken', 'incorrect', 'bad', 'defective'].includes(value)) return 'flawed';
  return 'unknown';
}

/** Resolves the verifier's blind answer to an option letter (text match first). */
function resolveBlindLetter(blind: string, choices: string[]): string | null {
  const raw = (blind || '').trim();
  if (!raw) return null;
  if (/^(none|n\/?a|no answer|no option|nil|null|無|沒有)$/i.test(raw)) return null;

  const letters = ['A', 'B', 'C', 'D'];
  const byText = choices.findIndex(
    (c) => normalizeAnswer(stripMcqPrefix(c)) === normalizeAnswer(stripMcqPrefix(raw)),
  );
  if (byText >= 0 && byText < letters.length) return letters[byText];

  const letterMatch = raw.match(/\b([A-D])\b/i);
  return letterMatch ? letterMatch[1].toUpperCase() : null;
}

async function defaultVerifier(
  items: AnswerVerificationPromptItem[],
  userId?: string,
): Promise<AnswerVerificationResponse | null> {
  const maxTokens = Math.min(4096, 400 + 200 * items.length);
  const result = await executeAI<AnswerVerificationResponse>({
    context: {
      feature: 'QuestionGeneration',
      useCase: 'VerifyAnswerKey',
      promptName: ANSWER_VERIFICATION_PROMPT_NAME,
      promptVersion: ANSWER_VERIFICATION_VERSION,
    },
    messages: [
      { role: 'system', content: ANSWER_VERIFICATION_SYSTEM_PROMPT },
      { role: 'user', content: buildAnswerVerificationUserPrompt(items) },
    ],
    options: {
      temperature: 0,
      maxTokens,
      jsonMode: true,
      // 批次一次呼叫；上限 4096 tokens 的 JSON 在 20s 內足夠（DeepSeek 實測約 200 tok/s），
      // 逾時視為「覆核器不可用」→ 依 AI_ANSWER_VERIFY_STRICT 決定降級或 fail-closed。
      timeoutMs: 20000,
      userId,
    },
    schema: AnswerVerificationSchema,
  });
  return result;
}

/**
 * Verifies a batch of normalized generated questions before delivery.
 * Never throws: verification failure degrades (logged) rather than breaking
 * practice generation.
 */
export async function verifyGeneratedAnswers(
  questions: GeneratedQuestion[],
  options: AnswerVerificationOptions = {},
): Promise<GeneratedAnswerVerificationResult> {
  const dropped: AnswerVerificationDrop[] = [];
  const cleanEntries: Array<{ question: GeneratedQuestion; sourceIndex: number }> = [];

  questions.forEach((question, i) => {
    const defects = inspectGeneratedQuestion(question);
    if (defects.length > 0) {
      dropped.push({ index: i + 1, prompt: question.prompt || '', reasons: defects });
      logger.warn(
        { module: 'answer-verification', questionIndex: i + 1, defects, prompt: (question.prompt || '').slice(0, 120) },
        'Generated question rejected by deterministic answer checks',
      );
      return;
    }
    cleanEntries.push({ question, sourceIndex: i + 1 });
  });

  const keptFromClean = (exclude?: Set<GeneratedQuestion>): GeneratedQuestion[] =>
    cleanEntries.filter((e) => !exclude?.has(e.question)).map((e) => e.question);

  // Build verifier input (answer key intentionally omitted → blind solve).
  const targets: Array<{ question: GeneratedQuestion; sourceIndex: number; verifyIndex: number; mode: VerifyMode }> = [];
  for (const entry of cleanEntries) {
    const mode = verifyMode(entry.question);
    if (!mode) continue; // short-writing etc. — nothing a solver can verify
    targets.push({ question: entry.question, sourceIndex: entry.sourceIndex, verifyIndex: targets.length + 1, mode });
  }

  if (targets.length === 0) {
    return { kept: keptFromClean(), dropped, verifierUnavailable: false, verifiedCount: 0 };
  }

  const items: AnswerVerificationPromptItem[] = targets.map(({ question, verifyIndex, mode }) => ({
    index: verifyIndex,
    mode,
    prompt: question.prompt,
    promptZh: question.promptZh,
    choices: mode === 'text' ? undefined : (question.choices || []).map((c) => stripMcqPrefix(String(c))),
    contexts: [question.readingContent, question.listeningContent].filter(Boolean) as string[],
  }));

  let response: AnswerVerificationResponse | null = null;
  try {
    response = options.verify
      ? await options.verify(items)
      : await defaultVerifier(items, options.userId);
  } catch (err) {
    logger.warn(
      { module: 'answer-verification', error: err instanceof Error ? err.message : String(err), itemCount: items.length },
      'Answer verifier call failed — answer keys were not independently confirmed',
    );
    response = null;
  }

  if (!response) {
    const rejected = new Set<GeneratedQuestion>();
    for (const target of targets) {
      rejected.add(target.question);
      dropped.push({
        index: target.sourceIndex,
        prompt: target.question.prompt,
        reasons: ['獨立答案覆核無法執行（fail-closed）'],
      });
    }
    logger.error({ module: 'answer-verification', droppedCount: targets.length }, 'Answer verifier unavailable: all unverified questions dropped');
    return { kept: keptFromClean(rejected), dropped, verifierUnavailable: true, verifiedCount: 0 };
  }

  const verdicts = new Map<number, AnswerVerificationResponse['verdicts'][number]>();
  for (const verdict of response.verdicts || []) {
    if (!verdicts.has(verdict.index)) verdicts.set(verdict.index, verdict);
  }

  const rejected = new Set<GeneratedQuestion>();
  let verifiedCount = 0;

  for (const { question, sourceIndex, verifyIndex, mode } of targets) {
    const reasons: string[] = [];
    const verdict = verdicts.get(verifyIndex);

    if (!verdict) {
      reasons.push('獨立覆核未就此題回應（無法確認答案正確）');
    } else {
      const soundness = normalizeSoundness(verdict.soundness);
      const reason = (verdict.reason || '').trim().slice(0, 160);
      if (soundness !== 'ok') {
        reasons.push(
          soundness === 'unknown'
            ? `獨立覆核判定無法解讀（soundness="${verdict.soundness}"）`
            : `獨立覆核判定題目有問題（${soundness}${reason ? `：${reason}` : ''}）`,
        );
      } else {
        const blind = (verdict.blindAnswer || '').trim();
        if (mode === 'text') {
          const keyNorm = normalizeAnswer(question.answer);
          const blindNorm = normalizeAnswer(blind);
          if (!blindNorm) {
            reasons.push('獨立覆核未提供填充答案（答案無法確認）');
          } else if (blindNorm !== keyNorm) {
            reasons.push(`獨立覆核得出不同答案（覆核「${blind}」／題目答案鍵「${question.answer}」）`);
          }
        } else {
          // 'option'（正確選項）與 'option-error'（含錯選項）皆為字母比對。
          const keyLetter = question.answer.trim().toUpperCase();
          const blindLetter = resolveBlindLetter(blind, question.choices || []);
          if (!blindLetter) {
            reasons.push(
              mode === 'option-error'
                ? `獨立覆核認為沒有選項含有錯誤（${blind || '空回答'}）`
                : `獨立覆核認為沒有選項正確（${blind || '空回答'}）`,
            );
          } else if (blindLetter !== keyLetter) {
            reasons.push(`獨立覆核得出不同答案（覆核 ${blindLetter}／題目答案鍵 ${keyLetter}）`);
          }
        }
      }
      if (reasons.length === 0) verifiedCount++;
    }

    if (reasons.length > 0) {
      rejected.add(question);
      dropped.push({ index: sourceIndex, prompt: question.prompt, reasons });
      logger.warn(
        { module: 'answer-verification', verifyIndex, reasons, prompt: question.prompt.slice(0, 120), answer: question.answer, choices: question.choices },
        'Generated question rejected by independent answer verification',
      );
    }
  }

  return { kept: keptFromClean(rejected), dropped, verifierUnavailable: false, verifiedCount };
}

/**
 * One-line summary of dropped items, appended to retry feedback and to the
 * final error message so the cause of a rejected generation is visible.
 */
export function summarizeVerificationDrops(dropped: AnswerVerificationDrop[]): string {
  return dropped
    .map((d) => `Q${d.index}: ${d.reasons.join('；')}`)
    .join(' | ');
}
