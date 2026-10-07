// ============================================
// 練習場次的題目身分與前進規則（單一 owner）
//
// 2026-10-07 事故（學生回報「作答後，題目重複出現」）：
// 練習 runner（/student/practice/[id]）以**題目 id 推導 URL** 前進，而
// `handleNext()` 會在 `router.push()` 之後**立刻清空本機作答狀態**。只要
// 推入的 id 與當前題目相同（題庫／產出重複的 id，或任何令導覽不成立的情況），
// 導覽不會發生、狀態卻已被清空 → 學生剛答完的題目會以**未作答**的樣子再次出現，
// 且因為答案鍵與作答紀錄都以題目 id 為鍵，同一題被重複交付時永遠無法分別計分。
//
// 因此場次題目必須滿足兩項不變式（本模組為唯一實作）：
//   1. 同一場次內不得有兩個**相同 id** 的題目（否則 runner 的「下一題」會原地不動）。
//   2. 同一場次內不得有兩個**相同內容**的題目（洗牌後的同一題內容相同、
//      但 id 不同 → 作答狀態無法沿用，學生會看到「同一題再出現」）。
// 兩者都在建立場次時去除（保留第一筆），並回報被丟棄的數量供觀測。
//
// 保留第一筆（而非改寫 id）是刻意的：伺服器賦予的正典 id 是評分權威
// （`practice-authority-resolution` / `usedServerScoring`），不得改寫；
// 而重複的那一筆本來就無法獨立計分（紀錄以 id 為鍵）。
// ============================================

import type { PracticeQuestion } from '@/shared/types/types';

/** 移除選項文字開頭的字母／數字／True-False 前置（與 UI 的 `stripMcqPrefix` 同義） */
function stripChoicePrefix(choice: string): string {
  return choice
    .trim()
    .replace(/^\s*\(?\s*(?:[A-Da-d]\s*[\).:：\-、]\s*|(?:True|False)\s*[\).:：\-、]\s*)\s*/iu, '')
    .trim();
}

function normalizeText(text: string | undefined | null): string {
  return (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * 題目內容指紋（供場次內去重）。
 *
 * 刻意**對選項次序不敏感**：生成流程會 `shuffleMCAnswers()` 洗牌後才交付，
 * 同一題內容可能以不同次序出現；此時「同一題」的判斷必須只看內容集合。
 * 這是純字串運算（不使用 crypto），保證 client / server 兩側結果一致且可同步執行。
 */
export function questionContentKey(question: PracticeQuestion): string {
  const choices = (question.choices ?? [])
    .map(choice => normalizeText(stripChoicePrefix(choice)))
    .filter(choice => choice.length > 0)
    .sort();
  return [
    normalizeText(question.type),
    normalizeText(question.prompt),
    choices.join('|'),
  ].join('::');
}

export interface DedupeSessionQuestionsResult {
  /** 去重後（保序）的題目；至少保留第一筆 */
  questions: PracticeQuestion[];
  /** 被丟棄的重複題目（含原因）— 供呼叫端記錄／回報，永不靜默 */
  dropped: Array<{ id: string; reason: 'duplicate-id' | 'duplicate-content' }>;
}

/**
 * 去除場次內重複的題目：同一 id 或同一內容者只保留**第一筆**。
 *
 * 呼叫端（`/student/practice` 建立場次）必須使用回傳值建立 session，
 * `totalQuestions` 亦須以回傳長度為準，否則進度分母會與實際題數不符。
 */
export function dedupeSessionQuestions(
  questions: readonly PracticeQuestion[],
): DedupeSessionQuestionsResult {
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  const kept: PracticeQuestion[] = [];
  const dropped: DedupeSessionQuestionsResult['dropped'] = [];

  for (const question of questions) {
    if (seenIds.has(question.id)) {
      dropped.push({ id: question.id, reason: 'duplicate-id' });
      continue;
    }
    const contentKey = questionContentKey(question);
    if (seenContent.has(contentKey)) {
      dropped.push({ id: question.id, reason: 'duplicate-content' });
      continue;
    }
    seenIds.add(question.id);
    seenContent.add(contentKey);
    kept.push(question);
  }

  return { questions: kept, dropped };
}

/**
 * 目前的題目之後，下一個**可以前進**的題目索引。
 *
 * 規則：跳過所有 id 與當前題目相同的項目（否則 `router.push()` 會指向當前 URL，
 * 形成「原地不動但狀態被清空」的陷阱）。`hasAnswered` 可再跳過本次場次中
 * **已經作答**的題目（例如重複內容以不同 id 交付時），避免把已作答題目
 * 當成新題重新要求作答。
 *
 * 回傳 `-1` 表示後面已無可前進的題目 → 呼叫端應視為「完成本次練習」，
 * 學生因此永遠不會被困在同一題。
 */
export function findNextSessionQuestionIndex(
  questions: readonly PracticeQuestion[],
  currentIndex: number,
  hasAnswered?: (questionId: string) => boolean,
): number {
  if (currentIndex < 0) return -1;
  const currentId = questions[currentIndex]?.id;
  for (let i = currentIndex + 1; i < questions.length; i++) {
    const candidate = questions[i];
    if (!candidate) continue;
    if (candidate.id === currentId) continue;
    if (hasAnswered?.(candidate.id)) continue;
    return i;
  }
  return -1;
}
