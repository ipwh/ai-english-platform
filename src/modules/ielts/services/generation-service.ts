// ============================================
// 2026-10-03 PHASE IELTS-01 (IV): AI Generation Service
// ============================================
// The ONLY path by which AI-authored content enters the IELTS subsystem.
//
//   generate (DeepSeek via canonical pipeline)
//     → deterministic machine screen  (question-validator.ts — zero AI)
//     → independent BLIND-SOLVE verification (answer keys never sent)
//     → persist at QA_REQUIRED (DRAFT test)
//     → HUMAN_APPROVED → PUBLISHED (admin only — AI can never publish)
//
// Hard rules enforced here:
//   * one numbered question = one answer = one mark (multi-answer items dropped)
//   * reading evidence quotes must be EXACT substrings (spans recomputed by
//     indexOf, never trusted from the model)
//   * listening: completion answers verbatim; MC/matching: the correct option
//     TEXT must be supported by the transcript (validator re-checks all)
//   * verified items that fail ANY gate are dropped and reported — never
//     silently delivered
//   * nothing is persisted unless at least one item passed every gate
//   * shortfall is reported honestly (requested vs delivered)
// ============================================

import {
  extendIeltsSectionWithAI,
  generateIeltsQuestionSetWithAI,
  verifyIeltsItemsWithAI,
  generateIeltsWritingPromptWithAI,
  verifyIeltsWritingPromptWithAI,
} from '@/modules/ai';
import type {
  IeltsTestType,
} from '../domain/types';
import {
  IELTS_DIFFICULTY_MODEL_VERSION,
  isIeltsMcType,
  isIeltsMatchingType,
  resolveIeltsQuestionType,
  type IeltsDifficulty,
  type IeltsEvidenceSpan,
  type IeltsItemEvidence,
  type IeltsOption,
  type IeltsQuestionDefinition,
  type IeltsQuestionType,
  type IeltsWordLimit,
} from '../domain/types';
import { countIeltsWords } from '../domain/word-count';
import { normalizeIeltsAnswer, stripOptionPrefix } from '../domain/normalization';
import { difficultyForTargetBand, type IeltsTargetBand } from '../domain/difficulty';
import { scoreIeltsItem, extractOptionPairs, type IeltsScorableItem } from '../scoring/objective-scorer';
import {
  emptyBatchContext,
  validateIeltsQuestion,
  type IeltsBatchContext,
} from '../validation/question-validator';
import { applyTransition } from '../validation/pipeline';
import { emitIeltsEvent } from '../governance/events';
import * as ieltsRepo from '../repositories/ielts-repo';
import { IELTS_WRITING_TASKS } from '../writing/criteria';
import type { IeltsWritingTaskType } from '../domain/types';
import { IELTS_WRITING_TASK_TYPES } from '../domain/types';

// ============================================
// Constants
// ============================================

export const IELTS_GENERATION_GENERATOR_VERSION = 'ielts-ai-gen-v1';
export const IELTS_GENERATION_MIN_SET_ITEMS = 3;
export const IELTS_GENERATION_MAX_READING_SET_ITEMS = 14;
export const IELTS_GENERATION_MAX_LISTENING_SET_ITEMS = 10;
/** One generation attempt per set, plus one top-up attempt when nothing survives. */
export const IELTS_GENERATION_MAX_ATTEMPTS_PER_SET = 2;
/**
 * Top-up rounds per ACCEPTED section (2026-10-08): a section's passage/transcript is
 * fixed once accepted, so a short section is filled by asking for MORE questions about
 * that same text — never by re-running the set generator (which authors a new text).
 * Bounded because every round costs one generation + one blind-solve verification.
 * Measured 2026-10-08: with 2 rounds reading reached 40/40 but listening stopped at
 * 37–39/40; with 3 rounds the final verification run reached 40/40 for BOTH components
 * (reading 77s, listening 103s). The residual gap is the unchanged verbatim-transcript
 * gate, which still destroys 13–27 listening items per run — hence the honest shortfall
 * path rather than a relaxed gate.
 */
export const IELTS_SECTION_TOPUP_MAX_ROUNDS = 3;
/**
 * Wall-clock budget for top-up rounds within one generation request (2026-10-08).
 *
 * Why this exists: content is persisted only after EVERY section is finished, so a
 * Cloud Run timeout (900s) would discard the whole component — worse than a small
 * shortfall. Provider latency is genuinely variable (the same 5-item set was measured at
 * 12s and at 146s), so top-ups stop once the elapsed time exceeds this budget and the
 * request returns with an honest shortfall instead of risking a total loss. The budget is
 * generous relative to the measured 62–100s end-to-end times.
 */
export const IELTS_GENERATION_TOPUP_TIME_BUDGET_MS = 240_000;
/** Official full-component shapes (40 questions). */
export const IELTS_FULL_COMPONENT_TARGETS: Record<'READING' | 'LISTENING', number[]> = {
  READING: [13, 13, 14],
  LISTENING: [10, 10, 10, 10],
};

const READING_ALLOWED_TYPES = new Set<string>([
  'reading_multiple_choice',
  'reading_true_false_not_given',
  'reading_yes_no_not_given',
  'reading_matching_information',
  'reading_matching_headings',
  'reading_matching_features',
  'reading_matching_sentence_endings',
  'reading_sentence_completion',
  'reading_summary_note_table_flowchart_completion',
  'reading_diagram_label_completion',
  'reading_short_answer',
]);

