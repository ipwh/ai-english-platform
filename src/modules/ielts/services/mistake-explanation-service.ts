// ============================================
// 2026-10-03 (VI): IELTS Mistake-Explanation Service
// ============================================
// Advisory "explain my wrong answer" flow for OBJECTIVE items the student
// already answered incorrectly.
//
// Guarantees:
//   * Only the attempt owner can request it; the attempt must be SUBMITTED.
//   * Only responses the deterministic scorer marked `incorrect` are eligible.
//   * The AI can NEVER change the mark — scoring stays deterministic and
//     server-side; the explanation is labelled advisory.
//   * Forbidden claim wording (bands/scores/examiners/guarantees) is stripped;
//     if nothing survives screening the request fails (nothing fabricated).
//   * Failures are typed (timeout 504 / provider 502 / invalid 422) and budget
//     errors propagate so the route can map 503.
// ============================================

import { explainIeltsMistakeWithAI, type IeltsMistakeExplanationAiResult } from '@/modules/ai';
import type { IeltsAnswerKey } from '../domain/types';
import { containsForbiddenClaim } from '../governance/states';
import { emitIeltsEvent, eventForAiFailure } from '../governance/events';
import * as ieltsRepo from '../repositories/ielts-repo';
import { parseJson } from './row-mappers';

/** Cap on passage/transcript context sent to the model. */
export const IELTS_EXPLANATION_MAX_CONTENT_CHARS = 4000;

export interface IeltsMistakeExplanationInput {
  userId: string;
  attemptId: string;
  questionId: string;
  language?: 'zh' | 'en';
}

export interface IeltsMistakeExplanationResult {
  questionId: string;
  explanation: string;
  misconception: string;
  tip: string;
  limitations: string[];
  promptVersion: string;
  provider: string | null;
  durationMs: number;
}

export type IeltsMistakeExplanationOutcome =
  | { ok: true; data: IeltsMistakeExplanationResult }
  | { ok: false; status: number; error: string; message?: string };

export interface IeltsMistakeExplanationDeps {
  explain?: (input: Parameters<typeof explainIeltsMistakeWithAI>[0]) => Promise<IeltsMistakeExplanationAiResult>;
}

const FAILURE_STATUS: Record<string, number> = {
  AI_PROVIDER_TIMEOUT: 504,
  AI_PROVIDER_ERROR: 502,
  AI_INVALID_JSON: 422,
};

function sanitize(text: string, limitations: string[]): string {
  if (!text) return '';
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter(
    (s) => !containsForbiddenClaim(s) && !/examiner|guarantee|\bband\b/i.test(s),
  );
  if (kept.length !== sentences.length) {
    limitations.push(
      'FORBIDDEN_CLAIM_FILTERED: score/band/examiner wording was removed from the explanation.',
    );
  }
  return kept.join(' ').trim();
}

