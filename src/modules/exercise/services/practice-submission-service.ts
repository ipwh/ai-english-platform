// ============================================
// R3.10-E.2: Practice Submission Service (use case)
// ============================================
// The SINGLE owner of practice submission business logic:
//   classification → scoring dispatch → authoritative persistence
//   → mistake gating → mastery gating → analytics synchronization.
//
// The HTTP route (src/app/api/practice/route.ts) now only handles
// authentication, rate limiting, request parsing, service invocation
// and HTTP response mapping.
//
// Authority contracts preserved EXACTLY (R3.10-D series):
//   - server-key-resolved / reading-server-exact-match /
//     reading-ai-semantic-evaluation are the only authoritative methods
//   - client-key-deterministic → never trusted
//   - unknown skill → rejected, never routed to grammar authority
//   - isServerAuthoritativeSubmission() gates mistakes AND mastery
//   - shouldUpdateMastery() enforces INVARIANT-D9
// ============================================

import { logger } from '@/shared/logger/logger';
import { PracticeRepo } from '@/modules/repositories';
import {
  classifyPracticeSubmission,
  isServerAuthoritativeSubmission,
  shouldUpdateMastery,
  type PracticeSubmissionClass,
} from './practice-submission-classification';
import {
  validatePracticeAnswers,
  validateGrammarAnswersWithServerKeys,
  computePracticeAggregates,
  type NormalizedPracticeAnswer,
} from './practice-answer-validation';
import {
  scoreReadingAnswers,
  computeReadingAggregates,
  type ReadingSessionAggregates,
} from '@/modules/reading/services/reading-answer-scoring';
import {
  recordActivityMastery,
  syncStudentActivityMetrics,
} from '@/modules/learning-analytics/services/activity-accounting-service';
import { createMistakeIfAbsent } from '@/modules/mistake/db/repositories/mistake-repo';
import {
  resolveMistakeSkillIdentities,
  type MistakeSkillIdentity,
} from './mistake-skill-identity';

export interface SubmitPracticeInput {
  studentId: string;
  skill?: string;
  skillZh?: string;
  difficulty?: string;
  source?: string;
  answers?: unknown;
  /**
   * R3.10-E.2 P0-3: client replay/dedup key. ONLY a replay mechanism —
   * never an authority signal. null/undefined = legacy request
   * (current behavior preserved).
   */
  clientSubmissionId?: string | null;
}

export interface SubmitPracticeSuccess {
  ok: true;
  session: { id: string; created: boolean };
  submissionClass: PracticeSubmissionClass;
  totalQuestions: number;
  correctCount: number;
  masteryUpdated: boolean;
}

export type SubmitPracticeResult =
  | SubmitPracticeSuccess
  | { ok: false; error: string; status: 400 };

function deriveAggregates(
  submissionClass: PracticeSubmissionClass,
  sessionAggregates: ReadingSessionAggregates | null,
  normalizedAnswers: NormalizedPracticeAnswer[],
): { totalQuestions: number; correctCount: number } {
  if (submissionClass === 'reading' && sessionAggregates) {
    return { totalQuestions: sessionAggregates.totalQuestions, correctCount: sessionAggregates.correctCount };
  }
  return computePracticeAggregates(normalizedAnswers);
}

/**
 * Submit a practice execution end-to-end.
 * Idempotent for repeated `clientSubmissionId` values: the original
 * persisted session is returned and NO side effects are re-run.
 */
