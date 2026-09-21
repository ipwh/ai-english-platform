// ============================================
// R3.10-C: Canonical Practice Evidence Projection
// ============================================
// The SINGLE service responsible for determining verified Practice
// evidence. Consumers (accuracy, mastery, dashboards, radar) must use
// this service — never PracticeSession.correctCount/totalQuestions
// independently.
//
// Rules:
// - PracticeSession aggregates are NEVER independently authoritative.
// - Only sessions with valid persisted PracticeAnswer evidence qualify.
// - Zero-answer / presence-only sessions → UNVERIFIABLE (excluded).
// - Historical rows with unsupported authority (client/null/unknown)
//   → UNVERIFIABLE (excluded; never repaired, never backfilled).
// - Rows with countsTowardScore=false are excluded from scored totals.
// - correctCount = count(result === 'correct') over counted rows.
// - This is projection only — it never mutates any row.
//
// Phase 1 residual authority risk: grammar answer keys remain
// client-supplied. This service verifies SCORING EVIDENCE (server-scored
// rows), not question-definition ownership.
// ============================================

export interface PracticeEvidenceRow {
  questionId: string | null;
  result: string | null | undefined;
  awardedScore: number | null | undefined;
  maxScore: number | null | undefined;
  countsTowardScore: boolean | null | undefined;
  scoredBy: string | null | undefined;
  scoringMethod: string | null | undefined;
}

export interface VerifiedPracticeEvidence {
  status: 'verified';
  /** Counted rows only (countsTowardScore !== false) */
  totalQuestions: number;
  correctCount: number;
  /** 0-100 rounded, or null when no counted rows exist */
  accuracy: number | null;
}

export interface UnverifiablePracticeEvidence {
  status: 'unverifiable';
  reason:
    | 'no-answers'
    | 'missing-question-id'
    | 'invalid-result'
    | 'unsupported-authority'
    | 'invalid-scores'
    | 'no-counted-items'
    | 'unverified-key-authority';
}

export type PracticeEvidenceResult = VerifiedPracticeEvidence | UnverifiablePracticeEvidence;

const SUPPORTED_AUTHORITIES = new Set(['server', 'ai']);
const VALID_RESULTS = new Set(['correct', 'incorrect', 'partial', 'ungradable']);

// R3.10-D: explicit key-authority provenance. A row is only verified
// evidence when its scoringMethod proves the answer key was
// server-owned at scoring time:
// - 'server-key-resolved'           → grammar, scored against GrammarQuestion store
// - 'reading-server-exact-match'    → reading objective, scored against ReadingQuestion store
// - 'reading-ai-semantic-evaluation'→ reading subjective, AI vs server-owned key
// Legacy 'deterministic-answer-comparison' (client-supplied key) and
// null/unknown methods are NOT authoritative → unverifiable, never repaired.
const SERVER_KEY_AUTHORITATIVE: ReadonlyArray<readonly [string, string]> = [
  ['server', 'server-key-resolved'],
  ['server', 'reading-server-exact-match'],
  ['ai', 'reading-ai-semantic-evaluation'],
  // 2026-09-21 ADR-045: listening objective answers scored against the
  // server-owned ListeningQuestion store.
  ['server', 'listening-server-exact-match'],
];

function hasServerKeyAuthority(scoredBy: string | null | undefined, scoringMethod: string | null | undefined): boolean {
  return SERVER_KEY_AUTHORITATIVE.some(([authority, method]) => scoredBy === authority && scoringMethod === method);
}

// ============================================
// R3.10-C: verified session listing (service-level DB access)
// ============================================

export interface SessionEvidenceEntry {
  id: string;
  skill: string;
  skillZh: string;
  source: string;
  startedAt: Date;
  evidence: PracticeEvidenceResult;
}

/**
 * Load a student's practice sessions together with the canonical
 * evidence evaluation. Consumers must use this instead of trusting
 * PracticeSession aggregate fields directly.
 */
export async function getVerifiedPracticeSessions(
  studentId: string,
  limit = 200,
): Promise<SessionEvidenceEntry[]> {
  const { listPracticeSessionsWithEvidence } = await import('../repositories/practice-repo');
  const sessions = await listPracticeSessionsWithEvidence(studentId, limit);
  return sessions.map(s => ({
    id: s.id,
    skill: s.skill,
    skillZh: s.skillZh,
    source: s.source,
    startedAt: s.startedAt,
    evidence: evaluatePracticeEvidence(s.answers),
  }));
}

