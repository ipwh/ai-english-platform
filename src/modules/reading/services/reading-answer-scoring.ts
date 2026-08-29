// ============================================
// R3.7: Server-authoritative reading answer scoring
// ============================================
// The ONLY authority for newly persisted reading rows.
//
// - Every questionId must resolve to a server-owned ReadingQuestion
//   definition (persisted at generation time). Unresolvable ids —
//   including historical `rd-*` ids — are rejected as NOT_PROJECTABLE.
// - Deterministic types (multiple_choice / true_false_not_given /
//   letter-keyed clozes / sequencing) are scored ON THE SERVER against
//   the canonical key. Client-supplied result/awardedScore/maxScore/
//   correctAnswer are IGNORED.
// - Subjective types are scored with AI (evaluateWithAI) against the
//   server-owned key and marks. The persisted row itself is the durable
//   binding: questionId + studentAnswer + result + scoredBy='ai' +
//   scoringMethod — the client cannot alter it before persistence.
// - R37-H03: AI semantic evaluation failure for a SUBJECTIVE question
//   is NEVER replaced by a fabricated exact-match server score. The
//   whole submission is rejected as NOT_PROJECTABLE (scoring-unavailable)
//   — no misleading scored item is persisted.
// - maxScore always comes from the canonical definition's marks.
//   If marks are invalid, the submission is NOT_PROJECTABLE.
// - R37-H08: output is ordered by the server-owned orderIndex (never by
//   client array order or DB insertion order).
// - evaluatorVersion is never invented.
// ============================================

import { evaluateWithAI } from '@/modules/ai';
import { requiresApiEvaluation } from '../evaluation';
import {
  resolveReadingQuestionDefinitions,
  type ReadingQuestionDefinition,
} from './reading-question-service';

/** Raw answer row accepted from the client. Scoring fields are ignored. */
export interface ReadingAnswerSubmission {
  questionIndex: number;
  questionId?: string;
  dseType?: string;
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

export interface ScoredReadingAnswer {
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
  scoredBy: 'server' | 'ai';
  scoringMethod: string;
}

export type ReadingScoringResult =
  | { ok: true; answers: ScoredReadingAnswer[] }
  | { ok: false; error: string };

type SubjectiveEvaluator = (
  studentAnswer: string,
  correctAnswer: string,
  questionText: string,
  marks: number,
) => Promise<{ score: number; isCorrect: boolean; isPartiallyCorrect: boolean; evaluationMethod?: 'ai' | 'rule-based' }>;

const SEQUENCING_PATTERN = /order|arrange|sequence|chronolog|sort|ranking/i;

/** Port of the client's MCQ letter resolution (server-side authority) */
function extractMcqLetter(answer: string, choices: string[]): string {
  const trimmed = answer.trim();
  if (/^[A-D]$/i.test(trimmed)) return trimmed.toUpperCase();
  const prefixMatch = trimmed.match(/^([A-D])[.)\s]/i);
  if (prefixMatch) return prefixMatch[1].toUpperCase();
  const lowerAnswer = trimmed.toLowerCase().replace(/^[A-D][.)\s]+/i, '').trim();
  for (let i = 0; i < choices.length; i++) {
    const cleanChoice = choices[i].replace(/^[A-D][.)\s]+/, '').trim().toLowerCase();
    if (cleanChoice === lowerAnswer) return String.fromCharCode(65 + i);
  }
  for (let i = 0; i < choices.length; i++) {
    const cleanChoice = choices[i].replace(/^[A-D][.)\s]+/, '').trim().toLowerCase();
    if (cleanChoice.includes(lowerAnswer) || lowerAnswer.includes(cleanChoice)) {
      return String.fromCharCode(65 + i);
    }
  }
  return trimmed.charAt(0).toUpperCase();
}

function normalizeTFNG(s: string): string {
  const t = s.trim();
  if (t === 'T' || t.toUpperCase() === 'TRUE') return 'True';
  if (t === 'F' || t.toUpperCase() === 'FALSE') return 'False';
  if (t.toUpperCase() === 'NG') return 'Not Given';
  return t;
}

function normalizeOrder(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '').replace(/,/g, ',');
}

