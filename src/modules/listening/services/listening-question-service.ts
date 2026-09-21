// ============================================
// 2026-09-21 ADR-045: Listening Question Service — server-owned definitions
// ============================================
// Question-definition authority（與 ReadingQuestion 同一契約）：
// - 生成時把每題的正典定義（答案鍵、選項、題型、對話）寫入資料庫，
//   並以持久化 id 作為題目身分交給前端。
// - 歷史的即時生成題目（`ai-*` 本機 id）沒有定義 → 永遠 NOT_PROJECTABLE。
//
// 為何要存對話（dialogue）：聆聽題沒有對話就無從理解或重播，
// 錯題重溫、教師審核與日後再覆核都需要它（閱讀只存 passageTitle，
// 但聆聽比閱讀更依賴內容本身）。
// ============================================

import { randomUUID } from 'node:crypto';
import { createListeningQuestions, findListeningQuestionsByIds } from '../repositories/listening-question-repo';

export interface ListeningQuestionDefinitionInput {
  questionType: string;
  listeningType?: string | null;
  questionText: string;
  choices?: string[] | null;
  answer: string;
  marks: number;
  orderIndex: number;
  dialogue?: string | null;
  dialogueZh?: string | null;
  provenance?: string;
}

export interface ListeningQuestionDefinition {
  id: string;
  questionType: string;
  listeningType: string | null;
  questionText: string;
  choices: string[] | null;
  answer: string;
  marks: number;
  orderIndex: number;
  dialogue: string | null;
}

/**
 * 2026-09-21 ADR-045：聆聽選擇題能否交付的唯一判準（單一 owner）。
 *
 * 伺服器要用自己的答案鍵評分，前提是答案**在對話中逐字出現**
 * （出題 prompt 已要求 `Answer MUST appear verbatim in listeningContent`）。
 * 沒有逐字依據的題目（需語意判斷）不得交付 —— 否則會出現「無法公平批改」
 * 或「被判錯但其實正確」的情況。
 *
 * 比對用詞邊界（避免 "art" 命中 "start"）並容許選項前綴（A. / 1.）。
 * 只接受 MC：其他題型沒有單一答案鍵，不得持久化為可評分題目。
 */
export function isDeliverableListeningMc(question: {
  type?: unknown;
  listeningContent?: unknown;
  choices?: unknown;
  answer?: unknown;
}): boolean {
  if (question.type !== 'mc') return false;
  const dialogue = String(question.listeningContent ?? '').trim();
  if (!dialogue) return false;
  const choices = Array.isArray(question.choices) ? question.choices : [];
  if (choices.length < 2) return false;

  const key = String(question.answer ?? '').trim();
  if (!key) return false;
  let answerText = key;
  if (/^[A-Da-d]$/.test(key)) {
    const idx = key.toUpperCase().charCodeAt(0) - 65;
    if (idx < 0 || idx >= choices.length) return false;
    answerText = String(choices[idx] ?? '');
  }
  const needle = answerText.replace(/^\s*[A-Da-d][).:\-]\s*/, '').trim().toLowerCase();
  if (!needle) return false;

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(dialogue.toLowerCase());
}

/**
 * Persist generated questions and return the server-assigned canonical
 * ids in the same order as the input.
 */
export async function persistGeneratedListeningQuestions(
  questions: ListeningQuestionDefinitionInput[],
): Promise<string[]> {
  if (!questions || questions.length === 0) return [];
  const ids = questions.map(() => randomUUID());
  await createListeningQuestions(
    questions.map((q, i) => ({
      id: ids[i],
      questionType: q.questionType,
      listeningType: q.listeningType ?? null,
      questionText: q.questionText,
      choices: q.choices && q.choices.length > 0 ? JSON.stringify(q.choices) : null,
      answer: q.answer,
      marks: q.marks,
      orderIndex: q.orderIndex,
      dialogue: q.dialogue ?? null,
      dialogueZh: q.dialogueZh ?? null,
      provenance: q.provenance || 'ai-generated',
    })),
  );
  return ids;
}

/**
 * Resolve canonical definitions for a list of question ids.
 * Missing ids are simply absent from the map — callers must treat them
 * as NOT_PROJECTABLE (no reconstruction).
 */
export async function resolveListeningQuestionDefinitions(
  ids: string[],
): Promise<Map<string, ListeningQuestionDefinition>> {
  const map = new Map<string, ListeningQuestionDefinition>();
  const rows = await findListeningQuestionsByIds(ids);
  for (const r of rows) {
    let choices: string[] | null = null;
    if (r.choices) {
      try {
        const parsed = JSON.parse(r.choices) as unknown;
        if (Array.isArray(parsed)) choices = parsed.map(c => String(c));
      } catch {
        choices = null; // malformed JSON — treat as no choices
      }
    }
    map.set(r.id, {
      id: r.id,
      questionType: r.questionType,
      listeningType: r.listeningType,
      questionText: r.questionText,
      choices,
      answer: r.answer,
      marks: r.marks,
      orderIndex: r.orderIndex,
      dialogue: r.dialogue,
    });
  }
  return map;
}
