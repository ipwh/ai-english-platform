// ============================================
// 題目 XP 身分解析（伺服器權威）— 難度（2026-09-28）＋ 內容指紋（2026-10-01）
// ============================================
// 病根一（2026-09-28）：`POST /api/gamification` 從前直接採信客戶端
// `event.difficulty`，只要送 `difficulty: 'challenge'` 即可取得 1.5× XP。
//
// 病根二（2026-10-01 稽核）：`answerCorrect` 的去重鍵原本只用 `questionId`，
// 而每次重新生成都會以 `randomUUID()` 產生**新 id** → 同一題內容可重複領取
// XP（DB 實測：同一內容以 7 個不同 id 各領一次）；此外任意非空字串都能被
// 當成 questionId（無需真實存在）→ 可腳本刷分。
// 現在：answer 事件必須解析到**正典題目**（GrammarQuestion / ReadingQuestion /
// ListeningQuestion），並以伺服器計算的**內容指紋**作去重鍵 —— 與選項洗牌、
// 與重新生成的新 id 皆無關。解析不到 ⇒ 呼叫端拒絕（fail-closed）。
//
// 已知限制（誠實記錄）：只有 `GrammarQuestion` 有 `difficulty` 欄位；
// Reading／Listening 一律 `core` —— 寧可少給，不可讓客戶端自行放大。
// ============================================

import { createHash } from 'node:crypto';
import { resolveGrammarQuestionDefinitions } from './grammar-question-service';
import { resolveReadingQuestionDefinitions } from '@/modules/reading/services/reading-question-service';
import { resolveListeningQuestionDefinitions } from '@/modules/listening/services/listening-question-service';

export type PracticeDifficulty = 'remedial' | 'core' | 'challenge';

/** 將任意字串正規化為已知難度（未知 ⇒ `core`）。 */
export function normalizePracticeDifficulty(value: unknown): PracticeDifficulty {
  return normalizeDifficulty(value) ?? 'core';
}

function normalizeDifficulty(value: unknown): PracticeDifficulty | null {
  return value === 'remedial' || value === 'core' || value === 'challenge' ? value : null;
}

export interface AnswerXpIdentity {
  questionId: string;
  /** 正典難度（只有 GrammarQuestion 有；Reading／Listening 一律 `core`） */
  difficulty: PracticeDifficulty;
  /** 內容指紋（sha256 十六進位；同一內容跨 id／跨選項洗牌皆相同） */
  contentKey: string;
}

const normalizeSegment = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * 由選項與答案鍵取出「正確選項文字」。
 * 選項洗牌只會改變選項順序與答案字母 —— 指紋必須對洗牌穩定，
 * 因此優先取正確選項的**文字**；取不到時（非字母答案／選項缺失）回退原始答案。
 */
function resolveCorrectOptionText(answer: string, choices: string[] | null): string {
  const trimmed = String(answer ?? '').trim();
  const stripPrefix = (value: string) => value.replace(/^\s*[A-Da-d][).:\-]\s*/, '').trim();
  if (choices && choices.length > 0) {
    if (/^[A-Da-d]$/.test(trimmed)) {
      const index = trimmed.toUpperCase().charCodeAt(0) - 65;
      const option = choices[index];
      if (typeof option === 'string' && stripPrefix(option)) return stripPrefix(option);
    }
    const target = stripPrefix(trimmed).toLowerCase();
    if (target) {
      for (const option of choices) {
        if (typeof option === 'string' && stripPrefix(option).toLowerCase() === target) {
          return stripPrefix(option);
        }
      }
    }
  }
  return stripPrefix(trimmed) || trimmed;
}

function fingerprint(family: string, parts: Array<string | null | undefined>): string {
  const canonical = [family, ...parts.map(part => normalizeSegment(part))].join('\u0001');
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * 解析 answer 事件的正典身分（難度 ＋ 內容指紋）。
 *
 * 回傳 `null` ⇔ 題目不存在於任何正典題庫（呼叫端必須拒絕發 XP ——
 * 任意字串不得當 questionId）。查詢失敗**往上拋**（故障 ≠ 查無此題）。
 */
export async function resolveAnswerXpIdentity(questionId: string): Promise<AnswerXpIdentity | null> {
  const id = String(questionId ?? '').trim();
  if (!id) return null;

  const [grammarResult, readingResult, listeningResult] = await Promise.allSettled([
    resolveGrammarQuestionDefinitions([id]),
    resolveReadingQuestionDefinitions([id]),
    resolveListeningQuestionDefinitions([id]),
  ]);
  if (grammarResult.status === 'rejected') throw grammarResult.reason;
  if (readingResult.status === 'rejected') throw readingResult.reason;
  if (listeningResult.status === 'rejected') throw listeningResult.reason;

  const grammar = grammarResult.value.get(id);
  if (grammar) {
    const choices = grammar.choices ?? null;
    return {
      questionId: id,
      difficulty: normalizeDifficulty(grammar.difficulty) ?? 'core',
      contentKey: fingerprint('grammar', [
        grammar.questionType,
        grammar.prompt,
        choices ? [...choices].map(c => normalizeSegment(c)).sort().join(' | ') : '',
        resolveCorrectOptionText(grammar.answer, choices),
      ]),
    };
  }

  const reading = readingResult.value.get(id);
  if (reading) {
    const choices = reading.choices ?? null;
    return {
      questionId: id,
      difficulty: 'core',
      contentKey: fingerprint('reading', [
        reading.questionType,
        reading.questionText,
        choices ? [...choices].map(c => normalizeSegment(c)).sort().join(' | ') : '',
        resolveCorrectOptionText(reading.answer, choices),
      ]),
    };
  }

  const listening = listeningResult.value.get(id);
  if (listening) {
    const choices = listening.choices ?? null;
    return {
      questionId: id,
      difficulty: 'core',
      contentKey: fingerprint('listening', [
        listening.questionType,
        listening.questionText,
        listening.dialogue ?? '',
        choices ? [...choices].map(c => normalizeSegment(c)).sort().join(' | ') : '',
        resolveCorrectOptionText(listening.answer, choices),
      ]),
    };
  }

  return null;
}
