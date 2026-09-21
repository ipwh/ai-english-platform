// ============================================
// R3.1–R3.2 + R3.3: Practice Answer Validation & Normalization
// ============================================
// Pure application-boundary logic for /api/practice answer submissions.
//
// Guarantees:
// 1. questionId is REQUIRED for every new answer and is preserved
//    unchanged (canonical PracticeQuestion.id — never synthesized
//    from questionIndex).
// 2. Duplicate questionId within one submission is rejected.
// 3. R3.3 SCORING AUTHORITY:
//    - Practice (grammar) answers: the SERVER is the authoritative
//      scorer. Client-supplied isCorrect/result/awardedScore/maxScore/
//      countsTowardScore are IGNORED and recomputed deterministically.
//      R3.10-D.1 (F5): non-grammar legacy paths mark scoringMethod as
//      'client-key-deterministic' — the key is client-supplied, and such
//      rows NEVER become verified evidence.
//    - Reading answers (raw dseType present): scoring remains
//      client-forwarded for now (DEFERRED — the reading evaluator
//      requires passage state the practice endpoint does not hold).
//      Explicit scores are preserved verbatim and never inferred.
// 4. No score is ever invented beyond the runtime's own semantics.
//
// This module is NOT the StudentAssessmentResult mapper (R3.4).
// ============================================

import { scorePracticeAnswer, checkAnswer, isOpenEndedQuestionType } from './practice-answer-scorer';

export const PRACTICE_ANSWER_RESULTS = ['correct', 'incorrect', 'partial', 'ungradable'] as const;
export type PracticeAnswerResult = (typeof PRACTICE_ANSWER_RESULTS)[number];

/** Who produced the score persisted on this row (R3.3/R3.7 provenance evidence) */
export type PracticeAnswerScoredBy = 'server' | 'ai' | 'client';

/** Raw answer object as accepted from the request body */
export interface RawPracticeAnswerInput {
  questionIndex: number;
  questionId?: string;
  questionType?: string;
  questionPrompt?: string;
  correctAnswer?: string;
  studentAnswer?: string;
  /** MC choices — needed for server-side full-text answer resolution */
  choices?: string[];
  /**
   * Reading marker. When present, the answer belongs to the reading
   * execution family (DEFERRED authority — client-forwarded scoring).
   */
  dseType?: string;
  /** Client scoring fields — IGNORED for practice answers (R3.3) */
  isCorrect?: boolean;
  result?: string;
  awardedScore?: number;
  maxScore?: number;
  countsTowardScore?: boolean;
  timeSpent?: number;
}

/** Answer after boundary normalization — ready for persistence */
export interface NormalizedPracticeAnswer {
  questionIndex: number;
  /** Canonical question identity — always present for new rows */
  questionId: string;
  questionType: string;
  questionPrompt: string;
  correctAnswer: string;
  studentAnswer: string;
  isCorrect: boolean;
  result: PracticeAnswerResult;
  awardedScore: number;
  maxScore: number;
  countsTowardScore: boolean;
  timeSpent: number | null;
  /** R3.3: actual scoring authority for this row */
  scoredBy: PracticeAnswerScoredBy;
  scoringMethod: string;
}

export type PracticeAnswerValidationResult =
  | { ok: true; answers: NormalizedPracticeAnswer[] }
  | { ok: false; error: string };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

// ============================================
// R3.10-C: server-derived session aggregates for practice (grammar)
// ============================================
// Client-supplied totalQuestions/correctCount are NEVER trusted. Totals
// are derived ONLY from the server-scored normalized rows.

export interface PracticeSessionAggregates {
  totalQuestions: number;
  correctCount: number;
}

/**
 * Server-derived session aggregates.
 *
 * Rows with `countsTowardScore === false` (open-ended questions that are not
 * auto-gradable) are EXCLUDED from the denominator — otherwise a writing
 * answer would silently depress the session accuracy (2026-09-15).
 */
export function computePracticeAggregates(
  answers: ReadonlyArray<{ result?: string | null; countsTowardScore?: boolean | null }>,
): PracticeSessionAggregates {
  const counted = answers.filter(a => a.countsTowardScore !== false);
  return {
    totalQuestions: counted.length,
    correctCount: counted.filter(a => a.result === 'correct').length,
  };
}

/**
 * Validate + normalize a submission's answers at the API boundary.
 *
 * Empty array → ok with empty list (presence-marker flows send no answers).
 */