function isObjective(def: ReadingQuestionDefinition): boolean {
  // Sequencing (order keyword + comma-separated canonical key) has an
  // authoritative deterministic rule — normalized order comparison.
  if (def.answer.includes(',') && SEQUENCING_PATTERN.test(def.questionText)) return true;
  return (
    !requiresApiEvaluation(def.dseType ?? undefined) ||
    (def.choices !== null && def.choices.length > 0 && /^[A-D]$/i.test(def.answer.trim()))
  );
}

/** Deterministic scoring against the server-owned canonical key */
function scoreDeterministic(def: ReadingQuestionDefinition, studentAnswer: string): { correct: boolean } {
  // Sequencing: order-keyword question with comma-separated canonical key
  if (def.answer.includes(',') && SEQUENCING_PATTERN.test(def.questionText)) {
    return { correct: normalizeOrder(studentAnswer) === normalizeOrder(def.answer) };
  }
  // Letter-keyed MC / cloze
  if (def.choices && def.choices.length > 0 && /^[A-D]$/i.test(def.answer.trim())) {
    const studentLetter = studentAnswer.trim().toUpperCase().charAt(0);
    return { correct: studentLetter === extractMcqLetter(def.answer, def.choices) };
  }
  // TFNG abbreviation-normalized exact match
  return { correct: normalizeTFNG(studentAnswer).toLowerCase() === normalizeTFNG(def.answer).toLowerCase() };
}

/**
 * Score reading answers entirely server-side.
 * Returns normalized rows ready for PracticeAnswer persistence.
 */
