// ============================================
// 2026-10-03 (II): Speaking PREPARATION Service
// ============================================
// Product decision: the platform does NOT score Speaking, does NOT simulate an
// examiner, and does NOT judge pronunciation. This service generates a
// preparation plan from a topic/cue card + optional student notes, screens all
// coaching text, and NEVER surfaces band/score fields.
//
// Failure discipline matches the writing pipeline: typed failures are persisted
// as FAILED rows and never become a "successful" empty result.
// ============================================

import {
  prepareIeltsSpeakingWithAI,
  type IeltsSpeakingPrepAiResult,
} from '@/modules/ai';
import type { IeltsFailureCode, IeltsSpeakingPartType } from '../domain/types';
import { IELTS_SPEAKING_PARTS } from '../speaking/criteria';
import { findSpeakingTopicById } from '../speaking/topic-bank';
import { IELTS_SPEAKING_PREP_LIMITATIONS } from '../speaking/strategies';
import { containsForbiddenClaim } from '../governance/states';
import { emitIeltsEvent } from '../governance/events';
import * as ieltsRepo from '../repositories/ielts-repo';

// ============================================
// Types
// ============================================

export interface IeltsSpeakingPrepInput {
  userId: string;
  part: IeltsSpeakingPartType;
  topicPrompt: string;
  /** Optional: the student's own notes / real experience to build upon. */
  studentNotes?: string;
  /** Optional: a platform topic-bank entry whose teaching notes enrich the prompt. */
  topicId?: string;
  attemptId?: string | null;
}

export interface IeltsSpeakingPrepResult {
  part: IeltsSpeakingPartType;
  /** Fixed marker: this output contains NO score of any kind. */
  kind: 'PREPARATION_ONLY';
  notice: 'NO_SPEAKING_SCORE_OFFERED';
  plan: { focus: string; steps: string[] };
  outline: Array<{ facet: string; ideas: string[] }>;
  usefulLanguage: Array<{ item: string; example: string; usage: string }>;
  pitfalls: string[];
  followUpQuestions: string[];
  mergeSuggestions: Array<{ theme: string; suggestion: string }>;
  limitations: string[];
  promptVersion: string;
  promptHash: string;
  provider: string | null;
  durationMs: number;
}

export type IeltsSpeakingPrepOutcome =
  | { ok: true; assessmentId: string | null; result: IeltsSpeakingPrepResult }
  | { ok: false; assessmentId: string | null; failureCode: IeltsFailureCode; message: string };

export interface IeltsSpeakingPrepDeps {
  prepare?: (input: Parameters<typeof prepareIeltsSpeakingWithAI>[0]) => Promise<IeltsSpeakingPrepAiResult>;
  persist?: (data: Parameters<typeof ieltsRepo.createAssessment>[0]) => Promise<{ id: string }>;
}

const MAX_NOTES_CHARS = 4_000;
const MIN_USABLE_SECTIONS = 3;

// ============================================
// Main entry
// ============================================