export async function submitPractice(input: SubmitPracticeInput): Promise<SubmitPracticeResult> {
  const { studentId, skill, skillZh, difficulty, source, answers, clientSubmissionId } = input;

  // 1. Classification contract (R3.10-D.1 F1)
  const submissionClass = classifyPracticeSubmission({ source, skill, answers });
  if (submissionClass === 'unknown') {
    return {
      ok: false,
      status: 400,
      error: `不支援的 skill: ${String(skill ?? '').trim() || '(empty)'}（無法判定題目權威來源）`,
    };
  }

  // 2. Scoring dispatch — one authority per class (R3.7 / R3.10-D)
  let normalizedAnswers: NormalizedPracticeAnswer[];
  let sessionAggregates: ReadingSessionAggregates | null = null;

  if (submissionClass === 'reading') {
    const scoring = await scoreReadingAnswers(answers);
    if (!scoring.ok) return { ok: false, status: 400, error: scoring.error };
    normalizedAnswers = scoring.answers;
    sessionAggregates = computeReadingAggregates(scoring.answers);
  } else if (submissionClass === 'grammar') {
    const grammarValidation = await validateGrammarAnswersWithServerKeys(answers);
    if (!grammarValidation.ok) return { ok: false, status: 400, error: grammarValidation.error };
    normalizedAnswers = grammarValidation.answers;
  } else {
    // legacy-language-skill: client-key path (persistable for history/display
    // ONLY; scoringMethod = client-key-deterministic — never trusted).
    const answerValidation = validatePracticeAnswers(answers);
    if (!answerValidation.ok) return { ok: false, status: 400, error: answerValidation.error };
    normalizedAnswers = answerValidation.answers;
  }

  const aggregates = deriveAggregates(submissionClass, sessionAggregates, normalizedAnswers);

  // 3. Authoritative persistence (atomic tx + replay semantics)
  const persisted = await PracticeRepo.createPracticeExecutionTx({
    session: {
      studentId,
      skill: skill || (submissionClass === 'reading' ? 'reading' : 'general'),
      skillZh: skillZh || (submissionClass === 'reading' ? 'DSE 閱讀模擬' : '綜合'),
      difficulty: difficulty || 'core',
      totalQuestions: aggregates.totalQuestions,
      correctCount: aggregates.correctCount,
      source: source || (submissionClass === 'reading' ? 'dse-reading' : 'ai-generated'),
      completedAt: new Date(),
      clientSubmissionId: clientSubmissionId ?? null,
    },
    answers: normalizedAnswers,
  });

  // Replay: original persisted result returned; side effects NOT duplicated.
  if (!persisted.created) {
    return {
      ok: true,
      session: persisted,
      submissionClass,
      totalQuestions: aggregates.totalQuestions,
      correctCount: aggregates.correctCount,
      masteryUpdated: false,
    };
  }

  // 4. Mistake gating (R3.10-D.3 Priority 2 / INVARIANT-D11):
  //    only server-authoritative classes create trusted Mistake records,
  //    and only via the atomic insert-if-absent (P0-2).
  if (normalizedAnswers.length > 0 && isServerAuthoritativeSubmission(submissionClass)) {
    const wrongAnswers = normalizedAnswers.filter(a => !a.isCorrect);
    // 錯題類型依技能分類：閱讀/聆聽 → comprehension、詞彙 → vocabulary、寫作 → chinglish、其餘 grammar。
    // 舊版一律 'grammar' 令閱讀錯題錯誤地懲罰文法弱項統計。
    const skillLower = String(skill || '').toLowerCase();
    const mistakeType = submissionClass === 'reading' || skillLower.includes('read') || skillLower.includes('listen')
      ? 'comprehension'
      : skillLower.includes('vocab') || skillLower.includes('phrasal')
        ? 'vocabulary'
        : skillLower.includes('writ')
          ? 'chinglish'
          : 'grammar';

    // 2026-09-14: 技能／題型歸屬 — 由正典題目定義解析（與 /api/mistakes 共用同一解析器）。
    // 解析失敗不阻止錯題記錄；查不到的舊題目只留錯誤類型，標記 unresolved 而不推測技能。
    let skillIdentities = new Map<string, MistakeSkillIdentity>();
    if (wrongAnswers.length > 0) {
      try {
        skillIdentities = await resolveMistakeSkillIdentities(wrongAnswers.map(a => a.questionId));
      } catch (err) {
        logger.warn({ module: 'practice', studentId, error: err instanceof Error ? err.message : String(err) }, 'Mistake skill resolution failed (non-fatal)');
      }
    }

    for (const a of wrongAnswers) {
      try {
        await createMistakeIfAbsent({
          studentId,
          questionId: a.questionId,
          questionSummary: a.questionPrompt || '',
          studentAnswer: a.studentAnswer || '',
          correctAnswer: a.correctAnswer || '',
          mistakeType,
          languageSkill: skillIdentities.get(a.questionId)?.languageSkill
            ?? (submissionClass === 'reading' ? 'reading' : null),
          grammarItem: skillIdentities.get(a.questionId)?.grammarItem ?? null,
          questionType: skillIdentities.get(a.questionId)?.questionType ?? null,
          skillSource: skillIdentities.get(a.questionId)?.skillSource
            ?? (submissionClass === 'reading' ? 'client-claimed' : 'unresolved'),
        });
      } catch (err) {
        logger.warn({ module: 'practice', studentId, error: err instanceof Error ? err.message : String(err) }, 'Auto-mistake sync failed (non-fatal)');
      }
    }
  }

  // 5. Analytics + mastery gating (INVARIANT-D9):
  //    accuracy recompute uses verified evidence only; mastery only from
  //    server-authoritative paths with non-zero server-derived totals.
  const masteryUpdated = shouldUpdateMastery(submissionClass, aggregates.totalQuestions);
  try {
    await Promise.all([
      syncStudentActivityMetrics(studentId).catch(err => {
        logger.error({ module: 'practice', studentId, error: err instanceof Error ? err.message : String(err) }, 'Practice analytics sync failed');
      }),
      masteryUpdated
        ? recordActivityMastery({
            studentId,
            skill,
            subSkill: skillZh || skill || 'general',
            totalQuestions: aggregates.totalQuestions,
            correctCount: aggregates.correctCount,
          })
        : Promise.resolve(),
    ]);
  } catch (error) {
    logger.error({ module: 'practice', studentId, error: error instanceof Error ? error.message : String(error) }, 'Practice analytics sync failed');
  }

  return {
    ok: true,
    session: persisted,
    submissionClass,
    totalQuestions: aggregates.totalQuestions,
    correctCount: aggregates.correctCount,
    masteryUpdated,
  };
}