export function validatePracticeAnswers(rawAnswers: unknown): PracticeAnswerValidationResult {
  if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
    return { ok: true, answers: [] };
  }

  const seenQuestionIds = new Set<string>();
  const normalized: NormalizedPracticeAnswer[] = [];

  for (const raw of rawAnswers) {
    const a = (raw ?? {}) as RawPracticeAnswerInput;

    // 1. Canonical question identity — REQUIRED for new submissions
    const questionId = typeof a.questionId === 'string' ? a.questionId.trim() : '';
    if (!questionId) {
      return { ok: false, error: '每題答案必須提供 questionId（題目唯一識別）' };
    }
    if (seenQuestionIds.has(questionId)) {
      return { ok: false, error: `重複的 questionId: ${questionId}（同一提交內每題必須唯一）` };
    }
    seenQuestionIds.add(questionId);

    // 2. questionIndex — ordering only, but must remain a valid number
    if (!isFiniteNumber(a.questionIndex) || a.questionIndex < 0) {
      return { ok: false, error: `questionIndex 必須為非負整數（收到: ${String(a.questionIndex)}）` };
    }

    const isReadingAnswer = typeof a.dseType === 'string' && a.dseType.length > 0;

    let result: PracticeAnswerResult;
    let awardedScore: number;
    let maxScore: number;
    let countsTowardScore: boolean;
    let scoredBy: PracticeAnswerScoredBy;
    let scoringMethod: string;

    if (isReadingAnswer) {
      // ============================================================
      // R3.7: 客戶端評分的閱讀答案一律拒絕。閱讀評分必須由伺服器
      // 持有的題目定義完成（/api/practice 會先以
      // reading-answer-scoring 進行伺服器評分）。此分支是防線：
      // 任何繞過伺服器評分、攜帶 dseType 的答案不得持久化。
      // ============================================================
      return { ok: false, error: 'reading 答案必須由伺服器評分（不接受客戶端評分）' };
    } else {
      // ============================================================
      // Practice (grammar) path — SERVER-AUTHORITATIVE (R3.3).
      // Client isCorrect/result/awardedScore/maxScore/countsTowardScore
      // are IGNORED and recomputed deterministically from the submitted
      // question data. Forged values have no effect.
      // ============================================================
      if (typeof a.correctAnswer !== 'string' || a.correctAnswer.trim() === '') {
        return { ok: false, error: '伺服器無法評分：答案缺少 correctAnswer（題目答案內容）' };
      }
      const scored = scorePracticeAnswer({
        studentAnswer: typeof a.studentAnswer === 'string' ? a.studentAnswer : '',
        correctAnswer: a.correctAnswer,
        questionType: a.questionType || 'mc',
        choices: Array.isArray(a.choices) ? a.choices : undefined,
      });
      result = scored.result as PracticeAnswerResult;
      awardedScore = scored.awardedScore;
      maxScore = scored.maxScore;
      countsTowardScore = scored.countsTowardScore;
      scoredBy = 'server';
      // R3.10-D.1 (F5): 明確標記 key 為客戶端提供 — 永不誤導為權威評分。
      // 此 method 不在 SERVER_KEY_AUTHORITATIVE 清單內 → 永不進入 verified evidence。
      scoringMethod = 'client-key-deterministic';
    }

    // 4. Score invariants (mirror the StudentAssessmentResult contract)
    if (maxScore <= 0) {
      return { ok: false, error: `maxScore 必須大於 0（收到: ${maxScore}）` };
    }
    if (awardedScore < 0 || awardedScore > maxScore) {
      return { ok: false, error: `awardedScore (${awardedScore}) 必須在 0 與 maxScore (${maxScore}) 之間` };
    }

    // 5. countsTowardScore rules (contract-compatible)
    if (countsTowardScore === false && result !== 'ungradable') {
      return { ok: false, error: `countsTowardScore=false 僅允許用於 result=ungradable（收到: ${result}）` };
    }
    if (countsTowardScore === false && awardedScore !== 0) {
      return { ok: false, error: '不計分的答案 awardedScore 必須為 0' };
    }

    // 6. isCorrect = authoritative result for downstream consumers
    const isCorrect = result === 'correct';

    normalized.push({
      questionIndex: a.questionIndex,
      questionId,
      questionType: a.questionType || 'mc',
      questionPrompt: a.questionPrompt || '',
      correctAnswer: a.correctAnswer || '',
      studentAnswer: a.studentAnswer || '',
      isCorrect,
      result,
      awardedScore,
      maxScore,
      countsTowardScore,
      timeSpent: isFiniteNumber(a.timeSpent) ? (a.timeSpent as number) : null,
      scoredBy,
      scoringMethod,
    });
  }

  return { ok: true, answers: normalized };
}

// ============================================================
// R3.10-D: Grammar server-key validation & scoring
// ============================================================
// Grammar answers are scored ONLY against server-owned GrammarQuestion
// definitions. Client-supplied correctAnswer / choices / questionPrompt /
// isCorrect / result / awardedScore / maxScore are IGNORED.
// Unknown grammar questionId → NOT_PROJECTABLE (mirrors the reading
// authority model; never reconstructed).
//
// scoringMethod = 'server-key-resolved' is the explicit provenance marker
// that the answer key was server-owned at scoring time.
// ============================================================