export async function explainIeltsMistake(
  input: IeltsMistakeExplanationInput,
  deps: IeltsMistakeExplanationDeps = {},
): Promise<IeltsMistakeExplanationOutcome> {
  const explain = deps.explain ?? explainIeltsMistakeWithAI;

  // ---- Ownership + state (never leak other users' attempts) ----------------
  const attempt = await ieltsRepo.findAttemptById(input.attemptId);
  if (!attempt) return { ok: false, status: 404, error: 'Attempt not found' };
  if (attempt.userId !== input.userId) {
    return { ok: false, status: 403, error: 'You cannot view this attempt' };
  }
  if (attempt.status !== 'SUBMITTED') {
    return { ok: false, status: 409, error: 'ATTEMPT_NOT_SUBMITTED' };
  }

  // ---- Only incorrect objective responses are eligible ---------------------
  const response = await ieltsRepo.findResponseForQuestion(input.attemptId, input.questionId);
  if (!response) return { ok: false, status: 404, error: 'NO_RESPONSE_FOR_QUESTION' };
  if (response.verdict !== 'incorrect') {
    return { ok: false, status: 409, error: 'NOT_AN_INCORRECT_ANSWER' };
  }

  const row = await ieltsRepo.getQuestionById(input.questionId);
  if (!row || row.testId !== attempt.testId) {
    return { ok: false, status: 404, error: 'Question not found' };
  }
  // Eligibility (2026-10-03 VII): catalogue questions must be PUBLISHED;
  // INSTANT self-study questions (QA_REQUIRED/HUMAN_APPROVED) are eligible for
  // their owner only. The explanation stays advisory in both cases.
  const test = await ieltsRepo.getTestById(attempt.testId);
  const isCatalogued = row.validationStatus === 'PUBLISHED';
  const isOwnedInstant =
    test?.origin === 'INSTANT' &&
    test.ownerUserId === input.userId &&
    row.validationStatus !== 'DRAFT' &&
    row.validationStatus !== 'REJECTED';
  if (!isCatalogued && !isOwnedInstant) {
    return { ok: false, status: 404, error: 'Question not found' };
  }
  const section = row.sectionId ? await ieltsRepo.getSectionById(row.sectionId) : null;

  const answerKeyRaw = parseJson<IeltsAnswerKey | undefined>(row.answerKey, undefined);
  const correctAnswer = Array.isArray(answerKeyRaw)
    ? answerKeyRaw.join(' / ')
    : String(answerKeyRaw ?? '');
  const acceptedAnswers = parseJson<string[] | undefined>(row.acceptedAnswers, undefined) ?? [];
  const options = parseJson<unknown>(row.options, undefined);

  // ---- AI call (advisory) ---------------------------------------------------
  const aiResult = await explain({
    skill: row.skill === 'LISTENING' ? 'LISTENING' : 'READING',
    questionType: row.questionType,
    prompt: row.prompt,
    options,
    correctAnswer,
    acceptedAnswers,
    itemExplanation: row.explanation,
    studentAnswer: response.rawAnswer,
    passageText: section?.passageText ? section.passageText.slice(0, IELTS_EXPLANATION_MAX_CONTENT_CHARS) : null,
    transcriptText: section?.transcriptText
      ? section.transcriptText.slice(0, IELTS_EXPLANATION_MAX_CONTENT_CHARS)
      : null,
    language: input.language === 'zh' ? 'zh' : 'en',
  });

  if (!aiResult.ok) {
    emitIeltsEvent(eventForAiFailure(aiResult.failure), {
      userId: input.userId,
      attemptId: input.attemptId,
      questionId: input.questionId,
      code: aiResult.failure,
      durationMs: aiResult.durationMs,
    });
    return {
      ok: false,
      status: FAILURE_STATUS[aiResult.failure] ?? 502,
      error: aiResult.failure,
      message: aiResult.error,
    };
  }

  const limitations = [
    'AI-assisted explanation — advisory only; it never changes your mark (scoring is deterministic and server-side).',
  ];
  if (isOwnedInstant) {
    limitations.push(
      'This item is from INSTANT self-study practice (AI-generated; automated gates only — NOT reviewed by a teacher).',
    );
  }
  const explanation = sanitize(aiResult.data.explanation, limitations);
  const misconception = sanitize(aiResult.data.misconception, limitations);
  const tip = sanitize(aiResult.data.tip, limitations);
  if (!explanation && !misconception && !tip) {
    // Everything was filtered — never surface a fabricated/empty explanation.
    return { ok: false, status: 422, error: 'AI_OUTPUT_FILTERED' };
  }

  emitIeltsEvent('ielts.mistake.explained', {
    userId: input.userId,
    attemptId: input.attemptId,
    questionId: input.questionId,
    durationMs: aiResult.durationMs,
    promptVersion: aiResult.promptVersion,
    provider: aiResult.provider ?? undefined,
  });

  return {
    ok: true,
    data: {
      questionId: input.questionId,
      explanation,
      misconception,
      tip,
      limitations,
      promptVersion: aiResult.promptVersion,
      provider: aiResult.provider,
      durationMs: aiResult.durationMs,
    },
  };
}