export async function prepareIeltsSpeaking(
  input: IeltsSpeakingPrepInput,
  deps: IeltsSpeakingPrepDeps = {},
): Promise<IeltsSpeakingPrepOutcome> {
  const prepare = deps.prepare ?? prepareIeltsSpeakingWithAI;
  const persist =
    deps.persist ??
    (async (data: Parameters<typeof ieltsRepo.createAssessment>[0]) => {
      const row = await ieltsRepo.createAssessment(data);
      return { id: row.id };
    });

  const partConfig = IELTS_SPEAKING_PARTS[input.part];
  if (!partConfig) {
    return {
      ok: false,
      assessmentId: null,
      failureCode: 'INVALID_QUESTION',
      message: `Unknown speaking part ${input.part}`,
    };
  }
  if (!input.topicPrompt?.trim()) {
    return {
      ok: false,
      assessmentId: null,
      failureCode: 'INVALID_QUESTION',
      message: 'A topic / task card / question set is required.',
    };
  }

  emitIeltsEvent('ielts.speaking.prep.started', {
    userId: input.userId,
    taskType: input.part,
    attemptId: input.attemptId ?? undefined,
  });

  const topicEntry = input.topicId ? findSpeakingTopicById(input.topicId) : null;
  const platformNotes = topicEntry
    ? [
        `Preparation pointers: ${topicEntry.prepPointers.join(' | ')}`,
        `Language functions to teach: ${topicEntry.languageFunctions
          .map((f) => `${f.function} (${f.examples.join(' / ')})`)
          .join(' | ')}`,
        `Known pitfalls: ${topicEntry.pitfalls.join(' | ')}`,
      ].join('\n')
    : undefined;

  const aiResult = await prepare({
    partLabel: partConfig.labelEn,
    partDescription: partConfig.description,
    topicPrompt: input.topicPrompt,
    studentNotes: input.studentNotes ? input.studentNotes.slice(0, MAX_NOTES_CHARS) : undefined,
    platformNotes,
  });

  if (!aiResult.ok) {
    return failPersisted(persist, input, {
      failureCode: aiResult.failure,
      message: aiResult.error,
      provider: aiResult.provider,
      promptVersion: aiResult.promptVersion,
      promptHash: aiResult.promptHash,
      durationMs: aiResult.durationMs,
    });
  }

  const data = aiResult.data;
  const limitations = [...IELTS_SPEAKING_PREP_LIMITATIONS];

  // ---- Screen EVERY coaching string (no scores / bands / examiner claims) ----
  const sanitizePrep = (text: string): string => {
    if (!text) return '';
    const sentences = text.split(/(?<=[.!?])\s+/);
    const kept = sentences.filter((s) => {
      if (containsForbiddenClaim(s) || /examiner|guarantee/i.test(s)) return false;
      if (/\bband\b|\bscore\b|\bscoring\b|\bmarks?\b|\bgrade\b/i.test(s)) return false;
      return true;
    });
    if (kept.length !== sentences.length) {
      limitations.push('SCORE_LANGUAGE_FILTERED: text containing score/band/examiner wording was removed from the preparation plan.');
    }
    return kept.join(' ').trim();
  };
  const sanitizeList = (items: string[] | undefined): string[] =>
    (items ?? []).map(sanitizePrep).filter((s) => s.trim().length > 0);

  const plan = {
    focus: sanitizePrep(data.plan?.focus ?? ''),
    steps: sanitizeList(data.plan?.steps),
  };
  const outline = (data.outline ?? [])
    .map((o) => ({ facet: sanitizePrep(o.facet), ideas: sanitizeList(o.ideas) }))
    .filter((o) => o.facet.length > 0);
  const usefulLanguage = (data.usefulLanguage ?? [])
    .map((l) => ({
      item: sanitizePrep(l.item),
      example: sanitizePrep(l.example),
      usage: sanitizePrep(l.usage),
    }))
    .filter((l) => l.item.length > 0);
  const pitfalls = sanitizeList(data.pitfalls);
  const followUpQuestions = sanitizeList(data.followUpQuestions).filter((q) => q.includes('?') || q.length > 12);
  const mergeSuggestions = (data.mergeSuggestions ?? [])
    .map((m) => ({ theme: sanitizePrep(m.theme), suggestion: sanitizePrep(m.suggestion) }))
    .filter((m) => m.theme.length > 0 && m.suggestion.length > 0);

  const usableSections = [
    plan.steps.length > 0 || plan.focus.length > 0,
    outline.length > 0,
    usefulLanguage.length > 0,
    followUpQuestions.length > 0,
  ].filter(Boolean).length;
  if (usableSections < MIN_USABLE_SECTIONS) {
    return failPersisted(persist, input, {
      failureCode: 'AI_INVALID_JSON',
      message: `Preparation output is unusable after screening (only ${usableSections} usable section(s)).`,
      provider: aiResult.provider,
      promptVersion: aiResult.promptVersion,
      promptHash: aiResult.promptHash,
      durationMs: aiResult.durationMs,
    });
  }

  const result: IeltsSpeakingPrepResult = {
    part: input.part,
    kind: 'PREPARATION_ONLY',
    notice: 'NO_SPEAKING_SCORE_OFFERED',
    plan,
    outline,
    usefulLanguage,
    pitfalls,
    followUpQuestions,
    mergeSuggestions,
    limitations,
    promptVersion: aiResult.promptVersion,
    promptHash: aiResult.promptHash,
    provider: aiResult.provider,
    durationMs: aiResult.durationMs,
  };

  let assessmentId: string | null = null;
  try {
    const persisted = await persist({
      user: { connect: { id: input.userId } },
      ...(input.attemptId ? { attempt: { connect: { id: input.attemptId } } } : {}),
      skill: 'SPEAKING',
      taskType: input.part,
      promptVersion: aiResult.promptVersion,
      assessmentSource: 'AI_ESTIMATE',
      confidence: 'NOT_CALIBRATED',
      status: 'COMPLETED',
      // No Speaking score exists — null, never a fabricated number.
      estimatedBand: null,
      languageBandEstimate: null,
      criteria: null,
      prepContent: JSON.stringify({ ...result, sourceTopicId: topicEntry?.id ?? null }),
      limitations: JSON.stringify(limitations),
      provider: aiResult.provider ?? undefined,
      usage: JSON.stringify({ costStatus: 'UNKNOWN' }),
      promptHash: aiResult.promptHash,
      durationMs: aiResult.durationMs,
    });
    assessmentId = persisted.id;
  } catch {
    limitations.push('PREP_NOT_PERSISTED: the session could not be stored.');
  }

  emitIeltsEvent('ielts.speaking.prep.completed', {
    userId: input.userId,
    taskType: input.part,
    assessmentId: assessmentId ?? undefined,
    promptVersion: aiResult.promptVersion,
    durationMs: aiResult.durationMs,
    provider: aiResult.provider ?? undefined,
  });

  return { ok: true, assessmentId, result };
}