const LISTENING_ALLOWED_TYPES = new Set<string>([
  'listening_multiple_choice',
  'listening_matching',
  'listening_plan_map_diagram_labelling',
  'listening_form_note_table_flowchart_completion',
  'listening_sentence_completion',
  'listening_short_answer',
]);

// Single owner: domain/types.ts (2026-10-03 XII).
const WRITING_TASK_TYPES: readonly IeltsWritingTaskType[] = IELTS_WRITING_TASK_TYPES;

// ============================================
// Public input / outcome types
// ============================================

export type IeltsGenerationSkill = 'READING' | 'LISTENING';

export interface IeltsGenerationInput {
  userId: string;
  skill: IeltsGenerationSkill;
  testType: IeltsTestType;
  /** 'set' = one section (default); 'full_component' = official 40-question shape. */
  scope?: 'set' | 'full_component';
  /** Required for scope 'set' (3–14 reading / 3–10 listening). */
  count?: number;
  sectionLabel?: string;
  itemTypes?: string[];
  difficulty?: IeltsDifficulty;
  /**
   * Platform authoring heuristic (TARGET_BAND_4–9), mapped deterministically to
   * the difficulty buckets; NOT an item-difficulty claim (domain/difficulty.ts).
   */
  targetBand?: IeltsTargetBand;
  topicHint?: string;
  /**
   * 'CATALOGUE' (default): teacher-reviewed catalogue content.
   * 'INSTANT': on-demand self-study set owned by the requesting student —
   * owner-only delivery, never listed in the catalogue. The persisted state is
   * UNCHANGED (DRAFT test + QA_REQUIRED questions): instant delivery is not
   * publication, and graduation still requires the normal human review path.
   */
  deliveryMode?: 'CATALOGUE' | 'INSTANT';
}

export interface IeltsGenerationSetSummary {
  label: string;
  itemCount: number;
  contentWords: number | null;
}

export interface IeltsGenerationDrops {
  reason: string;
  count: number;
}

export type IeltsGenerationOutcome =
  | {
      ok: true;
      testId: string;
      testStatus: 'DRAFT';
      skill: IeltsGenerationSkill;
      testType: IeltsTestType;
      requestedCount: number;
      deliveredCount: number;
      shortfall: number;
      sets: IeltsGenerationSetSummary[];
      drops: IeltsGenerationDrops[];
      durationMs: number;
    }
  | {
      ok: false;
      code:
        | 'INVALID_INPUT'
        | 'GENERATION_EMPTY'
        | 'AI_PROVIDER_TIMEOUT'
        | 'AI_PROVIDER_ERROR'
        | 'AI_INVALID_JSON';
      message: string;
    };

export type IeltsWritingGenerationOutcome =
  | {
      ok: true;
      testId: string;
      testStatus: 'DRAFT';
      taskType: IeltsWritingTaskType;
      testType: IeltsTestType;
      durationMs: number;
    }
  | {
      ok: false;
      code:
        | 'INVALID_INPUT'
        | 'WRITING_PROMPT_NOT_CONFORMING'
        | 'AI_PROVIDER_TIMEOUT'
        | 'AI_PROVIDER_ERROR'
        | 'AI_INVALID_JSON';
      message: string;
      issues?: string[];
    };

// ============================================
// Internal prepared item
// ============================================

interface PreparedItem {
  tempId: string;
  questionType: string;
  prompt: string;
  options: IeltsOption[] | string[] | null;
  answerKey: string;
  acceptedAnswers: string[];
  wordLimit: IeltsWordLimit | null;
  evidence: IeltsItemEvidence;
  explanation: string;
  difficulty: IeltsDifficulty;
  scorable: IeltsScorableItem;
}

interface PreparedSet {
  label: string;
  passage: string | null;
  transcript: string | null;
  contentWords: number | null;
  items: PreparedItem[];
}

// ============================================
// Helpers
// ============================================