/**
 * Validate + score a grammar submission against the server question store.
 *
 * Empty array → ok with empty list (presence-marker flows send no answers).
 */
export async function validateGrammarAnswersWithServerKeys(
  rawAnswers: unknown,
): Promise<PracticeAnswerValidationResult> {
  if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
    return { ok: true, answers: [] };
  }

  // 1. Identity + ordering pre-checks (same contract as validatePracticeAnswers)
  const rows: RawPracticeAnswerInput[] = [];
  const seenQuestionIds = new Set<string>();
  for (const raw of rawAnswers) {
    const a = (raw ?? {}) as RawPracticeAnswerInput;

    const questionId = typeof a.questionId === 'string' ? a.questionId.trim() : '';
    if (!questionId) {
      return { ok: false, error: '每題答案必須提供 questionId（題目唯一識別）' };
    }
    if (seenQuestionIds.has(questionId)) {
      return { ok: false, error: `重複的 questionId: ${questionId}（同一提交內每題必須唯一）` };
    }
    seenQuestionIds.add(questionId);

    if (!isFiniteNumber(a.questionIndex) || a.questionIndex < 0) {
      return { ok: false, error: `questionIndex 必須為非負整數（收到: ${String(a.questionIndex)}）` };
    }
    rows.push(a);
  }

  // 2. Server-owned definitions — the ONLY scoring authority.
  //    Lazy import keeps this module free of a static DB dependency
  //    (mirrors the practice-evidence-service pattern).
  const { resolveGrammarQuestionDefinitions } = await import('./grammar-question-service');
  const definitions = await resolveGrammarQuestionDefinitions(rows.map(r => r.questionId!));
  const unresolved = rows.filter(r => !definitions.has(r.questionId!)).map(r => r.questionId!);
  if (unresolved.length > 0) {
    return {
      ok: false,
      error: `找不到文法題目定義（伺服器不持有此題，NOT_PROJECTABLE）: ${unresolved.join(', ')}`,
    };
  }
  const quarantined = rows
    .filter(row => definitions.get(row.questionId!)?.provenance === 'invalid')
    .map(row => row.questionId!);
  if (quarantined.length > 0) {
    return {
      ok: false,
      error: `此文法題目已因品質問題隔離，請重新產生練習（QUESTION_QUARANTINED）: ${quarantined.join(', ')}`,
    };
  }

  // 3. Score each row against the canonical key. Client correctAnswer/
  //    choices/questionPrompt are never consulted.
  const normalized: NormalizedPracticeAnswer[] = [];
  for (const a of rows) {
    const def = definitions.get(a.questionId!)!;
    const studentAnswer = typeof a.studentAnswer === 'string' ? a.studentAnswer : '';

    // Open-ended questions (short-writing) have NO deterministic key: the stored
    // answer is a sample answer, so scoring it as 'incorrect' would be a
    // manufactured verdict. Server classification → not auto-gradable, excluded
    // from scored totals (see isOpenEndedQuestionType).
    if (isOpenEndedQuestionType(def.questionType)) {
      normalized.push({
        questionIndex: a.questionIndex,
        questionId: a.questionId!,
        questionType: def.questionType,
        questionPrompt: def.prompt,
        correctAnswer: def.answer,
        studentAnswer,
        isCorrect: false,
        result: 'ungradable',
        awardedScore: 0,
        maxScore: 1,
        countsTowardScore: false,
        timeSpent: isFiniteNumber(a.timeSpent) ? (a.timeSpent as number) : null,
        scoredBy: 'server',
        // The server owned the definition and determined that no deterministic
        // key applies — the same provenance marker as a server-resolved key.
        scoringMethod: 'server-key-resolved',
      });
      continue;
    }

    let correct = checkAnswer(
      studentAnswer,
      def.answer,
      def.questionType,
      def.choices ?? undefined,
    );
    if (!correct && def.acceptedAnswers && def.acceptedAnswers.length > 0) {
      correct = def.acceptedAnswers.some(acc =>
        checkAnswer(studentAnswer, acc, def.questionType, def.choices ?? undefined),
      );
    }

    normalized.push({
      questionIndex: a.questionIndex,
      questionId: a.questionId!,
      questionType: def.questionType,
      questionPrompt: def.prompt,
      correctAnswer: def.answer,
      studentAnswer,
      isCorrect: correct,
      result: correct ? 'correct' : 'incorrect',
      awardedScore: correct ? 1 : 0,
      maxScore: 1,
      countsTowardScore: true,
      timeSpent: isFiniteNumber(a.timeSpent) ? (a.timeSpent as number) : null,
      scoredBy: 'server',
      scoringMethod: 'server-key-resolved',
    });
  }

  return { ok: true, answers: normalized };
}