// ============================================
// Helpers
// ============================================

async function failPersisted(
  persist: (data: Parameters<typeof ieltsRepo.createAssessment>[0]) => Promise<{ id: string }>,
  input: IeltsSpeakingPrepInput,
  failure: {
    failureCode: IeltsFailureCode;
    message: string;
    provider: string | null;
    promptVersion: string;
    promptHash: string;
    durationMs: number;
  },
): Promise<IeltsSpeakingPrepOutcome> {
  emitIeltsEvent('ielts.speaking.prep.failed', {
    userId: input.userId,
    taskType: input.part,
    attemptId: input.attemptId ?? undefined,
    code: failure.failureCode,
    durationMs: failure.durationMs,
  });
  let assessmentId: string | null = null;
  try {
    const persisted = await persist({
      user: { connect: { id: input.userId } },
      ...(input.attemptId ? { attempt: { connect: { id: input.attemptId } } } : {}),
      skill: 'SPEAKING',
      taskType: input.part,
      promptVersion: failure.promptVersion || 'UNKNOWN',
      assessmentSource: 'AI_ESTIMATE',
      confidence: 'NOT_CALIBRATED',
      status: 'FAILED',
      failureCode: failure.failureCode,
      limitations: JSON.stringify([`FAILED: ${failure.failureCode}`]),
      provider: failure.provider ?? undefined,
      usage: JSON.stringify({ costStatus: 'UNKNOWN' }),
      promptHash: failure.promptHash || undefined,
      durationMs: failure.durationMs,
    });
    assessmentId = persisted.id;
  } catch {
    assessmentId = null;
  }
  return { ok: false, assessmentId, failureCode: failure.failureCode, message: failure.message };
}