/**
 * Evaluate whether a session's persisted answer rows constitute verified
 * scoring evidence, and derive the authoritative totals from the rows.
 * Pure function — reads only, never mutates.
 */
export function evaluatePracticeEvidence(answers: unknown): PracticeEvidenceResult {
  if (!Array.isArray(answers) || answers.length === 0) {
    return { status: 'unverifiable', reason: 'no-answers' };
  }

  let counted = 0;
  let correct = 0;

  for (const raw of answers) {
    const a = (raw ?? {}) as PracticeEvidenceRow;

    if (typeof a.questionId !== 'string' || a.questionId.trim() === '') {
      return { status: 'unverifiable', reason: 'missing-question-id' };
    }
    if (typeof a.result !== 'string' || !VALID_RESULTS.has(a.result)) {
      return { status: 'unverifiable', reason: 'invalid-result' };
    }
    if (typeof a.scoredBy !== 'string' || !SUPPORTED_AUTHORITIES.has(a.scoredBy)) {
      return { status: 'unverifiable', reason: 'unsupported-authority' };
    }
    // R3.10-D: the answer key must be server-authoritative. scoredBy alone
    // is NOT sufficient — the scoringMethod must prove server-owned key.
    if (!hasServerKeyAuthority(a.scoredBy, a.scoringMethod)) {
      return { status: 'unverifiable', reason: 'unverified-key-authority' };
    }
    if (a.countsTowardScore === false) continue;
    if (typeof a.awardedScore !== 'number' || !Number.isFinite(a.awardedScore)) {
      return { status: 'unverifiable', reason: 'invalid-scores' };
    }
    if (typeof a.maxScore !== 'number' || !Number.isFinite(a.maxScore) || a.maxScore <= 0) {
      return { status: 'unverifiable', reason: 'invalid-scores' };
    }
    if (a.awardedScore < 0 || a.awardedScore > a.maxScore) {
      return { status: 'unverifiable', reason: 'invalid-scores' };
    }

    counted += 1;
    if (a.result === 'correct') correct += 1;
  }

  if (counted === 0) {
    return { status: 'unverifiable', reason: 'no-counted-items' };
  }

  return {
    status: 'verified',
    totalQuestions: counted,
    correctCount: correct,
    accuracy: Math.round((correct / counted) * 100),
  };
}

// ============================================
// R3.10-C.2: Canonical projection helpers (all reuse evaluatePracticeEvidence)
// ============================================

/**
 * Classify one persisted session: canonical evidence verdict + verified
 * row-derived totals (null when unverifiable) + the raw recorded
 * aggregate values (for explicitly-labelled history display only).
 */
export interface ClassifiedSessionEvidence {
  evidence: PracticeEvidenceResult;
  /** Row-derived scored totals — null when the session cannot contribute verified evidence. */
  verifiedTotals: { totalQuestions: number; correctCount: number } | null;
  /** Raw persisted aggregate values — display-only recorded history, never scored authority. */
  recordedTotals: { totalQuestions: number; correctCount: number };
}

export function classifySessionEvidence(session: {
  totalQuestions: number;
  correctCount: number;
  answers: unknown;
}): ClassifiedSessionEvidence {
  const evidence = evaluatePracticeEvidence(session.answers);
  return {
    evidence,
    verifiedTotals:
      evidence.status === 'verified'
        ? { totalQuestions: evidence.totalQuestions, correctCount: evidence.correctCount }
        : null,
    recordedTotals: { totalQuestions: session.totalQuestions, correctCount: session.correctCount },
  };
}

/**
 * Project verified learning progress from session evidence entries.
 * Unverifiable / zero-answer / presence / historical sessions contribute
 * NOTHING to accuracy, weak skills or recent performance. Client totals
 * do not exist as input.
 */
export interface VerifiedProgressProjection {
  /** Verified row-derived overall accuracy (0-100), or null when no verified evidence exists. */
  overallAccuracy: number | null;
  weakSkills: Array<{ name: string; nameZh: string; accuracy: number }>;
  recentPerformance: Array<{ date: string; accuracy: number; questionsDone: number }>;
  verifiedTotalQuestions: number;
  verifiedCorrectCount: number;
}

