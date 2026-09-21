// ============================================
// 2026-09-21 ADR-045: Server-authoritative listening answer scoring
// ============================================
// 聆聽評分的唯一權威（與 reading-answer-scoring 同一契約）：
// - 每個 questionId 必須能解析到伺服器持有的 ListeningQuestion 定義；
//   解析不到（含歷史 `ai-*` 本機 id）→ 整份 NOT_PROJECTABLE。
// - 確定性題型（MC / fill-blank）以**伺服器答案鍵**評分；
//   客戶端送來的 correctAnswer / isCorrect / awardedScore 一律忽略。
// - 評分規則本身**不重寫第二套**：委派正典 `scorePracticeAnswer()`
//   （字母比對、全選項文字比對、文字正規化）後按定義的 marks 換算。
// - maxScore 一律取自正典定義的 marks；marks 無效 → NOT_PROJECTABLE。
// - 輸出依伺服器 orderIndex 排序（永不依客戶端陣列順序）。
//
// 為何不支援開放式題型：筆記／自由作答沒有單一答案鍵，由字串比對產生的
// verdict 是偽造的判決 → 本服務不接受（該類題目不持久化，維持自評）。
// ============================================

import { scorePracticeAnswer } from '@/modules/exercise/services/practice-answer-scorer';
import {
  resolveListeningQuestionDefinitions,
  type ListeningQuestionDefinition,
} from './listening-question-service';

/** Raw answer row accepted from the client. Scoring fields are ignored. */
export interface ListeningAnswerSubmission {
  questionIndex: number;
  questionId?: string;
  studentAnswer?: string;
  /** Client-supplied fields — ALL IGNORED (server is the only authority) */
  correctAnswer?: string;
  questionPrompt?: string;
  questionType?: string;
  isCorrect?: boolean;
  result?: string;
  awardedScore?: number;
  maxScore?: number;
  countsTowardScore?: boolean;
  timeSpent?: number;
}

export interface ScoredListeningAnswer {
  questionIndex: number;
  questionId: string;
  questionType: string;
  questionPrompt: string;
  correctAnswer: string;
  studentAnswer: string;
  isCorrect: boolean;
  result: 'correct' | 'incorrect' | 'partial' | 'ungradable';
  awardedScore: number;
  maxScore: number;
  countsTowardScore: boolean;
  timeSpent: number | null;
  scoredBy: 'server';
  scoringMethod: string;
}

export type ListeningScoringResult =
  | { ok: true; answers: ScoredListeningAnswer[] }
  | { ok: false; error: string };

/** 伺服器答案鍵評分的方法標記（必須列入 practice-evidence 白名單） */
export const LISTENING_SERVER_SCORING_METHOD = 'listening-server-exact-match';

function toRows(answers: unknown): ListeningAnswerSubmission[] {
  if (!Array.isArray(answers)) return [];
  return answers.filter((a): a is ListeningAnswerSubmission => !!a && typeof a === 'object');
}

function hasValidMarks(def: ListeningQuestionDefinition): boolean {
  return Number.isFinite(def.marks) && def.marks > 0;
}

/**
 * Score a listening submission end-to-end against server-owned definitions.
 * Never throws: returns `{ ok: false }` for anything that cannot be scored
 * fairly (so no fabricated verdict is ever persisted).
 */
export async function scoreListeningAnswers(answers: unknown): Promise<ListeningScoringResult> {
  const rows = toRows(answers);
  if (rows.length === 0) {
    return { ok: false, error: '聽力答案為空，無法評分' };
  }

  const ids = rows
    .map(r => (typeof r.questionId === 'string' ? r.questionId.trim() : ''))
    .filter(id => id.length > 0);
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) {
    return { ok: false, error: '聽力題目缺少伺服器題目 id（無法對應正典答案鍵）' };
  }

  const definitions = await resolveListeningQuestionDefinitions(uniqueIds);

  const scored: ScoredListeningAnswer[] = [];
  for (const row of rows) {
    const id = typeof row.questionId === 'string' ? row.questionId.trim() : '';
    const def = id ? definitions.get(id) : undefined;
    if (!def) {
      return { ok: false, error: `聽力題目無法對應正典定義（${id || '缺少 id'}）— NOT_PROJECTABLE` };
    }
    if (!hasValidMarks(def)) {
      return { ok: false, error: `聽力題目 marks 無效（${def.marks}）— NOT_PROJECTABLE` };
    }
    if (def.questionType !== 'mc' && def.questionType !== 'fill-blank') {
      return { ok: false, error: `聽力題型 ${def.questionType} 沒有確定的答案鍵，不得由伺服器計分 — NOT_PROJECTABLE` };
    }

    const studentAnswer = typeof row.studentAnswer === 'string' ? row.studentAnswer : '';
    const verdict = scorePracticeAnswer({
      studentAnswer,
      correctAnswer: def.answer,
      questionType: def.questionType,
      choices: def.choices ?? undefined,
    });

    const awardedScore = verdict.result === 'correct' ? def.marks : 0;

    scored.push({
      questionIndex: typeof row.questionIndex === 'number' ? row.questionIndex : scored.length,
      questionId: def.id,
      questionType: def.questionType,
      questionPrompt: def.questionText,
      correctAnswer: def.answer,
      studentAnswer,
      isCorrect: verdict.result === 'correct',
      result: verdict.result,
      awardedScore,
      maxScore: def.marks,
      countsTowardScore: verdict.countsTowardScore,
      timeSpent: typeof row.timeSpent === 'number' ? row.timeSpent : null,
      scoredBy: 'server',
      scoringMethod: LISTENING_SERVER_SCORING_METHOD,
    });
  }

  // 伺服器決定順序（依定義 orderIndex），永不依客戶端陣列順序
  const orderById = new Map(
    Array.from(definitions.values()).map(def => [def.id, def.orderIndex] as const),
  );
  scored.sort((a, b) => (orderById.get(a.questionId) ?? 0) - (orderById.get(b.questionId) ?? 0));

  return { ok: true, answers: scored };
}

/** Session aggregates derived from scored rows (marked rows only). */
export function computeListeningAggregates(answers: ScoredListeningAnswer[]): {
  totalQuestions: number;
  correctCount: number;
} {
  const counted = answers.filter(a => a.countsTowardScore);
  return {
    totalQuestions: counted.length,
    correctCount: counted.filter(a => a.result === 'correct').length,
  };
}
