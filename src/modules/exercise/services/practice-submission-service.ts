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
// 2026-09-21 稽核補充：權威家族先由**伺服器解析 questionId**（正典題目庫）決定，
// 解析得到時不使用客戶端自報 skill／source（見 practice-authority-resolution.ts）。
// ============================================

import { logger } from '@/shared/logger/logger';
import { PracticeRepo } from '@/modules/repositories';
import {
  classifyPracticeSubmission,
  isServerAuthoritativeSubmission,
  shouldUpdateMastery,
  type PracticeSubmissionClass,
} from './practice-submission-classification';
import { resolveSubmissionAuthorityClass } from './practice-authority-resolution';
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
  recordPracticeSessionMasteryOnce,
  syncStudentActivityMetrics,
} from '@/modules/learning-analytics/services/activity-accounting-service';
import { createMistakeIfAbsent } from '@/modules/mistake/db/repositories/mistake-repo';
import {
  resolveMistakeSkillIdentities,
  sanitizeClientSkillClaims,
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
 * 由原始提交抽出白名單內的客戶端題型自報值（questionId → dseType / questionType）。
 *
 * 2026-09-15: 閱讀題目若不在正典題庫（未持久化的舊 `rd-*` 即時生成題），
 * `resolveMistakeSkillIdentities()` 解析不到 dseType，所有閱讀錯題便落入
 * `reading:unclassified` —— 學生看到「未分類題型」的弱項，無法知道要練什麼。
 * 題目生成時伺服器藍圖已決定 dseType，客戶端只是把它送回來；白名單驗證後
 * 作為題型後備，並如實標記 `skillSource = 'client-claimed'`。
 * 此值永不參與評分，只用於弱項歸類。
 */
function collectClaimedQuestionTypes(rawAnswers: unknown): Map<string, string> {
  const claimed = new Map<string, string>();
  if (!Array.isArray(rawAnswers)) return claimed;
  for (const raw of rawAnswers) {
    const a = (raw ?? {}) as { questionId?: unknown; dseType?: unknown; questionType?: unknown };
    const id = typeof a.questionId === 'string' ? a.questionId.trim() : '';
    if (!id || claimed.has(id)) continue;
    const sanitized = sanitizeClientSkillClaims({ questionType: a.dseType ?? a.questionType });
    if (sanitized.questionType) claimed.set(id, sanitized.questionType);
  }
  return claimed;
}

/**
 * Submit a practice execution end-to-end.
 * Idempotent for repeated `clientSubmissionId` values: the original
 * persisted session is returned and NO side effects are re-run.
 */
export async function submitPractice(input: SubmitPracticeInput): Promise<SubmitPracticeResult> {
  const { studentId, skill, skillZh, difficulty, source, answers, clientSubmissionId } = input;

  // 1. Classification contract (R3.10-D.1 F1)
  //    2026-09-21 稽核：先以**伺服器解析的題目身分**決定權威（不信客戶端自報）。
  //    「AI 練習」頁的閱讀／文法題已於交付前持久化為正典題目，但客戶端
  //    payload 不帶 dseType／source 標記 → 舊碼把閱讀判成 legacy，令學生
  //    的練習不計入準確率、掌握度與錯題本。解析失敗（真正的舊資料）時
  //    完全沿用既有 client-marker 分類，行為不變。
  const resolution = await resolveSubmissionAuthorityClass(answers).catch(() => null);
  const resolvedClass: PracticeSubmissionClass | null = resolution?.authorityClass ?? null;
  const submissionClass = resolvedClass
    ?? classifyPracticeSubmission({ source, skill, answers });
  if (submissionClass === 'unknown') {
    return {
      ok: false,
      status: 400,
      error: `不支援的 skill: ${String(skill ?? '').trim() || '(empty)'}（無法判定題目權威來源）`,
    };
  }
  if (resolvedClass) {
    logger.info(
      {
        module: 'practice-submission',
        studentId,
        submissionClass,
        resolutionReason: resolution?.reason,
        resolvedIds: resolution?.resolvedIds,
        clientSkill: skill,
        clientSource: source,
      },
      'Submission authority resolved from server-owned question definitions',
    );
  }

  // 2. Scoring dispatch — one authority per class (R3.7 / R3.10-D)
  let normalizedAnswers: NormalizedPracticeAnswer[];
  let sessionAggregates: ReadingSessionAggregates | null = null;

  if (submissionClass === 'reading') {
    const scoring = await scoreReadingAnswers(answers);
    if (!scoring.ok) {
      // 2026-09-21：若權威是由伺服器解析得出（客戶端原本送 legacy），
      // 閱讀評分失敗時**不得**令學生整份練習儲存失敗（例如 AI 語意評分
      // 暫時不可用）。回退至 legacy 路徑：場次照常保留供顯示，但
      // scoringMethod = client-key-deterministic → 不產生可信證據（fail-open）。
      if (resolvedClass === 'reading') {
        logger.warn(
          { module: 'practice-submission', studentId, error: scoring.error },
          'Reading scoring unavailable for a server-resolved reading submission — falling back to legacy (unverified) persistence',
        );
        const fallback = validatePracticeAnswers(answers);
        if (!fallback.ok) return { ok: false, status: 400, error: fallback.error };
        normalizedAnswers = fallback.answers;
        sessionAggregates = null;
      } else {
        return { ok: false, status: 400, error: scoring.error };
      }
    } else {
      normalizedAnswers = scoring.answers;
      sessionAggregates = computeReadingAggregates(scoring.answers);
    }
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
  //    2026-09-21：伺服器解析確認為閱讀時，來源統一寫入 'dse-reading'
  //    （客戶端舊碼送 'ai-generated' 會令教師端顯示不出 DSE 標記）。
  const persistedSource = resolvedClass === 'reading'
    ? 'dse-reading'
    : source || (submissionClass === 'reading' ? 'dse-reading' : 'ai-generated');
  const persisted = await PracticeRepo.createPracticeExecutionTx({
    session: {
      studentId,
      skill: skill || (submissionClass === 'reading' ? 'reading' : 'general'),
      skillZh: skillZh || (submissionClass === 'reading' ? 'DSE 閱讀模擬' : '綜合'),
      difficulty: difficulty || 'core',
      totalQuestions: aggregates.totalQuestions,
      correctCount: aggregates.correctCount,
      source: persistedSource,
      completedAt: new Date(),
      clientSubmissionId: clientSubmissionId ?? null,
    },
    answers: normalizedAnswers,
  });

  // Replay: original persisted result returned; side effects NOT duplicated.
  if (!persisted.created) {
    // A previous response may have failed after the atomic submission committed
    // but before its derived metrics were refreshed. Replaying the same key is
    // therefore also the recovery path for accuracy and weekly projections.
    await syncStudentActivityMetrics(studentId);
    const masteryUpdated = shouldUpdateMastery(submissionClass, aggregates.totalQuestions)
      ? await recordPracticeSessionMasteryOnce({
          sessionId: persisted.id, studentId, skill: persisted.skill, subSkill: persisted.skillZh || persisted.skill || 'general',
          totalQuestions: persisted.totalQuestions, correctCount: persisted.correctCount,
        })
      : false;
    return {
      ok: true,
      session: persisted,
      submissionClass,
      totalQuestions: persisted.totalQuestions,
      correctCount: persisted.correctCount,
      masteryUpdated,
    };
  }

  // 4. Mistake gating (R3.10-D.3 Priority 2 / INVARIANT-D11):
  //    only server-authoritative classes create trusted Mistake records,
  //    and only via the atomic insert-if-absent (P0-2).
  if (normalizedAnswers.length > 0 && isServerAuthoritativeSubmission(submissionClass)) {
    // Only rows actually scored as WRONG become mistakes. Open-ended questions
    // are 'ungradable' (not auto-gradable) — recording a 150-word essay as a
    // mistake because it differs from the sample answer is a manufactured error
    // (student report, 2026-09-15).
    const wrongAnswers = normalizedAnswers.filter(a => a.result === 'incorrect');
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

    // 題型後備：解析不到正典定義時，用白名單內的客戶端 dseType 歸類題型
    const claimedQuestionTypes = collectClaimedQuestionTypes(answers);

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
          questionType: skillIdentities.get(a.questionId)?.questionType
            ?? claimedQuestionTypes.get(a.questionId)
            ?? null,
          // 來源如實記錄：canonical 定義 > 白名單自報 > 無法歸類
          skillSource: skillIdentities.get(a.questionId)?.skillSource
            ?? (claimedQuestionTypes.has(a.questionId) ? 'client-claimed' : 'unresolved'),
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
    await syncStudentActivityMetrics(studentId);
  } catch (error) {
    // Do not acknowledge a derived-state failure as a completed submission.
    // The atomic execution remains durable and the client may safely replay its
    // clientSubmissionId, which refreshes metrics in the branch above.
    logger.error({ module: 'practice', studentId, error: error instanceof Error ? error.message : String(error) }, 'Practice analytics sync failed; replay required');
    throw new Error('練習已儲存，但進度統計暫未更新。請重試以完成同步 / Practice was saved but progress metrics were not updated. Please retry to finish syncing.');
  }

  if (masteryUpdated) {
    try {
      await recordPracticeSessionMasteryOnce({
        sessionId: persisted.id, studentId, skill, subSkill: skillZh || skill || 'general',
        totalQuestions: aggregates.totalQuestions, correctCount: aggregates.correctCount,
      });
    } catch (error) {
      logger.error({ module: 'practice', studentId, error: error instanceof Error ? error.message : String(error) }, 'Practice mastery update failed');
      throw new Error('練習已儲存，但掌握度暫未更新。請重試以完成同步 / Practice was saved but mastery was not updated. Please retry to finish syncing.');
    }
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