function normalizePrompt(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Recompute a span by deterministic search — the model NEVER supplies offsets. */
function findSpan(text: string, quote: string): IeltsEvidenceSpan | null {
  const q = quote.trim();
  if (!q) return null;
  let idx = text.indexOf(q);
  if (idx < 0) idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return null;
  return { start: idx, end: idx + q.length, text: text.slice(idx, idx + q.length) };
}

function toKeyArray(key: string | string[]): string[] {
  return Array.isArray(key) ? key.map(String) : [String(key)];
}

/**
 * Code-family answer keys must be OPTION CODES (validator: MC_KEY_NOT_IN_OPTIONS;
 * scorer: MC_LETTER_MATCH). The generation prompt asks for the correct option, and the
 * model reliably answers with the option TEXT instead of its letter — every such item was
 * rejected before this conversion (measured 2026-10-08: 11 of 13 listening MC items).
 * Conversion is deterministic and only happens on an UNAMBIGUOUS match of exactly one
 * option (same policy as scoreCodeAnswer's full-text match); anything else is left
 * untouched so the validator rejects it (fail-closed).
 */
function canonicalizeCodeAnswerKey(
  answerKey: string,
  canonicalType: IeltsQuestionType,
  pairs: Array<{ code: string; text: string }>,
): string {
  if (pairs.length === 0) return answerKey;
  const isCodeFamily =
    isIeltsMcType(canonicalType) ||
    isIeltsMatchingType(canonicalType) ||
    canonicalType === 'listening_plan_map_diagram_labelling';
  if (!isCodeFamily) return answerKey;
  const keyText = normalizeIeltsAnswer(answerKey);
  const matches = pairs.filter(
    (p) => normalizeIeltsAnswer(p.text) === keyText || normalizeIeltsAnswer(stripOptionPrefix(p.text)) === keyText,
  );
  return matches.length === 1 ? matches[0].code : answerKey;
}

function aggregateDrops(drops: Map<string, number>): IeltsGenerationDrops[] {
  return [...drops.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

// ============================================
// Item screening (machine screen + batch dedupe)
// ============================================

function screenGeneratedItems(args: {
  rawQuestions: Array<{
    questionType: string;
    prompt: string;
    options?: unknown;
    answerKey: string | string[];
    acceptedAnswers?: string[];
    wordLimit?: IeltsWordLimit | null;
    evidenceQuotes?: string[];
    evidenceReasoning?: string;
    expectedAnswer?: string;
    transcriptQuote?: string;
    explanation?: string;
    difficulty?: IeltsDifficulty;
  }>;
  skill: IeltsGenerationSkill;
  testType: IeltsTestType;
  passage: string | null;
  transcript: string | null;
  allowedTypes?: string[] | undefined;
  batch: IeltsBatchContext;
  seenPrompts: Set<string>;
  drops: Map<string, number>;
}): PreparedItem[] {
  const { skill, passage, transcript, batch, seenPrompts, drops } = args;
  const allowed = skill === 'READING' ? READING_ALLOWED_TYPES : LISTENING_ALLOWED_TYPES;
  // 題型名稱以正典（帶技能前綴）為準：AI 提示詞使用的是不帶前綴的官方名稱，
  // 兩者必須經 resolveIeltsQuestionType() 這個唯一 owner 對照（2026-10-08 事故：
  // 缺此對照 ⇒ 每一題都被判 QUESTION_TYPE_NOT_ALLOWED／ungradable ⇒ 全軍覆沒）。
  const requestedTypes = args.allowedTypes && args.allowedTypes.length > 0
    ? new Set(
        args.allowedTypes
          .map((t) => resolveIeltsQuestionType(skill, t))
          .filter((t): t is IeltsQuestionType => !!t),
      )
    : null;
  const prepared: PreparedItem[] = [];

  const drop = (reason: string) => drops.set(reason, (drops.get(reason) ?? 0) + 1);

  args.rawQuestions.forEach((raw, index) => {
    const tempId = `q${index + 1}`;
    const canonicalType = resolveIeltsQuestionType(skill, raw.questionType);
    if (!canonicalType || !allowed.has(canonicalType)) return drop('QUESTION_TYPE_NOT_ALLOWED');
    if (requestedTypes && !requestedTypes.has(canonicalType)) return drop('QUESTION_TYPE_NOT_REQUESTED');

    const keys = toKeyArray(raw.answerKey);
    // Official numbering: one numbered question = one answer = one mark.
    if (keys.length !== 1 || !keys[0].trim()) return drop('MULTI_ANSWER_NOT_OFFICIAL');
    const options = (raw.options as IeltsOption[] | string[] | undefined) ?? null;
    const pairs = extractOptionPairs(options);
    const answerKey = canonicalizeCodeAnswerKey(keys[0].trim(), canonicalType, pairs);

    const promptKey = normalizePrompt(raw.prompt);
    if (!promptKey) {
      drop('EMPTY_PROMPT');
      return;
    }
    if (seenPrompts.has(promptKey)) {
      drop('DUPLICATE_OF_RECENT');
      return;
    }

    // ---- Evidence (skill-specific) -------------------------------------
    let evidence: IeltsItemEvidence;
    if (skill === 'READING') {
      if (!passage) return drop('MISSING_PASSAGE');
      const quotes = (raw.evidenceQuotes ?? []).filter((q) => q.trim().length > 0);
      const spans = quotes
        .map((q) => findSpan(passage, q))
        .filter((s): s is IeltsEvidenceSpan => s !== null);
      if (spans.length === 0) return drop('EVIDENCE_QUOTE_NOT_FOUND');
      evidence = {
        passageId: 'generated-section',
        evidenceSpans: spans,
        reasoning: raw.evidenceReasoning?.trim() || 'Generated evidence span.',
        answerType: canonicalType,
      };
    } else {
      if (!transcript) return drop('MISSING_TRANSCRIPT');
      const usesOptionCodes =
        pairs.length > 0 &&
        (canonicalType === 'listening_multiple_choice' ||
          canonicalType === 'listening_matching' ||
          canonicalType === 'listening_plan_map_diagram_labelling');
      // For code families the validator checks the correct OPTION TEXT; supply it.
      const optionText = usesOptionCodes
        ? pairs.find((p) => p.code.trim().toLowerCase() === answerKey.toLowerCase())?.text
        : undefined;
      const expectedAnswer = optionText?.trim() || raw.expectedAnswer?.trim() || answerKey;
      const transcriptSpan = raw.transcriptQuote ? findSpan(transcript, raw.transcriptQuote) : null;
      evidence = {
        expectedAnswer,
        acceptedVariants: (raw.acceptedAnswers ?? []).filter((a) => a.trim().length > 0),
        ...(transcriptSpan ? { transcriptSpan } : {}),
        ...(raw.wordLimit ? { wordLimit: raw.wordLimit } : {}),
      };
    }

    // ---- Machine screen (deterministic; no AI) ---------------------------
    const definition: IeltsQuestionDefinition = {
      id: `pending-${tempId}`,
      testId: 'pending',
      orderIndex: index,
      questionType: canonicalType,
      skill,
      prompt: raw.prompt,
      options: options ?? undefined,
      answerKey,
      acceptedAnswers: raw.acceptedAnswers?.filter((a) => a.trim().length > 0),
      wordLimit: raw.wordLimit ?? undefined,
      evidence,
      explanation: raw.explanation?.trim() || undefined,
      difficulty: raw.difficulty ?? 'MEDIUM',
      difficultyModel: IELTS_DIFFICULTY_MODEL_VERSION,
      contentSource: { type: 'ORIGINAL_GENERATED' },
      generatorVersion: IELTS_GENERATION_GENERATOR_VERSION,
      validationStatus: 'DRAFT',
    };
    const report = validateIeltsQuestion(
      definition,
      { passageText: passage, transcriptText: transcript },
      batch,
    );
    if (!report.ok) {
      const code = report.issues.find((i) => i.severity === 'reject')?.code ?? 'VALIDATOR_REJECT';
      return drop(`VALIDATOR_REJECT:${code}`);
    }

    seenPrompts.add(promptKey);
    prepared.push({
      tempId,
      questionType: canonicalType,
      prompt: raw.prompt,
      options,
      answerKey,
      acceptedAnswers: raw.acceptedAnswers?.filter((a) => a.trim().length > 0) ?? [],
      wordLimit: raw.wordLimit ?? null,
      evidence,
      explanation: raw.explanation?.trim() ?? '',
      difficulty: raw.difficulty ?? 'MEDIUM',
      scorable: {
        questionType: canonicalType,
        options,
        answerKey,
        acceptedAnswers: raw.acceptedAnswers ?? null,
        wordLimit: raw.wordLimit ?? null,
      },
    });
  });

  return prepared;
}

// ============================================
// Blind-solve verification
// ============================================

async function verifyPreparedItems(args: {
  skill: IeltsGenerationSkill;
  passage: string | null;
  transcript: string | null;
  items: PreparedItem[];
  drops: Map<string, number>;
}): Promise<PreparedItem[]> {
  const drop = (reason: string) => args.drops.set(reason, (args.drops.get(reason) ?? 0) + 1);
  if (args.items.length === 0) return [];

  const result = await verifyIeltsItemsWithAI({
    skill: args.skill,
    passage: args.passage,
    transcript: args.transcript,
    items: args.items.map((p) => ({
      questionId: p.tempId,
      questionType: p.questionType,
      prompt: p.prompt,
      options: p.options,
      wordLimit: p.wordLimit,
    })),
  });
  if (!result.ok) {
    // Fail-closed: unverified items are never delivered.
    args.drops.set(`VERIFY_UNAVAILABLE:${result.failure}`, args.items.length);
    return [];
  }

  const byId = new Map(result.data.items.map((i) => [i.questionId, i]));
  const kept: PreparedItem[] = [];
  for (const item of args.items) {
    const verdict = byId.get(item.tempId);
    if (!verdict) {
      drop('VERIFY_MISSING');
      continue;
    }
    if (verdict.soundness === 'ambiguous') {
      drop('VERIFY_AMBIGUOUS');
      continue;
    }
    if (verdict.soundness === 'flawed') {
      drop('VERIFY_FLAWED');
      continue;
    }
    const scored = scoreIeltsItem(verdict.answer, item.scorable);
    if (scored.verdict !== 'correct') {
      drop('VERIFY_ANSWER_MISMATCH');
      continue;
    }
    kept.push(item);
  }
  return kept;
}

// ============================================
// Objective generation (Reading / Listening)
// ============================================

function buildSetPlans(
  input: IeltsGenerationInput,
): Array<{ label: string; target: number }> | { error: string } {
  const maxItems =
    input.skill === 'READING'
      ? IELTS_GENERATION_MAX_READING_SET_ITEMS
      : IELTS_GENERATION_MAX_LISTENING_SET_ITEMS;
  if ((input.scope ?? 'set') === 'full_component') {
    return IELTS_FULL_COMPONENT_TARGETS[input.skill].map((target, index) => ({
      label: input.skill === 'READING' ? `Section ${index + 1}` : `Part ${index + 1}`,
      target,
    }));
  }
  const count = input.count ?? 5;
  if (!Number.isInteger(count) || count < IELTS_GENERATION_MIN_SET_ITEMS || count > maxItems) {
    return {
      error: `count must be an integer between ${IELTS_GENERATION_MIN_SET_ITEMS} and ${maxItems} for a single set.`,
    };
  }
  return [{ label: input.sectionLabel?.trim() || (input.skill === 'READING' ? 'Section 1' : 'Part 1'), target: count }];
}

const COMPONENT_DURATION_MINUTES: Record<IeltsGenerationSkill, number> = {
  READING: 60,
  LISTENING: 40,
};

/**
 * Top up an ACCEPTED section to its official target (2026-10-08).
 *
 * A section's passage/transcript is frozen once accepted — every item must be supported
 * by that exact text — so the deficit is filled by asking for more questions about the
 * SAME text (extendIeltsSectionWithAI). Measured before this existed: an official
 * 40-question component delivered 33 (reading) / 23 (listening) because a section was
 * accepted as soon as ONE item survived and the deficit was never recovered.
 *
 * Invariants kept:
 *   * the new items pass the SAME gates as set generation (machine screen → blind solve)
 *   * items that already passed are NEVER discarded (a failed round or an exhausted
 *     budget stops the top-up and delivers the partial section; shortfall stays honest)
 *   * the section never exceeds its official target (over-asking is trimmed, with a
 *     recorded reason — never silently)
 */
async function topUpSection(args: {
  input: IeltsGenerationInput;
  plan: { label: string; target: number };
  section: PreparedSet;
  difficulty?: IeltsDifficulty | undefined;
  /** Recent prompts plus prompts already used by other sections of this run. */
  baseAvoidPrompts: string[];
  /** Wall-clock deadline for top-up rounds (see IELTS_GENERATION_TOPUP_TIME_BUDGET_MS). */
  deadlineAt: number;
  batch: IeltsBatchContext;
  seenPrompts: Set<string>;
  drops: Map<string, number>;
}): Promise<void> {
  const { input, plan, section, difficulty, batch, seenPrompts, drops } = args;
  const sectionText = (section.passage ?? section.transcript ?? '').trim();
  if (!sectionText) return;
  const maxItems =
    input.skill === 'READING'
      ? IELTS_GENERATION_MAX_READING_SET_ITEMS
      : IELTS_GENERATION_MAX_LISTENING_SET_ITEMS;
  let rejectionNotes: string[] = [];

  const record = (reason: string, by = 1) => drops.set(reason, (drops.get(reason) ?? 0) + by);

  for (let round = 0; round < IELTS_SECTION_TOPUP_MAX_ROUNDS; round++) {
    const deficit = plan.target - section.items.length;
    if (deficit <= 0) return;
    if (Date.now() > args.deadlineAt) {
      // Out of time: a shortfall is strictly better than risking a request timeout that
      // would discard every section (content is persisted only at the very end).
      record('TOPUP_DEADLINE');
      return;
    }
    // Over-ask a little: the gates are strict, so asking for exactly the deficit rarely
    // fills it. Anything extra that passes is trimmed back to the official target below.
    const requestCount = Math.min(deficit + Math.max(1, Math.ceil(deficit / 2)), maxItems);

    let extension: Awaited<ReturnType<typeof extendIeltsSectionWithAI>>;
    try {
      extension = await extendIeltsSectionWithAI({
        skill: input.skill,
        testType: input.testType,
        sectionLabel: plan.label,
        itemCount: requestCount,
        itemTypes: input.itemTypes,
        difficulty,
        sectionText,
        avoidPrompts: [...args.baseAvoidPrompts, ...section.items.map((i) => i.prompt)],
        rejectionNotes,
      });
    } catch {
      // A budget/provider failure here must NOT throw away items that already passed
      // every gate: stop topping up, deliver the partial section, keep shortfall honest.
      record('TOPUP_ABORTED');
      return;
    }
    if (!extension.ok) {
      record(`TOPUP_${extension.failure}`);
      return;
    }

    const dropsBefore = new Map(drops);
    const candidates = screenGeneratedItems({
      rawQuestions: extension.data.questions,
      skill: input.skill,
      testType: input.testType,
      passage: section.passage,
      transcript: section.transcript,
      allowedTypes: input.itemTypes,
      batch,
      seenPrompts,
      drops,
    });
    const verified = await verifyPreparedItems({
      skill: input.skill,
      passage: section.passage,
      transcript: section.transcript,
      items: candidates,
      drops,
    });
    // Feed this round's rejections into the next round's prompt.
    rejectionNotes = [...drops.entries()]
      .filter(([reason, count]) => count > (dropsBefore.get(reason) ?? 0))
      .map(([reason, count]) => `${reason} (${count - (dropsBefore.get(reason) ?? 0)})`)
      .slice(0, 8);

    section.items.push(...verified);

    const excess = section.items.length - plan.target;
    if (excess > 0) {
      section.items.splice(plan.target, excess);
      record('TOPUP_TRIMMED', excess);
      return;
    }
  }
}

export async function generateIeltsPracticeContent(
  input: IeltsGenerationInput,
): Promise<IeltsGenerationOutcome> {
  const started = Date.now();
  const plans = buildSetPlans(input);
  if ('error' in plans) {
    return { ok: false, code: 'INVALID_INPUT', message: plans.error };
  }
  if (input.itemTypes && input.itemTypes.length > 0) {
    const allowed = input.skill === 'READING' ? READING_ALLOWED_TYPES : LISTENING_ALLOWED_TYPES;
    for (const t of input.itemTypes) {
      // Resolve through the single owner: callers may use either the prompt vocabulary
      // (unprefixed official names) or the canonical prefixed names. Unknown types stay
      // a hard 400-class failure (fail-closed) — never silently ignored.
      const resolved = resolveIeltsQuestionType(input.skill, t);
      if (!resolved || !allowed.has(resolved)) {
        return { ok: false, code: 'INVALID_INPUT', message: `Unsupported item type for ${input.skill}: ${t}` };
      }
    }
  }

  // TARGET_BAND authoring labels map to difficulty buckets (platform heuristic).
  let effectiveDifficulty = input.difficulty;
  if (input.targetBand !== undefined) {
    const mapped = difficultyForTargetBand(input.targetBand);
    if (!mapped) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        message: `Unsupported targetBand: ${String(input.targetBand)}`,
      };
    }
    effectiveDifficulty = mapped;
  }

  emitIeltsEvent('ielts.generation.started', {
    userId: input.userId,
    skill: input.skill,
    taskType: input.testType,
    code: input.scope ?? 'set',
  });

  // Dedupe material (recent content must not repeat).
  const [recentPrompts, recentTexts] = await Promise.all([
    ieltsRepo.listRecentQuestionPromptsBySkill(input.skill, 200),
    ieltsRepo.listRecentSectionTextsBySkill(input.skill, 12),
  ]);
  const avoidPrompts = recentPrompts.map((r) => r.prompt);
  const avoidTexts = recentTexts
    .map((r) => (r.passageText ?? r.transcriptText ?? '').slice(0, 160))
    .filter((t) => t.trim().length > 0);

  const batch = emptyBatchContext();
  const seenPrompts = new Set(avoidPrompts.map(normalizePrompt));
  const drops = new Map<string, number>();
  const sets: PreparedSet[] = [];

  for (const plan of plans) {
    let preparedSet: PreparedSet | null = null;
    let rejectionNotes: string[] = [];

    for (let attempt = 0; attempt < IELTS_GENERATION_MAX_ATTEMPTS_PER_SET; attempt++) {
      const generated = await generateIeltsQuestionSetWithAI({
        skill: input.skill,
        testType: input.testType,
        sectionLabel: plan.label,
        itemCount: plan.target,
        itemTypes: input.itemTypes,
        difficulty: effectiveDifficulty,
        topicHint: input.topicHint,
        avoidPrompts: [...avoidPrompts, ...sets.flatMap((s) => s.items.map((i) => i.prompt))],
        avoidTexts,
        rejectionNotes,
      });
      if (!generated.ok) {
        if (preparedSet === null && attempt === IELTS_GENERATION_MAX_ATTEMPTS_PER_SET - 1) {
          return {
            ok: false,
            code: generated.failure,
            message: generated.error,
          };
        }
        rejectionNotes = [`GENERATION_FAILED:${generated.failure}`];
        continue;
      }

      const passage = generated.data.passage?.trim() || null;
      const transcript = generated.data.transcript?.trim() || null;
      if (input.skill === 'READING' && !passage) {
        rejectionNotes = ['MISSING_PASSAGE: include a full passage'];
        drops.set('MISSING_PASSAGE', (drops.get('MISSING_PASSAGE') ?? 0) + 1);
        continue;
      }
      if (input.skill === 'LISTENING' && !transcript) {
        rejectionNotes = ['MISSING_TRANSCRIPT: include a full transcript'];
        drops.set('MISSING_TRANSCRIPT', (drops.get('MISSING_TRANSCRIPT') ?? 0) + 1);
        continue;
      }

      const candidateItems = screenGeneratedItems({
        rawQuestions: generated.data.questions,
        skill: input.skill,
        testType: input.testType,
        passage,
        transcript,
        allowedTypes: input.itemTypes,
        batch,
        seenPrompts,
        drops,
      });
      const verified = await verifyPreparedItems({
        skill: input.skill,
        passage,
        transcript,
        items: candidateItems,
        drops,
      });

      if (verified.length > 0) {
        preparedSet = {
          label: plan.label,
          passage,
          transcript,
          contentWords: countIeltsWords(passage ?? transcript),
          items: verified,
        };
        break; // accept the set (partial sets are allowed; shortfall is reported)
      }
      // Nothing survived — tell the next attempt exactly why.
      rejectionNotes = aggregateDrops(drops)
        .slice(0, 8)
        .map((d) => `${d.reason} (${d.count})`);
    }

    if (preparedSet) {
      // The section is accepted, but it may be short of its official target — fill the
      // deficit against the SAME passage/transcript before moving on to the next section.
      await topUpSection({
        input,
        plan,
        section: preparedSet,
        difficulty: effectiveDifficulty,
        baseAvoidPrompts: [...avoidPrompts, ...sets.flatMap((s) => s.items.map((i) => i.prompt))],
        deadlineAt: started + IELTS_GENERATION_TOPUP_TIME_BUDGET_MS,
        batch,
        seenPrompts,
        drops,
      });
      sets.push(preparedSet);
    }
  }

  const requestedCount = plans.reduce((sum, p) => sum + p.target, 0);
  const deliveredCount = sets.reduce((sum, s) => sum + s.items.length, 0);

  if (deliveredCount === 0) {
    emitIeltsEvent('ielts.generation.failed', {
      userId: input.userId,
      skill: input.skill,
      taskType: input.testType,
      code: 'GENERATION_EMPTY',
      durationMs: Date.now() - started,
    });
    return {
      ok: false,
      code: 'GENERATION_EMPTY',
      message: `No item passed the machine screen and blind-solve verification. Drops: ${aggregateDrops(drops)
        .slice(0, 6)
        .map((d) => `${d.reason}×${d.count}`)
        .join(', ')}.`,
    };
  }

  // ---- Governance assertion + persistence --------------------------------
  // The persisted state (QA_REQUIRED) is the guaranteed end state of the
  // DRAFT → AI_VALIDATED → QA_REQUIRED system path; assert it is legal so a
  // future policy change cannot silently turn AI into a publisher.
  const step1 = applyTransition({ from: 'DRAFT', to: 'AI_VALIDATED', actor: 'SYSTEM' });
  const step2 = applyTransition({ from: 'AI_VALIDATED', to: 'QA_REQUIRED', actor: 'SYSTEM' });
  if (!step1.allowed || !step2.allowed) {
    throw new Error('IELTS generation: system validation path is not permitted by the lifecycle.');
  }

  const variantTag = input.testType === 'ACADEMIC' ? 'academic' : 'gt';
  const isInstant = input.deliveryMode === 'INSTANT';
  const contentSource = {
    type: 'ORIGINAL_GENERATED' as const,
    notes: isInstant
      ? 'AI-assisted generation (DeepSeek) — platform-original IELTS-style practice; not official IELTS material. Delivered as INSTANT self-study practice to the requesting student (automated gates only; NOT human-reviewed).'
      : 'AI-assisted generation (DeepSeek) — platform-original IELTS-style practice; not official IELTS material; awaiting human QA review.',
  };
  const shortfall = requestedCount - deliveredCount;
  const setSummaries: IeltsGenerationSetSummary[] = sets.map((set) => ({
    label: set.label,
    itemCount: set.items.length,
    contentWords: set.contentWords,
  }));

  // ONE transaction (2026-10-08): the test row, its sections and its questions
  // are a single logical persistence unit. Written as independent statements a
  // failure part-way through left a half-written test — and an INSTANT test is
  // deliverable at any status except REJECTED, so the student could open a
  // truncated or empty set while the orphaned rows still held a quota slot.
  const { testId: testId } = await ieltsRepo.persistGeneratedTest({
    test: {
      slug: `ai-${input.skill.toLowerCase()}-${variantTag}-${Date.now().toString(36)}`,
      title: `${input.testType === 'ACADEMIC' ? 'Academic' : 'General Training'} ${
        input.skill === 'READING' ? 'Reading' : 'Listening'
      } — AI-generated practice (${deliveredCount} questions)`,
      testType: input.testType,
      skill: input.skill,
      description: 'AI-generated IELTS-style practice (platform original). Machine-screened + blind-solve verified; awaiting human QA before publication.',
      status: 'DRAFT',
      origin: isInstant ? 'INSTANT' : 'CATALOGUE',
      ownerUserId: isInstant ? input.userId : null,
      durationMinutes:
        (input.scope ?? 'set') === 'full_component' ? COMPONENT_DURATION_MINUTES[input.skill] : null,
      contentSource: JSON.stringify(contentSource),
    },
    sections: sets.map((set) => ({
      label: set.label,
      passageText: set.passage,
      transcriptText: set.transcript,
      wordCount: set.contentWords,
      questions: set.items.map((item) => ({
        questionType: item.questionType,
        skill: input.skill,
        prompt: item.prompt,
        options: item.options ? JSON.stringify(item.options) : null,
        answerKey: JSON.stringify(item.answerKey),
        acceptedAnswers: item.acceptedAnswers.length > 0 ? JSON.stringify(item.acceptedAnswers) : null,
        wordLimit: item.wordLimit ? JSON.stringify(item.wordLimit) : null,
        evidence: JSON.stringify(item.evidence),
        explanation: item.explanation || null,
        difficulty: item.difficulty,
        difficultyModel: IELTS_DIFFICULTY_MODEL_VERSION,
        contentSource: JSON.stringify(contentSource),
        generatorVersion: IELTS_GENERATION_GENERATOR_VERSION,
        validationStatus: 'QA_REQUIRED',
      })),
    })),
    validationNotes: JSON.stringify({
      machineScreen: 'PASS',
      blindSolve: 'PASS',
      generatorVersion: IELTS_GENERATION_GENERATOR_VERSION,
      deliveredCount,
      requestedCount,
      shortfall,
      generatedAt: new Date().toISOString(),
    }),
  });

  emitIeltsEvent('ielts.generation.completed', {
    userId: input.userId,
    skill: input.skill,
    taskType: input.testType,
    durationMs: Date.now() - started,
    itemCount: deliveredCount,
    code: shortfall > 0 ? 'DELIVERED_WITH_SHORTFALL' : 'DELIVERED',
  });

  return {
    ok: true,
    testId: testId,
    testStatus: 'DRAFT',
    skill: input.skill,
    testType: input.testType,
    requestedCount,
    deliveredCount,
    shortfall,
    sets: setSummaries,
    drops: aggregateDrops(drops),
    durationMs: Date.now() - started,
  };
}

// ============================================
// Writing task-prompt generation
// ============================================

export interface IeltsWritingGenerationInput {
  userId: string;
  testType: IeltsTestType;
  writingTaskType: IeltsWritingTaskType;
  topicHint?: string;
  /**
   * 'CATALOGUE' (default): teacher-reviewed catalogue content.
   * 'INSTANT': on-demand self-study task owned by the requesting student —
   * owner-only delivery, never listed. Persisted state is UNCHANGED (DRAFT test
   * + QA_REQUIRED question): instant delivery is not publication.
   */
  deliveryMode?: 'CATALOGUE' | 'INSTANT';
}

export async function generateIeltsWritingTask(
  input: IeltsWritingGenerationInput,
): Promise<IeltsWritingGenerationOutcome> {
  const started = Date.now();
  if (!WRITING_TASK_TYPES.includes(input.writingTaskType)) {
    return { ok: false, code: 'INVALID_INPUT', message: `Unknown writing task type ${input.writingTaskType}` };
  }
  const wantsAcademic = input.writingTaskType.startsWith('academic');
  if ((input.testType === 'ACADEMIC') !== wantsAcademic) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: `Task type ${input.writingTaskType} does not belong to ${input.testType}.`,
    };
  }

  const config = IELTS_WRITING_TASKS[input.writingTaskType];
  emitIeltsEvent('ielts.generation.started', {
    userId: input.userId,
    skill: 'WRITING',
    taskType: input.writingTaskType,
    code: input.testType,
  });

  const recent = await ieltsRepo.listRecentWritingPrompts(input.testType, 30);
  const avoidPrompts = recent.map((r) => r.prompt);

  let rejectionNotes: string[] = [];
  for (let attempt = 0; attempt < IELTS_GENERATION_MAX_ATTEMPTS_PER_SET; attempt++) {
    const generated = await generateIeltsWritingPromptWithAI({
      testType: input.testType,
      taskType: input.writingTaskType,
      topicHint: input.topicHint,
      avoidPrompts,
      rejectionNotes,
    });
    if (!generated.ok) {
      emitIeltsEvent('ielts.generation.failed', {
        userId: input.userId,
        skill: 'WRITING',
        code: generated.failure,
        durationMs: Date.now() - started,
      });
      return { ok: false, code: generated.failure, message: generated.error };
    }

    const promptText = generated.data.promptText.trim();
    // Deterministic service-side checks BEFORE the AI conformance pass.
    if (promptText.length < 120) {
      rejectionNotes = ['PROMPT_TOO_SHORT: include all parts of the official task'];
      continue;
    }
    if (!promptText.includes(String(config.minWords))) {
      rejectionNotes = [`MISSING_MINIMUM: state "Write at least ${config.minWords} words."`];
      continue;
    }
    if (!/you should spend about/i.test(promptText)) {
      rejectionNotes = [
        `MISSING_TIMING: include "You should spend about ${config.recommendedMinutes} minutes on this task."`,
      ];
      continue;
    }

    const verified = await verifyIeltsWritingPromptWithAI({
      testType: input.testType,
      taskType: input.writingTaskType,
      promptText,
    });
    if (!verified.ok) {
      emitIeltsEvent('ielts.generation.failed', {
        userId: input.userId,
        skill: 'WRITING',
        code: verified.failure,
        durationMs: Date.now() - started,
      });
      return { ok: false, code: verified.failure, message: verified.error };
    }
    if (!verified.data.conforms) {
      rejectionNotes = verified.data.issues;
      continue;
    }

    // ---- Persist (QA_REQUIRED — human approval still required) ------------
    const isInstant = input.deliveryMode === 'INSTANT';
    const contentSource = {
      type: 'ORIGINAL_GENERATED' as const,
      notes: isInstant
        ? 'AI-assisted generation (DeepSeek) — platform-original IELTS-style task; not official IELTS material. Delivered as INSTANT self-study practice to the requesting student (conformance-checked only; NOT human-reviewed).'
        : 'AI-assisted generation (DeepSeek) — platform-original IELTS-style task; not official IELTS material; awaiting human QA review.',
    };
    const variantTag = input.testType === 'ACADEMIC' ? 'academic' : 'gt';
    // ONE transaction (2026-10-08): test + task section + prompt are a single
    // logical unit — a half-persisted INSTANT writing task would be openable by
    // its owner with no prompt at all.
    const { testId: writingTestId } = await ieltsRepo.persistGeneratedWritingTask({
      test: {
        slug: `ai-writing-${variantTag}-${input.writingTaskType.split('_')[1]}-${Date.now().toString(36)}`,
        title: generated.data.title.trim() ||
          `${input.testType === 'ACADEMIC' ? 'Academic' : 'General Training'} Writing ${
            input.writingTaskType.endsWith('task1') ? 'Task 1' : 'Task 2'
          } — AI-generated task`,
        testType: input.testType,
        skill: 'WRITING',
        description: isInstant
          ? 'AI-generated IELTS-style writing task (platform original). Conformance-checked; not teacher-reviewed self-study practice (never listed until a teacher publishes it).'
          : 'AI-generated IELTS-style writing task (platform original). Conformance-checked; awaiting human QA before publication.',
        status: 'DRAFT',
        origin: isInstant ? 'INSTANT' : 'CATALOGUE',
        ownerUserId: isInstant ? input.userId : null,
        durationMinutes: config.recommendedMinutes,
        contentSource: JSON.stringify(contentSource),
      },
      section: {
        label: input.writingTaskType,
        instructions: promptText,
        wordCount: countIeltsWords(promptText),
      },
      question: {
        questionType: 'writing_task',
        skill: 'WRITING',
        prompt: promptText,
        difficulty: 'MEDIUM',
        difficultyModel: IELTS_DIFFICULTY_MODEL_VERSION,
        contentSource: JSON.stringify(contentSource),
        generatorVersion: IELTS_GENERATION_GENERATOR_VERSION,
        validationStatus: 'QA_REQUIRED',
        validationNotes: JSON.stringify({
          conformance: 'PASS',
          checker: 'IeltsWritingPromptVerification',
          generatorVersion: IELTS_GENERATION_GENERATOR_VERSION,
          generatedAt: new Date().toISOString(),
        }),
      },
    });

    emitIeltsEvent('ielts.generation.completed', {
      userId: input.userId,
      skill: 'WRITING',
      taskType: input.writingTaskType,
      durationMs: Date.now() - started,
      itemCount: 1,
      code: 'DELIVERED',
    });
    return {
      ok: true,
      testId: writingTestId,
      testStatus: 'DRAFT',
      taskType: input.writingTaskType,
      testType: input.testType,
      durationMs: Date.now() - started,
    };
  }

  emitIeltsEvent('ielts.generation.failed', {
    userId: input.userId,
    skill: 'WRITING',
    taskType: input.writingTaskType,
    code: 'WRITING_PROMPT_NOT_CONFORMING',
    durationMs: Date.now() - started,
  });
  return {
    ok: false,
    code: 'WRITING_PROMPT_NOT_CONFORMING',
    message: 'The generated task did not pass the conformance check after retrying.',
    issues: rejectionNotes,
  };
}