export async function scoreReadingAnswers(
  rawAnswers: unknown,
  evaluate: SubjectiveEvaluator = evaluateWithAI,
): Promise<ReadingScoringResult> {
  if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
    return { ok: true, answers: [] };
  }

  // ---- Identity gate (mirrors practice-answer-validation) ----
  const seen = new Set<string>();
  const rows: { questionIndex: number; questionId: string; studentAnswer: string; timeSpent: number | null }[] = [];
  for (const raw of rawAnswers) {
    const a = (raw ?? {}) as ReadingAnswerSubmission;
    const questionId = typeof a.questionId === 'string' ? a.questionId.trim() : '';
    if (!questionId) {
      return { ok: false, error: '每題答案必須提供 questionId（題目唯一識別）' };
    }
    if (seen.has(questionId)) {
      return { ok: false, error: `重複的 questionId: ${questionId}（同一提交內每題必須唯一）` };
    }
    seen.add(questionId);
    if (typeof a.questionIndex !== 'number' || !Number.isFinite(a.questionIndex) || a.questionIndex < 0) {
      return { ok: false, error: `questionIndex 必須為非負整數（收到: ${String(a.questionIndex)}）` };
    }
    rows.push({
      questionIndex: a.questionIndex,
      questionId,
      studentAnswer: typeof a.studentAnswer === 'string' ? a.studentAnswer : '',
      timeSpent: typeof a.timeSpent === 'number' && Number.isFinite(a.timeSpent) ? a.timeSpent : null,
    });
  }

  // ---- Question-definition authority: every id must resolve server-side ----
  const defs = await resolveReadingQuestionDefinitions(rows.map(r => r.questionId));
  const unresolved = rows.filter(r => !defs.has(r.questionId));
  if (unresolved.length > 0) {
    return {
      ok: false,
      error: `找不到題目定義（伺服器不持有此題，NOT_PROJECTABLE）: ${unresolved.map(r => r.questionId).join(', ')}`,
    };
  }

  // ---- Per-item scoring (server authority only) ----
  const answers: ScoredReadingAnswer[] = [];
  for (const row of rows) {
    const def = defs.get(row.questionId)!;

    if (!Number.isFinite(def.marks) || def.marks <= 0) {
      return { ok: false, error: `題目 ${row.questionId} 缺少有效 marks（maxScore 無法定義，NOT_PROJECTABLE）` };
    }

    // 2026-08-29 audit: a question whose canonical answer key is empty cannot
    // be scored fairly (blank-vs-blank exact match would award full marks to
    // an unanswered question). Reject — never score an unverifiable item.
    if (!def.answer || def.answer.trim().length === 0) {
      return {
        ok: false,
        error: `題目 ${row.questionId} 缺少正典答案（正確性無法定義，NOT_PROJECTABLE）`,
      };
    }

    let awarded: number;
    let result: ScoredReadingAnswer['result'];
    let scoredBy: 'server' | 'ai';
    let scoringMethod: string;

    if (isObjective(def)) {
      const { correct } = scoreDeterministic(def, row.studentAnswer);
      awarded = correct ? def.marks : 0;
      result = correct ? 'correct' : 'incorrect';
      scoredBy = 'server';
      scoringMethod = 'reading-server-exact-match';
    } else {
      // R37-H03: 主觀題必須由 AI 語意評估。AI 失敗時不偽造伺服器分數：
      // 整個提交 NOT_PROJECTABLE，且不持久化任何誤導性已評分項目。
      let ai: { score: number; isCorrect: boolean; isPartiallyCorrect: boolean; evaluationMethod?: 'ai' | 'rule-based' };
      try {
        ai = await evaluate(row.studentAnswer, def.answer, def.questionText, def.marks);
      } catch {
        return {
          ok: false,
          error: `AI 語意評估失敗（題目 ${row.questionId} 為主觀題，不可用確定性比對替代）— NOT_PROJECTABLE，未持久化任何分數`,
        };
      }
      // R3.10-L: a rule-based (keyword-heuristic) fallback verdict is NOT AI
      // semantic evidence. Persisting it under 'reading-ai-semantic-evaluation'
      // would turn a heuristic guess into trusted ground truth — reject instead.
      if (ai.evaluationMethod === 'rule-based') {
        return {
          ok: false,
          error: `AI 語意評估暫時不可用（題目 ${row.questionId} 為主觀題，無法取得可信語意評分）— NOT_PROJECTABLE，未持久化任何分數`,
        };
      }
      awarded = ai.score;
      result = ai.isPartiallyCorrect ? 'partial' : ai.isCorrect ? 'correct' : 'incorrect';
      scoredBy = 'ai';
      scoringMethod = 'reading-ai-semantic-evaluation';
    }

    if (!Number.isFinite(awarded) || awarded < 0 || awarded > def.marks) {
      return {
        ok: false,
        error: `題目 ${row.questionId} 評分結果超出範圍（awarded=${String(awarded)}, max=${def.marks}，NOT_PROJECTABLE）`,
      };
    }

    answers.push({
      questionIndex: row.questionIndex,
      questionId: row.questionId,
      questionType: def.questionType,
      questionPrompt: def.questionText,
      correctAnswer: def.answer,
      studentAnswer: row.studentAnswer,
      isCorrect: result === 'correct',
      result,
      awardedScore: awarded,
      maxScore: def.marks,
      countsTowardScore: true,
      timeSpent: row.timeSpent,
      scoredBy,
      scoringMethod,
    });
  }

  // ---- R37-H08: canonical ordering by server-owned orderIndex ----
  const orderByQuestionId = new Map(rows.map(r => [r.questionId, defs.get(r.questionId)!.orderIndex]));
  answers.sort((a, b) => {
    const oa = orderByQuestionId.get(a.questionId) ?? 0;
    const ob = orderByQuestionId.get(b.questionId) ?? 0;
    if (oa !== ob) return oa - ob;
    return a.questionIndex - b.questionIndex;
  });

  return { ok: true, answers };
}

// ============================================
// R37-H01: server-authoritative session aggregates
// ============================================
// Derived ONLY from server-computed per-item evidence. Client-supplied
// totals (totalQuestions/correctCount/totalScore/percentage) are never
// consulted.

export interface ReadingSessionAggregates {
  totalQuestions: number;
  correctCount: number;
  totalScore: number;
  maxScore: number;
  /** Fraction 0..1 (totalScore / maxScore) */
  percentage: number;
}

export function computeReadingAggregates(items: ScoredReadingAnswer[]): ReadingSessionAggregates {
  const totalQuestions = items.length;
  let totalScore = 0;
  let maxScore = 0;
  let correctCount = 0;
  for (const it of items) {
    totalScore += it.awardedScore;
    maxScore += it.maxScore;
    if (it.result === 'correct') correctCount += 1;
  }
  const percentage = maxScore > 0 ? totalScore / maxScore : 0;
  return { totalQuestions, correctCount, totalScore, maxScore, percentage };
}