export function projectVerifiedProgress(
  entries: SessionEvidenceEntry[],
): VerifiedProgressProjection {
  const skillMap = new Map<string, { nameZh: string; total: number; correct: number }>();
  const recentPerformance: Array<{ date: string; accuracy: number; questionsDone: number }> = [];
  let verifiedTotalQuestions = 0;
  let verifiedCorrectCount = 0;

  for (const entry of entries) {
    const ev = entry.evidence;
    if (ev.status !== 'verified') continue;

    verifiedTotalQuestions += ev.totalQuestions;
    verifiedCorrectCount += ev.correctCount;

    const key = entry.skillZh || entry.skill || 'general';
    const current = skillMap.get(key) || { nameZh: key, total: 0, correct: 0 };
    current.total += ev.totalQuestions;
    current.correct += ev.correctCount;
    skillMap.set(key, current);

    if (recentPerformance.length < 10) {
      recentPerformance.push({
        date: new Date(entry.startedAt).toLocaleDateString(),
        accuracy: ev.accuracy ?? Math.round((ev.correctCount / Math.max(1, ev.totalQuestions)) * 100),
        questionsDone: ev.totalQuestions,
      });
    }
  }

  return {
    overallAccuracy:
      verifiedTotalQuestions > 0
        ? Math.round((verifiedCorrectCount / verifiedTotalQuestions) * 100)
        : null,
    weakSkills: Array.from(skillMap.entries())
      .map(([name, v]) => ({
        name,
        nameZh: v.nameZh,
        accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
      }))
      .filter(s => s.accuracy < 70),
    recentPerformance,
    verifiedTotalQuestions,
    verifiedCorrectCount,
  };
}

/**
 * Monthly engagement/scored trend. Session counts are raw engagement;
 * question/correct counts are verified row-derived evidence ONLY.
 */
export interface VerifiedMonthlyTrendPoint {
  month: string;
  sessions: number;
  verifiedQuestions: number;
  verifiedCorrect: number;
}

export function aggregateVerifiedMonthlyTrend(
  sessions: Array<{
    startedAt: Date;
    totalQuestions: number;
    correctCount: number;
    answers: unknown;
  }>,
): VerifiedMonthlyTrendPoint[] {
  const monthlyMap = new Map<string, { sessions: number; questions: number; correct: number }>();
  for (const s of sessions) {
    const month = s.startedAt.toISOString().slice(0, 7);
    const entry = monthlyMap.get(month) || { sessions: 0, questions: 0, correct: 0 };
    entry.sessions += 1;
    const cls = classifySessionEvidence(s);
    if (cls.verifiedTotals) {
      entry.questions += cls.verifiedTotals.totalQuestions;
      entry.correct += cls.verifiedTotals.correctCount;
    }
    monthlyMap.set(month, entry);
  }
  return Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      sessions: data.sessions,
      verifiedQuestions: data.questions,
      verifiedCorrect: data.correct,
    }));
}

/**
 * Per-student practice totals: verified (scored) vs recorded (raw
 * historical). Historical raw values are never silently re-labelled
 * as verified.
 */
export interface StudentPracticeTotals {
  verifiedTotalQuestions: number;
  verifiedCorrectCount: number;
  recordedTotalQuestions: number;
  recordedCorrectCount: number;
}

export function aggregateStudentPracticeTotals(
  sessions: Array<{ totalQuestions: number; correctCount: number; answers: unknown }>,
): StudentPracticeTotals {
  let verifiedTotalQuestions = 0;
  let verifiedCorrectCount = 0;
  let recordedTotalQuestions = 0;
  let recordedCorrectCount = 0;

  for (const s of sessions) {
    recordedTotalQuestions += s.totalQuestions;
    recordedCorrectCount += s.correctCount;
    const cls = classifySessionEvidence(s);
    if (cls.verifiedTotals) {
      verifiedTotalQuestions += cls.verifiedTotals.totalQuestions;
      verifiedCorrectCount += cls.verifiedTotals.correctCount;
    }
  }

  return {
    verifiedTotalQuestions,
    verifiedCorrectCount,
    recordedTotalQuestions,
    recordedCorrectCount,
  };
}
