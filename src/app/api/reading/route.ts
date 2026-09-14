// ============================================
// API: /api/reading — DSE Paper 1 閱讀理解 v3
// Features:
//   - Full DSE Paper generation (multi-passage, 42 marks; dormant — no UI consumer)
//   - Student generation: 500-800 words, 3-5 paragraphs + progressive questions
//     (MCQ / fill / TFNG / tone-attitude / vocab / summary / referencing / inference / short answer)
//   - B1/B2 level cap enforcement
//   - Passage quality validation (word count, paragraph count, readability)
//   - HK-local content density check
//   - Wrong answer analysis & classification
//   - Summary Cloze / Paraphrase / Idiom training endpoints
//   - Time management metadata
//   - Sprint 102: Rubric-based semantic evaluation (HKDSE-examiner style)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { callLLM, ragService, evaluateWithAI, type AIEvaluationResult, isBudgetExceededError } from '@/modules/ai';
import { logger } from '@/shared/logger/logger';
import {
  buildFullDSEPaperPrompt,
  buildReadingSectionPromptLite,
  buildReadingExercisePrompt,
} from '@/modules/ai/prompts/reading/v1';
import { buildSummaryClozeTrainingPrompt, getSummaryClozeTips, COMMON_CLOZE_TRAP_WORDS } from '@/modules/ai/prompts/reading/training-summary-cloze';
import { buildParaphraseTrainingPrompt, getParaphraseTips, PARAPHRASE_PATTERNS } from '@/modules/ai/prompts/reading/training-paraphrase';
import { buildIdiomTrainingPrompt, getIdiomTips, getDSEidiomQuickReference, getContextClueChecklist, DSE_IDIOM_BANK } from '@/modules/ai/prompts/reading/training-idiom';
import {
  type DSEpart,
  type HKEAALevel,
  type DSEreadingPaper,
  type DSEreadingQuestion,
  type ReadingErrorType,
  type AnswerAnalysis,
  platformDifficultyToHKEAALevel,
  maxAttainableLevel,
  estimateReadability,
  mapReadabilityToHKEAALevel,
  checkHKLocalContent,
  validatePassageQuality,
  validateQuestionQuality,
  validateQuestionSetBlueprint,
  shouldRetryBlueprint,
  buildBlueprintRetryInstruction,
  toBlueprintQualityMeta,
  validateAllMCDistractors,
  type QuestionSetQualityCheck,
  type BlueprintQualityMeta,
} from '@/modules/ai/prompts/reading/types';
import { DSE_PART_QUESTION_MIX } from '@/modules/ai/prompts/reading/dse-question-templates';

// Phase 4D.1: Paper reviewer integration
import { buildPaperReviewPrompt } from '@/modules/reading/review/paper-reviewer';
import { evaluateGate, buildReviewMetadata } from '@/modules/reading/review/paper-reviewer-gate';
import { validateReviewStructure } from '@/modules/reading/review/paper-reviewer-types';
import type { PaperReview } from '@/modules/reading/review/paper-reviewer-types';
import { B1_B2_LEVEL_CAPS, HKEAA_TO_PLATFORM_DIFFICULTY } from '@/modules/ai/prompts/reading/dse-level-descriptors';
import { DSE_TEXT_TYPES, DSE_PUBLICATION_SOURCES } from '@/modules/ai/prompts/reading/text-types';
import {
  validateReadingQuestionSet,
  type ReadingValidationResult,
} from '@/modules/ai/prompts/reading/reading-validator';
import {
  requiresApiEvaluation,
  buildEvaluation,
} from '@/modules/reading/evaluation';
import { persistGeneratedReadingQuestions, resolveReadingQuestionDefinitions } from '@/modules/reading/services/reading-question-service';
import type { ReadingAnswerEvaluation } from '@/modules/reading/evaluation';
import { buildReadingDiagnosticFeedback } from '@/modules/reading/feedback';
import type { ReadingDiagnosticFeedback } from '@/modules/reading/feedback';
import { estimateLevelFromScore100 } from '@/modules/ai/core/level-estimation';

// ============================================
// Phase 1B: DSE Type Mapping (camelCase backend → snake_case frontend)
// Preserves all 19 DSE question types end-to-end.
// ============================================

/** Maps backend camelCase DSE question types to frontend snake_case display types */
const DSE_TYPE_MAP: Record<string, string> = {
  mcq: 'multiple_choice',
  mcCloze: 'multiple_choice',
  negativeInference: 'multiple_choice',
  authorIntention: 'multiple_choice',
  trueFalseNG: 'true_false_not_given',
  referencing: 'reference',
  vocabularyInContext: 'vocabulary_in_context',
  synonymSearch: 'vocabulary_in_context',
  phraseSearch: 'vocabulary_in_context',
  inference: 'inference',
  toneAttitude: 'tone_attitude',
  summaryCloze: 'summary_cloze',
  tableCompletion: 'summary_cloze',
  causeEffectCompletion: 'summary_cloze',
  shortAnswer: 'sentence_transformation',
  matching: 'sentence_transformation',
  sequencing: 'sentence_transformation',
  exampleFinding: 'sentence_transformation',
  errorCorrectionSummary: 'sentence_transformation',
};

function mapDseTypeToFrontend(aiType: string): string {
  return DSE_TYPE_MAP[aiType] || 'sentence_transformation';
}

/**
 * Reverse lookup: frontend snake_case dseType → a representative backend
 * camelCase type. R3.9 (R39-A): used only to reconstruct routing metadata
 * for display scoring from persisted ReadingQuestion definitions. The
 * representative choice never changes scoring semantics — all backend
 * types sharing one frontend type use identical routing.
 */
const FRONTEND_TO_BACKEND: Record<string, string> = {};
for (const [backend, frontend] of Object.entries(DSE_TYPE_MAP)) {
  if (!(frontend in FRONTEND_TO_BACKEND)) FRONTEND_TO_BACKEND[frontend] = backend;
}

function isMcLikeDseType(dseType: string): boolean {
  return dseType === 'multiple_choice' || dseType === 'true_false_not_given' || dseType === 'tone_attitude';
}

// Phase 1C.1: Conditional token allocation by generation mode
function getReadingMaxTokens(params: {
  mode: 'full-paper' | 'exercise' | 'legacy';
  estimatedWords?: number;
}): number {
  const { mode, estimatedWords = 0 } = params;
  if (mode === 'full-paper') return estimatedWords > 1400 ? 16384 : 12288;
  if (mode === 'exercise') return estimatedWords > 900 ? 12288 : 8192;
  return estimatedWords > 900 ? 12288 : 8192;
}

function getReadingTimeout(params: { mode: string; maxTokens: number }): number {
  // Proportional timeout: 5ms per token (empirical from Grok/DeepSeek latency data)
  // 8192 tokens × 5ms = ~41s, 12288 tokens × 5ms = ~61s
  // Min 35s, Max 115s（保守 AI 時間預算；Cloud Run timeout 300s，見 cloud-run.yaml）
  const proportional = params.maxTokens * 5; // 5ms per token → milliseconds
  return Math.min(115_000, Math.max(35_000, proportional));
}

// ============================================
// Phase 4D.3: Generation Safety — Safe Parse + Structured Errors
// ============================================

/** Structured error for API responses — user-safe message + dev-facing details */
interface ApiError {
  error: string;
  code: string;
  recoverable: boolean;
  details?: string;
}

function apiError(message: string, code: string, recoverable = false, details?: string): ApiError {
  return { error: message, code, recoverable, details };
}

/** Safely parse AI JSON output, returning null on failure instead of throwing */
function safeJsonParse<T>(raw: string, label: string): { data: T | null; error: string | null } {
  try {
    const data = JSON.parse(raw) as T;
    if (!data || typeof data !== 'object') {
      return { data: null, error: `${label}: parsed value is not an object` };
    }
    return { data, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown parse error';
    logger.warn({ module: 'reading-api', label, error: msg }, 'AI JSON parse failed');
    return { data: null, error: `${label}: ${msg}` };
  }
}

/**
 * Attempt to repair common AI-generated JSON errors before parsing.
 * Handles: markdown fences, trailing commas, unquoted property names,
 * missing closing braces, and truncated JSON.
 * Returns repaired string (may still be invalid) and whether any repair was applied.
 */
function repairAiJson(raw: string): { repaired: string; wasRepaired: boolean } {
  let text = raw.trim();
  let wasRepaired = false;

  // 1. Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
    wasRepaired = true;
  }

  // 1.2 Fix unescaped control characters inside string values
  // CRITICAL: \t \n \r are VALID JSON whitespace between tokens — do NOT escape them there.
  // But inside string values they are INVALID. Since DeepSeek uses json_mode
  // (no tabs for indentation), any literal tab likely comes from AI text content.
  // Strategy: escape only tabs (safe in json_mode) + never-valid control chars (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F).
  // Leave \n and \r alone — they are valid JSON whitespace.
  let cleanControls = text.replace(/\t/g, '\\t');
  cleanControls = cleanControls.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, (ch) =>
    '\\u' + ('000' + ch.charCodeAt(0).toString(16)).slice(-4)
  );
  // Remove standalone \r (Windows artifacts) — \r\n pairs are fine
  cleanControls = cleanControls.replace(/\r(?!\n)/g, '');
  if (cleanControls !== text) {
    text = cleanControls;
    wasRepaired = true;
  }

  // 1.5 [DISABLED] Stray quote escape was causing false JSON errors.
  // Raw fallback handles valid JSON; step 1.2 handles control chars.

  // 2. Remove trailing commas before closing braces/brackets
  const trailingCommaFixed = text.replace(/,(\s*[}\]])/g, '$1');
  if (trailingCommaFixed !== text) {
    text = trailingCommaFixed;
    wasRepaired = true;
  }

  // 3. Fix unquoted property names: {key: "value"} → {"key": "value"}
  // Matches patterns like `  key: ` or `\nkey: ` where key is a word
  const unquotedKeyFixed = text.replace(
    /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g,
    '$1"$2"$3'
  );
  if (unquotedKeyFixed !== text) {
    text = unquotedKeyFixed;
    wasRepaired = true;
  }

  // 3.5 Fix missing colons after property names: {"key" "value"} → {"key": "value"}
  // The "Expected ':' after property name" error — AI sometimes skips the colon.
  // Matches: any quoted string followed by whitespace and another quote (no colon between).
  // First pass: standard case: {"word" "value"}
  let missingColonFixed = text.replace(
    /([,{]\s*)"([^"]+)"\s+"/g,
    '$1"$2": "'
  );
  // Second pass: edge case where the key-value pair spans a newline
  missingColonFixed = missingColonFixed.replace(
    /"([^"]+)"\n\s*"/g,
    '"$1": "'
  );
  if (missingColonFixed !== text) {
    text = missingColonFixed;
    wasRepaired = true;
  }

  // 3.7 Fix prematurely-closed readingContent: merge standalone [Paragraph N] strings back
  // DeepSeek sometimes closes readingContent at paragraph boundaries, creating:
  //   "readingContent": "...[Para 1].",\n"[Paragraph 2] ...",\n"[Paragraph 3] ..."
  // These standalone paragraph strings break JSON — merge them back into readingContent.
  // Strategy: replace `",\n"[Paragraph N]` with `\n\n[Paragraph N]` inside the string.
  let prevMerge: string;
  do {
    prevMerge = text;
    // Match: closing quote + comma + whitespace + opening quote + [Paragraph N]
    text = text.replace(/"\s*,\s*"(\[Paragraph\s+\d+\])/g, '\\n\\n$1');
  } while (text !== prevMerge);
  if (text !== missingColonFixed) {
    wasRepaired = true;
  }

  // 4. Balance braces: if opening > closing, append missing }
  const openBraces = (text.match(/{/g) || []).length;
  const closeBraces = (text.match(/}/g) || []).length;
  if (openBraces > closeBraces) {
    text += '}'.repeat(openBraces - closeBraces);
    wasRepaired = true;
  }

  // 5. Balance brackets
  const openBrackets = (text.match(/\[/g) || []).length;
  const closeBrackets = (text.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    text += ']'.repeat(openBrackets - closeBrackets);
    wasRepaired = true;
  }

  return { repaired: text, wasRepaired };
}

/**
 * R3.10-L: tone/attitude questions MUST carry their own A-D choices.
 * The answer key is never fabricated by keyword-matching afterwards —
 * a question without genuine choices is flagged for regeneration.
 */
function hasMissingToneChoices(questions: Array<Record<string, unknown>>): boolean {
  return questions.some(q => {
    const t = q.type;
    if (t !== 'toneAttitude' && t !== 'authorIntention') return false;
    const choices = q.choices;
    if (!Array.isArray(choices)) return true;
    // 2026-08-30 audit (R7): 長度閾值 >1 → >2 — 裸字母佔位（"A."）不再視為
    // 實質選項，避免 4 個空佔位字母通過選擇題門檻。
    const substantive = choices.filter(
      (c): c is string => typeof c === 'string' && c.trim().length > 2,
    );
    // R3.10-L: tone/attitude MCQs must carry exactly 4 A/B/C/D choices as the
    // prompt requires — fewer choices weakens the question and is flagged for
    // regeneration (never patched by guessing the missing options).
    return substantive.length < 4;
  });
}

/**
 * R3.10-L (2026-08-30 audit R8): phraseSearch questions ask the student to
 * quote a phrase FROM the passage — the canonical answer must therefore
 * appear verbatim in the passage. An answer key that is nowhere in the text
 * is a fabricated key; such questions are dropped (fail-closed) instead of
 * being delivered with a key that can never be correct.
 */
function filterUngroundedPhraseSearch(
  questions: Array<Record<string, unknown>>,
  passage: string,
): Array<Record<string, unknown>> {
  if (!passage || passage.trim().length < 20) {
    // Cannot verify without passage text — do not drop anything.
    return questions;
  }
  const norm = (s: string) =>
    ` ${s.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const normalizedPassage = norm(passage);
  const kept: Array<Record<string, unknown>> = [];
  let dropped = 0;
  for (const q of questions) {
    if (String(q.type ?? '').trim() !== 'phraseSearch') {
      kept.push(q);
      continue;
    }
    const answer = String(q.answer ?? '').trim();
    if (!answer) {
      kept.push(q); // handled by the empty-key drop
      continue;
    }
    const acceptAlso = Array.isArray(q.acceptAlso)
      ? (q.acceptAlso as unknown[]).map(a => String(a))
      : [];
    const grounded = [answer, ...acceptAlso].some(c => normalizedPassage.includes(norm(c)));
    if (!grounded) {
      dropped++;
      logger.warn({ module: 'reading', answer, index: q.index }, 'Dropped phraseSearch question whose answer is not in the passage (anti-fabrication)');
      continue;
    }
    kept.push(q);
  }
  if (dropped > 0) {
    logger.warn({ module: 'reading', dropped }, 'phraseSearch anti-fabrication filter dropped questions');
  }
  return kept;
}

/**
 * Normalize the user-selected topic. When "general" / "綜合" is selected,
 * pick a random DSE-appropriate topic to ensure diversity instead of
 * generating passages ABOUT the word "general".
 */
const DIVERSE_DSE_TOPICS = [
  'the science of sleep and its effect on learning',
  'how artificial intelligence is changing education',
  'marine life conservation and coral reefs',
  'the impact of fast fashion on the environment',
  'how social media affects teenage mental health',
  'the psychology behind procrastination',
  'urban farming and green cities',
  'the rise of e-sports and competitive gaming',
  'the future of electric and autonomous vehicles',
  'endangered species and wildlife protection',
  'the role of public libraries in the digital age',
  'volunteer tourism and its pros and cons',
  'space exploration and Mars colonization',
  'the science behind cooking and food chemistry',
  'renewable energy solutions in Hong Kong',
  'deep-sea exploration and undiscovered species',
  'food sustainability and the future of meat alternatives',
  'the gig economy and its impact on young workers',
  'microplastics in the ocean and their effects on the food chain',
  'how 3D printing is revolutionizing medicine',
];

let _topicIndex = Math.floor(Math.random() * DIVERSE_DSE_TOPICS.length);

function normalizeTopic(topic?: string): string {
  if (!topic || topic === 'general' || topic === '綜合' || topic === 'general interest') {
    const chosen = DIVERSE_DSE_TOPICS[_topicIndex % DIVERSE_DSE_TOPICS.length];
    _topicIndex++;
    return chosen;
  }
  return topic;
}

/**
 * Check if questions are evenly distributed across paragraphs.
 * Returns { valid, counts, message } for use in retry decisions.
 */
function checkParagraphDistribution(
  questions: Array<Record<string, unknown>>,
  paragraphCount: number,
): { valid: boolean; counts: number[]; message: string } {
  const counts = new Array(paragraphCount).fill(0);
  
  for (const q of questions) {
    const qText = (q.questionText as string) || (q.question as string) || '';
    // Try explicit paragraphRef first, then parse from question text
    const ref = (q.paragraphRef as number) || undefined;
    if (ref && ref >= 1 && ref <= paragraphCount) {
      counts[ref - 1]++;
      continue;
    }
    // Parse "paragraph X" from question text (but NOT "paragraphs 1-4" ranges)
    const match = qText.match(/\bparagraph\s+(\d+)\b(?!\s*[-–]\s*\d)/i);
    if (match) {
      const p = parseInt(match[1], 10);
      if (p >= 1 && p <= paragraphCount) counts[p - 1]++;
      continue;
    }
    // Whole-text or cross-paragraph questions — count as paragraph 0 (neutral)
  }
  
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const hasZero = counts.some(c => c === 0);
  const hasOverThree = counts.some(c => c > 3);
  // Only reject if a paragraph has ZERO questions (user requirement).
  // Uneven distribution and >3 per paragraph are warnings, not blockers.
  const valid = !hasZero;
  
  const distroStr = counts.map((c, i) => `P${i + 1}:${c}`).join(', ');
  const message = valid
    ? `Distribution OK: [${distroStr}]`
    : `BAD distribution [${distroStr}] — ${hasZero ? 'has 0-question paragraph(s)' : ''}${hasOverThree ? 'has 4+ question paragraph(s)' : ''}${!hasZero && !hasOverThree ? `gap too large (${max} vs ${min})` : ''}`;
  
  return { valid, counts, message };
}

/**
 * Verify that each question's paragraph reference is ACCURATE:
 * the targetPhrase (or key content) must actually appear in the cited paragraph.
 * Returns array of mismatch warnings. Empty array = all good.
 */
function verifyParagraphReferences(
  questions: Array<Record<string, unknown>>,
  passageContent: string,
): string[] {
  const warnings: string[] = [];
  
  // Split passage into paragraphs by [Paragraph N] markers
  const paraBlocks = passageContent.split(/\[Paragraph\s+\d+\]/gi)
    .map(b => b.trim())
    .filter(Boolean);
  if (paraBlocks.length === 0) return warnings;

  for (const q of questions) {
    const qText = (q.questionText as string) || (q.question as string) || '';
    const targetPhrase = (q.targetPhrase as string) || '';
    const qType = (q.type as string) || '';
    
    // Parse paragraph number from question text
    const match = qText.match(/\bparagraph\s+(\d+)\b(?!\s*[-–]\s*\d)/i);
    if (!match) continue; // Cross-paragraph or whole-passage — skip
    
    const citedPara = parseInt(match[1], 10);
    if (citedPara < 1 || citedPara > paraBlocks.length) continue;
    
    const paraText = paraBlocks[citedPara - 1];
    if (!paraText) continue;
    
    // Skip question types where targetPhrase is a concept label, not a passage word
    if (qType === 'toneAttitude' || qType === 'tone_attitude' ||
        qType === 'summaryCloze' || qType === 'summary_cloze' ||
        qType === 'mcCloze' || qType === 'mc_cloze') {
      continue;
    }
    
    // For reference questions, check the referent word (e.g., "they", "it", "this")
    if (qType === 'referencing' || qType === 'reference') {
      // Extract the quoted word/phrase from question text
      const refMatch = qText.match(/['"」「](.+?)['"」「]/);
      const refWord = refMatch ? refMatch[1] : targetPhrase;
      if (refWord && refWord.length >= 2) {
        const wordRegex = new RegExp('\\b' + refWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        if (!wordRegex.test(paraText)) {
          warnings.push(`Q${q.index}: "${refWord}" (reference) NOT found in paragraph ${citedPara} — but question cites it`);
        }
      }
      continue;
    }
    
    // For vocabulary-in-context, the target word must appear in the cited paragraph
    if (qType === 'vocabularyInContext' || qType === 'vocabulary') {
      if (targetPhrase && targetPhrase.length >= 2) {
        const wordRegex = new RegExp('\\b' + targetPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        if (!wordRegex.test(paraText)) {
          warnings.push(`Q${q.index}: "${targetPhrase}" (vocabulary) NOT found in paragraph ${citedPara} — but question cites it`);
        }
      }
      continue;
    }
    
    // For all other types, check if targetPhrase appears in cited paragraph
    if (targetPhrase && targetPhrase.length >= 3) {
      // Multi-word phrases: check if at least 50% of significant words appear
      const words = targetPhrase.split(/\s+/).filter(w => w.length > 2);
      if (words.length >= 2) {
        const foundCount = words.filter(w => {
          const wRegex = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
          return wRegex.test(paraText);
        }).length;
        if (foundCount < Math.ceil(words.length * 0.5)) {
          warnings.push(`Q${q.index}: "${targetPhrase}" has low overlap with paragraph ${citedPara} (${foundCount}/${words.length} words found)`);
        }
      } else {
        // Single word or short phrase
        const phraseRegex = new RegExp(targetPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (!phraseRegex.test(paraText)) {
          warnings.push(`Q${q.index}: "${targetPhrase}" NOT found in paragraph ${citedPara} — but question cites it`);
        }
      }
    }
  }
  
  return warnings;
}

/** Phase 4D.3: Minimum passage word count for DSE-style question support */
const MIN_PASSAGE_WORDS = {
  'full-paper': 400,
  exercise: 350,
  legacy: 250,
} as const;

/** Check if a passage is too short and return a warning if so */
function checkPassageLength(
  content: string,
  mode: 'full-paper' | 'exercise' | 'legacy',
  passageIndex: number,
): string | null {
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const min = MIN_PASSAGE_WORDS[mode];
  if (wordCount < min) {
    return `Passage ${passageIndex + 1} is too short: ${wordCount} words (minimum ${min} for ${mode} mode). Questions may lack sufficient context.`;
  }
  return null;
}

// ============================================
// Phase 3A.2: Shared Blueprint Retry Helper
// ============================================

interface BlueprintRetryResult {
  final: DSEreadingQuestion[];
  check: QuestionSetQualityCheck;
  retried: boolean;
  firstCheck?: QuestionSetQualityCheck;
}

async function enforceBlueprintWithSingleRetry(params: {
  mode: 'legacy' | 'exercise' | 'full-paper';
  questions: DSEreadingQuestion[];
  paragraphCount: number;
  regenerate: (retryInstruction: string) => Promise<DSEreadingQuestion[]>;
}): Promise<BlueprintRetryResult> {
  const firstCheck = validateQuestionSetBlueprint(params.questions, params.paragraphCount, { mode: params.mode });

  if (!shouldRetryBlueprint(firstCheck)) {
    return { final: params.questions, check: firstCheck, retried: false };
  }

  logger.warn({
    module: 'reading-api',
    mode: params.mode,
    criticalIssues: firstCheck.issues.filter(i => i.severity === 'critical').map(i => i.code),
  }, 'Blueprint critical failure — retrying');

  const retryInstruction = buildBlueprintRetryInstruction(firstCheck);
  const regenerated = await params.regenerate(retryInstruction);
  const secondCheck = validateQuestionSetBlueprint(regenerated, params.paragraphCount, { mode: params.mode });

  return {
    final: regenerated,
    check: secondCheck,
    retried: true,
    firstCheck,
  };
}

// ============================================
// POST — 路由分派（根據 action 參數）
// ============================================
export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body as { action?: string };

    switch (action) {
      case 'full-paper':
        return handleFullPaperGeneration(body);
      case 'exercise':
        return handleExerciseGeneration(body);
      case 'analyze-answers':
        return handleAnswerAnalysis(body);
      case 'summary-cloze-training':
        return handleSummaryClozeTraining(body);
      case 'paraphrase-training':
        return handleParaphraseTraining(body);
      case 'idiom-training':
        return handleIdiomTraining(body);
      case 'validate-paper':
        return handlePaperValidation(body);
      case 'review':
        return handlePaperReview(body);
      default:
        // Backward compat: single passage generation
        return handleLegacyGeneration(body);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    logger.error({ module: 'reading-api', error: msg }, 'Reading API error');
    return NextResponse.json(
      apiError(msg, 'INTERNAL_ERROR', false, err instanceof Error ? err.stack : undefined),
      { status: isBudgetExceededError(err) ? 503 : 500 },
    );
  }
}

// ============================================
// Sprint 102: TFNG Sub-statement Splitter
// Splits "(i)...(ii)...(iii)..." trueFalseNG questions into individual sub-questions
// ============================================
function splitTFNGSubQuestions(
  questions: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];

  for (const q of questions) {
    const aiType = (q.type as string) || '';
    const questionText = (q.questionText as string) || (q.question as string) || '';

    if (aiType !== 'trueFalseNG') { result.push(q); continue; }

    // Match (i)...(ii)...(iii)... sub-statements
    const subRegex = /\(([ivx]+)\)\s*(.+?)(?=\s*\([ivx]+\)|$)/gi;
    const subs: { label: string; text: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = subRegex.exec(questionText)) !== null) {
      subs.push({ label: m[1], text: m[2].trim() });
    }

    if (subs.length <= 1) { result.push(q); continue; }

    // Parse per-sub-statement answers from the original answer field
    // AI format: "(i) True (ii) Not Given (iii) True" or "True, Not Given, True" or "T, F, NG"
    const rawAnswer = (q.answer as string) || '';
    const subAnswers: Record<string, string> = {};

    // Try format "(i) True (ii) False (iii) NG"
    const answerSubRegex = /\(([ivx]+)\)\s*(True|False|Not Given|T|F|NG)\b/gi;
    let am: RegExpExecArray | null;
    while ((am = answerSubRegex.exec(rawAnswer)) !== null) {
      // Normalize: T→True, F→False, NG→Not Given
      const val = am[2];
      const normalized = val === 'T' ? 'True' : val === 'F' ? 'False' : val === 'NG' ? 'Not Given' : val;
      subAnswers[am[1].toLowerCase()] = normalized;
    }

    // Fallback 1: simple "True, False, NG" comma-separated
    if (Object.keys(subAnswers).length === 0) {
      const parts = rawAnswer.split(/[,;]\s*/);
      subs.forEach((sub, i) => {
        if (parts[i]) {
          const v = parts[i].trim();
          subAnswers[sub.label.toLowerCase()] = v === 'T' ? 'True' : v === 'F' ? 'False' : v === 'NG' ? 'Not Given' : v;
        }
      });
    }

    // Fallback 2: if answer is just "True/False/NG", apply to first sub-statement only
    if (Object.keys(subAnswers).length === 0 && /^(True|False|Not Given|T|F|NG)$/i.test(rawAnswer.trim())) {
      const v = rawAnswer.trim();
      subAnswers[subs[0].label.toLowerCase()] = v === 'T' ? 'True' : v === 'F' ? 'False' : v === 'NG' ? 'Not Given' : v;
    }

    // Extract question stem (text before first sub-statement)
    const stemEnd = questionText.indexOf(`(${subs[0].label})`);
    const stem = stemEnd > 0 ? questionText.slice(0, stemEnd).trim() : '';

    // Split into individual sub-questions
    let subIndex = 0;
    // Also split the explanation per sub-statement
    const rawExplanationZh = (q.explanationZh as string) || '';
    const rawExplanationEn = (q.explanationEn as string) || '';
    const subExplanationsZh: Record<string, string> = {};
    const subExplanationsEn: Record<string, string> = {};
    const explSubRegex = /\(([ivx]+)\)\s*(.+?)(?=\s*\([ivx]+\)|$)/gi;
    let em: RegExpExecArray | null;
    while ((em = explSubRegex.exec(rawExplanationZh)) !== null) {
      subExplanationsZh[em[1].toLowerCase()] = em[2].trim();
    }
    while ((em = explSubRegex.exec(rawExplanationEn)) !== null) {
      subExplanationsEn[em[1].toLowerCase()] = em[2].trim();
    }

    for (const sub of subs) {
      const subAnswer = subAnswers[sub.label.toLowerCase()] || '';
      const subLabel = sub.label.toLowerCase();
      const subExpZh = subExplanationsZh[subLabel] || rawExplanationZh;
      const subExpEn = subExplanationsEn[subLabel] || rawExplanationEn;
      result.push({
        ...q,
        index: ((q.index as number) || 0) + subIndex * 0.1,
        question: stem ? `${stem}\n(${sub.label}) ${sub.text}` : `(${sub.label}) ${sub.text}`,
        questionText: stem ? `${stem}\n(${sub.label}) ${sub.text}` : `(${sub.label}) ${sub.text}`,
        marks: 1,
        type: 'trueFalseNG',
        choices: ['True', 'False', 'Not Given'],
        answer: subAnswer,
        explanationZh: subExpZh || `(${sub.label}) ${subAnswer}`,
        explanationEn: subExpEn || `(${sub.label}) ${subAnswer}`,
      });
      subIndex++;
    }
  }

  return result;
}

// ============================================
// GET — 資源列表
// ============================================
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    topics: [
      { id: 'environment', zh: '環境保護', en: 'Environment' },
      { id: 'technology', zh: '科技與社會', en: 'Technology & Society' },
      { id: 'health', zh: '健康與生活', en: 'Health & Lifestyle' },
      { id: 'culture', zh: '文化與節日', en: 'Culture & Festivals' },
      { id: 'education', zh: '教育與學習', en: 'Education & Learning' },
      { id: 'science', zh: '科學探索', en: 'Science & Discovery' },
      { id: 'sports', zh: '運動與競技', en: 'Sports & Competition' },
      { id: 'travel', zh: '旅遊與冒險', en: 'Travel & Adventure' },
      { id: 'animals', zh: '動物與自然', en: 'Animals & Nature' },
      { id: 'history', zh: '歷史人物與事件', en: 'History' },
      { id: 'careers', zh: '職業與未來', en: 'Careers & Future' },
      { id: 'media', zh: '媒體與新聞', en: 'Media & News' },
    ],
    gradeLevels: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
    parts: {
      A: DSE_PART_QUESTION_MIX.A,
      B1: DSE_PART_QUESTION_MIX.B1,
      B2: DSE_PART_QUESTION_MIX.B2,
    },
    textTypes: DSE_TEXT_TYPES.map(t => ({ id: t.id, nameEn: t.nameEn, nameZh: t.nameZh })),
    publicationSources: DSE_PUBLICATION_SOURCES,
    levelCaps: B1_B2_LEVEL_CAPS,
    levelDescriptors: HKEAA_TO_PLATFORM_DIFFICULTY,
    idiomBank: DSE_IDIOM_BANK.slice(0, 20),
    trainingModules: {
      'summary-cloze-training': { action: 'summary-cloze-training', description: 'Summary Cloze 專項訓練' },
      'paraphrase-training': { action: 'paraphrase-training', description: 'Paraphrase 改寫技能訓練' },
      'idiom-training': { action: 'idiom-training', description: 'Idiom 語境推斷訓練' },
    },
    tips: {
      summaryCloze: getSummaryClozeTips(),
      paraphrase: getParaphraseTips(),
      idiom: getIdiomTips(),
    },
  });
}

// ============================================
// Action: full-paper — 完整 DSE 模擬卷生成
// ============================================
// R3.9 (R39-B): 此端點目前無任何 UI 消費者（dormant）。它只回傳一份原始
// 生成卷 JSON — 不持久化 ReadingQuestion、不建立任何執行身份。
// 未來若為其接上學生作答流程，必須先將題目定義持久化為 ReadingQuestion
// （經 assignServerOwnedQuestionIds），否則 /api/practice 將無法評分。
// 本端點目前不得回傳任何「可執行」的題目 id。
async function handleFullPaperGeneration(body: Record<string, unknown>) {
  const startTime = Date.now();
  const {
    gradeLevel = 'S5',
    part = 'A',
    targetLevel,
    topic,
    textTypes,
  } = body as {
    gradeLevel?: string;
    part?: DSEpart;
    targetLevel?: HKEAALevel;
    topic?: string;
    textTypes?: string[];
  };

  const resolvedTopic = normalizeTopic(topic);

  // Validate part
  const validatedPart: DSEpart = ['A', 'B1', 'B2'].includes(part as string) ? part as DSEpart : 'A';

  // Determine target level
  const resolvedLevel: HKEAALevel = targetLevel
    ? Math.min(targetLevel, maxAttainableLevel(validatedPart)) as HKEAALevel
    : (validatedPart === 'B1' ? 3 : validatedPart === 'B2' ? 5 : 3);

  // Level cap warning
  if (targetLevel && targetLevel > maxAttainableLevel(validatedPart)) {
    logger.warn({ module: 'reading-api', targetLevel, part: validatedPart, maxLevel: maxAttainableLevel(validatedPart) }, 'Target level exceeds part max, capping');
  }

  // DSE RAG
  let dseContext = '';
  try {
    if (ragService.isDSERAGEnabled()) {
      const [pastPapers, markingSchemes] = await Promise.all([
        ragService.retrievePastPaperContent('Reading', resolvedTopic, undefined, gradeLevel, 3),
        ragService.retrieveMarkingScheme('Reading', 2),
      ]);
      dseContext = ragService.buildDSEContextPrompt(
        pastPapers.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        markingSchemes.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'generate_questions',
      );
      if (dseContext) {
        logger.info({ module: 'reading-api', topic: resolvedTopic, paperCount: pastPapers.length }, 'DSE RAG context built for full paper');
      }
    }
  } catch (ragErr) {
    logger.warn({ module: 'reading-api', error: (ragErr as Error).message }, 'DSE RAG retrieval failed, continuing without it');
  }

  const systemPrompt = buildFullDSEPaperPrompt({
    gradeLevel,
    part: validatedPart,
    targetLevel: resolvedLevel,
    topic: resolvedTopic,
    textTypes: textTypes as string[] | undefined,
  });

  const dseContextBlock = dseContext ? `\n\n=== DSE Real Past Paper Reference ===\n${dseContext}\n=== End DSE Reference ===\n` : '';

  const result = await callLLM([
    { role: 'system', content: systemPrompt + dseContextBlock },
    { role: 'user', content: `Generate a complete DSE Paper 1 Part ${validatedPart} paper for ${gradeLevel} students (target Level ${resolvedLevel}) about "${resolvedTopic}". Return the complete JSON paper object.` },
  ], { temperature: 0.45, maxTokens: getReadingMaxTokens({ mode: 'full-paper', estimatedWords: 1600 }), jsonMode: true, timeoutMs: getReadingTimeout({ mode: 'full-paper', maxTokens: getReadingMaxTokens({ mode: 'full-paper', estimatedWords: 1600 }) }) });

  const paperParse = safeJsonParse<DSEreadingPaper>(result, 'full-paper-generation');
  if (!paperParse.data || paperParse.error) {
    return NextResponse.json(
      apiError('AI generated malformed paper JSON', 'MALFORMED_AI_OUTPUT', true, paperParse.error ?? undefined),
      { status: 422 },
    );
  }
  const paper = paperParse.data;

  // Guard: ensure passages array exists
  if (!paper.passages || !Array.isArray(paper.passages) || paper.passages.length === 0) {
    return NextResponse.json(
      apiError('Generated paper has no passages', 'EMPTY_PAPER', true),
      { status: 422 },
    );
  }

  // Post-generation quality validation
  const warnings: string[] = [];
  for (let pi = 0; pi < paper.passages.length; pi++) {
    const passage = paper.passages[pi];
    if (!passage || !passage.content) continue;

    // Phase 4D.3: Passage-length guardrail
    const lengthWarning = checkPassageLength(passage.content, 'full-paper', pi);
    if (lengthWarning) warnings.push(lengthWarning);
    // 2026-08-30 audit (R5): full-paper 路徑補上段落數/字數契約檢查（與 legacy/exercise 一致）
    const paraCount = (passage.content.match(/\[Paragraph\s+\d+\]/gi) || []).length;
    if (paraCount < 3 || paraCount > 5) {
      warnings.push(`Passage ${passage.textNumber}: ${paraCount} paragraphs (expected 3-5).`);
    }
    const wordCountNow = passage.content.split(/\s+/).filter(Boolean).length;
    if (wordCountNow > 810) {
      warnings.push(`Passage ${passage.textNumber}: ${wordCountNow} words exceeds 810-word limit.`);
    }
    const pqCheck = validatePassageQuality(passage, validatedPart);
    if (!pqCheck.passed) {
      warnings.push(`Passage ${passage.textNumber}: ${pqCheck.issues.join('; ')}`);
    }

    // Readability check
    const metrics = estimateReadability(passage.content);
    const actualReadabilityLevel = mapReadabilityToHKEAALevel(metrics);
    metrics.targetLevel = resolvedLevel;
    metrics.levelMatch = Math.abs(actualReadabilityLevel - resolvedLevel) <= 1;
    if (!metrics.levelMatch) {
      warnings.push(`Passage ${passage.textNumber}: Readability level ${actualReadabilityLevel} vs target ${resolvedLevel}`);
    }

    // HK-local check
    const hkCheck = checkHKLocalContent(passage.content);
    if (!hkCheck.meetsRecommendedRatio) {
      warnings.push(`Passage ${passage.textNumber}: HK-local ratio ${hkCheck.hkLocalRatio} below recommended 0.30`);
    }

    // Attach metrics to passage (extended fields)
    (passage as unknown as Record<string, unknown>)._readability = metrics;
    (passage as unknown as Record<string, unknown>)._hkLocal = hkCheck;
  }

  // Question quality check
  const allQuestions = paper.passages.flatMap(p => p.questions);
  const qqCheck = validateQuestionQuality(allQuestions, validatedPart);
  if (!qqCheck.passed) {
    warnings.push(...qqCheck.issues);
  }

  // Phase 3A.2: Blueprint validation with retry for full-paper
  const totalParagraphs = paper.passages.reduce((s, p) => s + (p.content.match(/\[Paragraph\s+\d+\]/gi) || []).length, 0);
  const bpResult = await enforceBlueprintWithSingleRetry({
    mode: 'full-paper',
    questions: allQuestions,
    paragraphCount: Math.max(totalParagraphs, 3),
    regenerate: async (retryInstruction: string) => {
      const retryRaw = await callLLM([
        { role: 'system', content: systemPrompt + dseContextBlock + retryInstruction },
        { role: 'user', content: `Regenerate the question set for Part ${validatedPart}. Fix critical blueprint issues while preserving passage quality. Return the complete JSON paper object.` },
      ], { temperature: 0.40, maxTokens: getReadingMaxTokens({ mode: 'full-paper', estimatedWords: 1600 }), jsonMode: true, timeoutMs: getReadingTimeout({ mode: 'full-paper', maxTokens: getReadingMaxTokens({ mode: 'full-paper', estimatedWords: 1600 }) }) });

      const retryParse = safeJsonParse<DSEreadingPaper>(retryRaw, 'full-paper-blueprint-retry');
      if (retryParse.data && !retryParse.error) {
        Object.assign(paper, retryParse.data);
      } else {
        logger.warn({ module: 'reading-api', error: retryParse.error }, 'Blueprint retry parse failed — using original');
      }
      return paper.passages.flatMap(p => p.questions);
    },
  });

  if (!bpResult.check.passed) {
    warnings.push(...bpResult.check.issueMessages);
  }

  // Phase 3C.1: MC distractor quality check
  const mcDistractorIssues = validateAllMCDistractors(allQuestions);
  const combinedIssues = [...bpResult.check.issues, ...mcDistractorIssues];
  const combinedPassed = !combinedIssues.some(i => i.severity === 'critical');
  const blueprintMeta: BlueprintQualityMeta = {
    passed: combinedPassed,
    retried: bpResult.retried,
    degraded: !combinedPassed,
    validated: true,
    issues: combinedIssues,
  };

  const elapsed = Date.now() - startTime;
  logger.info({ module: 'reading-api', part: validatedPart, level: resolvedLevel, passages: paper.passages.length, questions: allQuestions.length, elapsed, warnings: warnings.length }, 'Full paper generated');

  // Phase 4D.1: Optional paper review (controlled by request parameter)
  const requestReview = body.review === true || body.review === 'true';
  let reviewResult: PaperReview | null = null;
  let gateResult = evaluateGate(blueprintMeta.passed, null);

  if (requestReview) {
    try {
      const reviewPrompt = buildPaperReviewPrompt(JSON.stringify(paper, null, 2));
      const reviewRaw = await callLLM([
        { role: 'system', content: reviewPrompt },
      ], { temperature: 0.25, maxTokens: 4096, jsonMode: true, timeoutMs: 60000 });
      const parsed = typeof reviewRaw === 'string' ? JSON.parse(reviewRaw) : reviewRaw;
      if (validateReviewStructure(parsed)) {
        reviewResult = parsed as PaperReview;
        gateResult = evaluateGate(blueprintMeta.passed, reviewResult);
        if (gateResult.warnings.length > 0) {
          warnings.push(...gateResult.warnings.filter(w => !warnings.includes(w)));
        }
      } else {
        warnings.push('Reviewer output failed structure validation.');
      }
    } catch (reviewErr) {
      logger.error({ module: 'reading-api', error: String(reviewErr) }, 'Paper review failed');
      warnings.push('Paper review encountered an error — results may be incomplete.');
    }
  }

  const reviewMeta = buildReviewMetadata(gateResult, reviewResult);

  return NextResponse.json({
    paper,
    metadata: {
      generationTimeMs: elapsed,
      part: validatedPart,
      targetLevel: resolvedLevel,
      maxAttainableLevel: maxAttainableLevel(validatedPart),
      questionTypesUsed: qqCheck.typesUsed,
      totalMarks: qqCheck.totalMarks,
      warnings: warnings.length > 0 ? warnings : undefined,
      blueprintQuality: blueprintMeta,
      review: reviewMeta,
    },
  });
}

// ============================================
// Action: exercise — 閱讀練習題生成（用於 question-generation.ts 整合）
// ============================================
async function handleExerciseGeneration(body: Record<string, unknown>) {
  const {
    gradeLevel = 'S4',
    difficulty = 'core',
    topic,
    count = 5,
    partLabel = 'A',
  } = body as {
    gradeLevel?: string;
    difficulty?: 'remedial' | 'core' | 'challenge';
    topic?: string;
    count?: number;
    partLabel?: DSEpart;
  };

  const resolvedTopic = normalizeTopic(topic);

  const validatedPart: DSEpart = ['A', 'B1', 'B2'].includes(partLabel as string) ? partLabel as DSEpart : 'A';
  const targetLevel = platformDifficultyToHKEAALevel(difficulty, validatedPart);

  const prompt = buildReadingExercisePrompt({
    count: Math.min(count, 10),
    difficultyLabel: { remedial: '補底', core: '核心', challenge: '挑戰' }[difficulty],
    gradeLevel,
    topic: resolvedTopic,
    partLabel: validatedPart,
    targetLevel,
  });

  const result = await callLLM([
    { role: 'system', content: prompt },
    { role: 'user', content: `Generate ${count} DSE Paper 1 Part ${validatedPart} reading questions (${difficulty} level, ${gradeLevel}) about "${resolvedTopic}". The reading passage MUST be 500-800 words. Spread questions across ALL paragraphs evenly. Return JSON.` },
  ], { temperature: 0.45, maxTokens: getReadingMaxTokens({ mode: 'exercise', estimatedWords: 800 }), jsonMode: true, timeoutMs: getReadingTimeout({ mode: 'exercise', maxTokens: getReadingMaxTokens({ mode: 'exercise', estimatedWords: 800 }) }) });

  const parseResult = safeJsonParse<Record<string, unknown>>(result, 'exercise-generation');
  if (!parseResult.data || parseResult.error) {
    return NextResponse.json(
      apiError('AI generated malformed reading content', 'MALFORMED_AI_OUTPUT', true, parseResult.error ?? undefined),
      { status: 422 },
    );
  }
  const parsed = parseResult.data;

  // Validate minimum passage length
  const passageText = parsed.readingContent as string || '';
  const wordCount = passageText.split(/\s+/).filter(Boolean).length;
  if (wordCount < 200) {
    return NextResponse.json(
      apiError(`Generated passage too short: ${wordCount} words (minimum 200 required). Please retry with a different topic.`, 'PASSAGE_TOO_SHORT', true),
      { status: 422 },
    );
  }

  // Route through legacy handler for full passage + question transformation
  // This applies line markers, lineMap, TFNG splitting, question format transform
  if (parsed.readingContent || parsed.questions) {
    // Inject pre-parsed result and re-call legacy handler (skipping AI generation)
    return handleLegacyGeneration({ ...body, _preParsedResult: parsed });
  }

  return NextResponse.json(parsed);
}

// ============================================
// Action: analyze-answers — 錯題分析與分類
// ============================================
// R3.9 (R39-A): 此路徑僅供顯示/回饋，永不持久化 PracticeAnswer 或
// PracticeSession，永不成為持久化評分權威。
// - 當客戶端提供持久化題目 id（questionIds）時，答案鍵 / marks / 題型
//   一律由伺服器持有的 ReadingQuestion 解析；客戶端元資料不作數。
// - 無法解析的題目 → 422 QUESTION_NOT_FOUND（不發明後備分數）。
// - 未提供 questionIds 的舊版請求（客戶端元資料）保留為 display-only —
//   只回傳分析結果供顯示，永不持久化、永不成為評分權威。
async function handleAnswerAnalysis(body: Record<string, unknown>) {
  const raw = body as {
    questions?: DSEreadingQuestion[];
    questionIds?: unknown;
    studentAnswers?: Record<number, string>;
    passageContent?: string;
  };
  let { questions } = raw;
  const { studentAnswers, passageContent } = raw;

  if (
    (!questions || questions.length === 0) &&
    Array.isArray(raw.questionIds) &&
    raw.questionIds.length > 0
  ) {
    const ids = raw.questionIds.map(id => String(id));
    const defs = await resolveReadingQuestionDefinitions(ids);
    const missing = ids.filter(id => !defs.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `找不到題目定義（伺服器不持有此題）: ${missing.join(', ')}`, code: 'QUESTION_NOT_FOUND' },
        { status: 422 },
      );
    }
    questions = ids.map((id, i) => {
      const d = defs.get(id)!;
      const backendType = d.dseType ? (FRONTEND_TO_BACKEND[d.dseType] ?? d.questionType) : d.questionType;
      return {
        index: i,
        type: backendType as DSEreadingQuestion['type'],
        questionText: d.questionText,
        answer: d.answer,
        marks: d.marks,
        choices: d.choices ?? undefined,
        explanationZh: '',
      };
    });
  }

  if (!questions || !studentAnswers) {
    return NextResponse.json({ error: 'questions and studentAnswers are required' }, { status: 400 });
  }

  // Phase 2A: Route evaluation through new evaluator
  // Objective types (MC, TFNG) → local exact match + evaluator enrichment
  // All other types → AI semantic evaluation + evaluator enrichment

  const analyses: (AnswerAnalysis & { evaluation?: ReadingAnswerEvaluation; diagnostic?: ReadingDiagnosticFeedback })[] = await Promise.all(questions.map(async q => {
    // Try multiple index formats (TFNG split uses float indices like 2.0, 2.1)
    let studentAnswer = (studentAnswers[q.index] || '').trim();
    if (!studentAnswer) studentAnswer = ((studentAnswers as Record<string, string>)[String(q.index)] || '').trim();
    if (!studentAnswer) studentAnswer = (studentAnswers[Math.floor(q.index)] || '').trim();

    // Normalize TFNG answers: "T"/"F"/"NG" → "True"/"False"/"Not Given"
    if (q.type === 'trueFalseNG') {
      studentAnswer = studentAnswer === 'T' ? 'True' : studentAnswer === 'F' ? 'False' : studentAnswer === 'NG' ? 'Not Given' : studentAnswer;
    }

    // Determine the frontend DSE type for routing
    const dseType = mapDseTypeToFrontend(q.type);
    // 2026-08-30 audit: sequencing questions are scored deterministically on
    // the persistence path (reading-answer-scoring.isObjective) — mirror that
    // here so the on-screen result matches the persisted verified evidence.
    const isSequencing = q.answer.includes(',')
      && /order|arrange|sequence|chronolog|sort|ranking/i.test(q.questionText || '');
    const useApi = requiresApiEvaluation(dseType) && !isSequencing;

    let result: AIEvaluationResult;

    if (!useApi) {
      // Objective: exact matching — mirrors the server-side canonical scorer
      // (reading-answer-scoring.scoreDeterministic). R3.10-L: the previous
      // containment-based "full marks" path diverged from the persisted
      // verified evidence (which is strict) and was removed.
      const normForCompare = (s: string) => s.toUpperCase().replace(/\s+/g, '').replace(/,/g, ',');
      const normAns = isSequencing ? normForCompare(studentAnswer) : studentAnswer.toLowerCase().trim();
      const normCorrect = isSequencing ? normForCompare(q.answer) : q.answer.toLowerCase().trim();
      const isExact = normAns === normCorrect && normAns !== '';
      result = {
        score: isExact ? q.marks : 0,
        maxScore: q.marks,
        isCorrect: isExact,
        isPartiallyCorrect: false,
        feedbackZh: isExact ? '✅ 正確！' : `❌ 不正確。參考答案：${q.answer}`,
        feedbackEn: isExact ? '✅ Correct!' : `❌ Incorrect. Expected: ${q.answer}`,
        evaluationMethod: 'ai' as const,
      };
    } else {
      // Subjective: use AI semantic evaluation
      result = await evaluateWithAI(studentAnswer, q.answer, q.questionText || '', q.marks);
      if (result.evaluationMethod === 'rule-based') {
        // R3.10-L: never present a keyword-heuristic fallback as an AI verdict.
        // Surface the provenance honestly in the feedback shown to the student.
        result.feedbackZh = `⚠️ AI 暫時無法分析，以下為關鍵字比對估算。${result.feedbackZh}`;
        result.feedbackEn = `⚠️ AI unavailable — the following is a keyword-based estimate. ${result.feedbackEn}`;
      }
    }

    // Phase 2A: Build structured evaluation (all types get this)
    const evidence = passageContent || q.questionText || '';
    const evaluation = buildEvaluation({
      isCorrect: result.isCorrect,
      maxScore: q.marks,
      studentAnswer,
      evidence,
      questionPrompt: q.questionText || '',
      expectedAnswer: q.answer,
      dseType,
      aiScoreAwarded: result.score,
    });

    // Determine error type for analytics
    let errorType: ReadingErrorType | undefined;
    if (!result.isCorrect && !result.isPartiallyCorrect) {
      if (q.type === 'referencing') errorType = 'reference_error';
      else if (q.type === 'inference' || q.type === 'toneAttitude') errorType = 'inference_error';
      else if (q.type === 'vocabularyInContext' || q.type === 'synonymSearch') errorType = 'vocabulary_error';
      else if (q.type === 'trueFalseNG' && studentAnswer.toUpperCase() === 'F') errorType = 'false_vs_ng_confusion';
      else if (studentAnswer.length === 0) errorType = 'incomplete_answer';
      else errorType = 'not_in_passage';
    }

    // Phase 2B: Build diagnostic feedback from evaluation signals
    const diagnostic = buildReadingDiagnosticFeedback({
      dseType,
      questionText: q.questionText || '',
      studentAnswer,
      expectedAnswer: q.answer,
      choices: q.choices,
      evaluation,
      paragraphRef: q.paragraphRef,
    });

    return {
      questionIndex: q.index,
      studentAnswer,
      correctAnswer: q.answer,
      isCorrect: result.isCorrect,
      isPartiallyCorrect: result.isPartiallyCorrect,
      score: result.score,
      maxMarks: q.marks,
      errorType,
      feedbackZh: result.feedbackZh,
      feedbackEn: result.feedbackEn,
      evaluation,
      diagnostic,
    };
  }));

  // Aggregate error breakdown
  const errorBreakdown: Record<string, number> = {};
  const typeBreakdown: Record<string, { correct: number; total: number }> = {};

  for (const a of analyses) {
    const q = questions.find(qq => qq.index === a.questionIndex);
    const qType = q?.type || 'unknown';

    if (!typeBreakdown[qType]) {
      typeBreakdown[qType] = { correct: 0, total: 0 };
    }
    typeBreakdown[qType].total++;
    if (a.isCorrect) typeBreakdown[qType].correct++;

    if (a.errorType) {
      errorBreakdown[a.errorType] = (errorBreakdown[a.errorType] || 0) + 1;
    }
  }

  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
  const scoredMarks = analyses.reduce((s, a) => s + a.score, 0);
  const accuracy = totalMarks > 0 ? scoredMarks / totalMarks : 0;

  // Estimate level from accuracy via the CANONICAL cross-paper 0-100 policy
  // (76/62/48/33) so Reading, Writing and Integrated Skills map the same
  // displayed percentage to the same internal level (2026-08-30 audit).
  const estimatedLevel: HKEAALevel = Number(estimateLevelFromScore100(Math.round(accuracy * 100))) as HKEAALevel;

  return NextResponse.json({
    analyses,
    // Phase 2A: Structured evaluations
    evaluations: analyses.map(a => a.evaluation).filter(Boolean),
    // Phase 2B: Diagnostic feedback
    diagnostics: analyses.map(a => a.diagnostic).filter(Boolean),
    summary: {
      totalMarks,
      scoredMarks,
      accuracy: Math.round(accuracy * 100) / 100,
      estimatedLevel,
      errorBreakdown,
      typeBreakdown,
      weakAreas: Object.entries(typeBreakdown)
        .filter(([, v]) => v.total > 0 && v.correct / v.total < 0.5)
        .map(([type]) => type),
      recommendations: generateRecommendations(errorBreakdown, typeBreakdown),
    },
  });
}

// ============================================
// Action: summary-cloze-training
// ============================================
// R3.9 (R39-B): 訓練端點目前無消費者（dormant）— 僅生成內容，不持久化
// 題目定義、不建立執行、不回傳可執行的題目 id。未來接上學生作答前必須
// 先持久化 ReadingQuestion 定義。
async function handleSummaryClozeTraining(body: Record<string, unknown>) {
  const {
    targetLevel = 4,
    focusArea = 'mixed',
    count = 5,
  } = body as {
    targetLevel?: number;
    focusArea?: 'partOfSpeech' | 'participialModifier' | 'sameSubjectCheck' | 'mixed';
    count?: number;
  };

  const prompt = buildSummaryClozeTrainingPrompt({
    targetLevel,
    focusArea,
    count: Math.min(count, 10),
  });

  const result = await callLLM([
    { role: 'system', content: prompt },
    { role: 'user', content: `Generate ${count} Summary Cloze exercises (focus: ${focusArea}) for DSE Level ${targetLevel} students. Return JSON.` },
  ], { temperature: 0.4, maxTokens: 4096, jsonMode: true, timeoutMs: 25000 });

  const parsed = JSON.parse(result);
  return NextResponse.json({
    ...parsed,
    tips: getSummaryClozeTips(),
    trapWords: COMMON_CLOZE_TRAP_WORDS,
  });
}

// ============================================
// Action: paraphrase-training
// ============================================
async function handleParaphraseTraining(body: Record<string, unknown>) {
  const {
    targetLevel = 4,
    focusArea = 'mixed',
    count = 5,
  } = body as {
    targetLevel?: number;
    focusArea?: 'synonym' | 'voice' | 'wordForm' | 'sentenceStructure' | 'clausePhrase' | 'mixed';
    count?: number;
  };

  const prompt = buildParaphraseTrainingPrompt({
    targetLevel,
    focusArea,
    count: Math.min(count, 10),
  });

  const result = await callLLM([
    { role: 'system', content: prompt },
    { role: 'user', content: `Generate ${count} Paraphrase exercises (focus: ${focusArea}) for DSE Level ${targetLevel} students. Return JSON.` },
  ], { temperature: 0.4, maxTokens: 4096, jsonMode: true, timeoutMs: 25000 });

  const parsed = JSON.parse(result);
  return NextResponse.json({
    ...parsed,
    tips: getParaphraseTips(),
    patterns: PARAPHRASE_PATTERNS,
  });
}

// ============================================
// Action: idiom-training
// ============================================
async function handleIdiomTraining(body: Record<string, unknown>) {
  const {
    targetLevel = 4,
    strategy = 'mixed',
    count = 5,
  } = body as {
    targetLevel?: number;
    strategy?: 'definition' | 'contrast' | 'example' | 'causeEffect' | 'tone' | 'mixed';
    count?: number;
  };

  const prompt = buildIdiomTrainingPrompt({
    targetLevel,
    strategy,
    count: Math.min(count, 10),
  });

  const result = await callLLM([
    { role: 'system', content: prompt },
    { role: 'user', content: `Generate ${count} Idiom inference exercises (strategy: ${strategy}) for DSE Level ${targetLevel} students. Return JSON.` },
  ], { temperature: 0.4, maxTokens: 4096, jsonMode: true, timeoutMs: 25000 });

  const parsed = JSON.parse(result);
  return NextResponse.json({
    ...parsed,
    tips: getIdiomTips(),
    dseIdiomReference: getDSEidiomQuickReference(),
    contextClueChecklist: getContextClueChecklist(),
  });
}

// ============================================
// Action: validate-paper — 質量驗證（不經 LLM）
// ============================================
async function handlePaperValidation(body: Record<string, unknown>) {
  const { paper, part = 'A' } = body as { paper: DSEreadingPaper; part?: DSEpart };
  const validatedPart: DSEpart = ['A', 'B1', 'B2'].includes(part as string) ? part as DSEpart : 'A';

  if (!paper || !paper.passages) {
    return NextResponse.json({ error: 'paper with passages array is required' }, { status: 400 });
  }

  const results = paper.passages.map(p => {
    const pqCheck = validatePassageQuality(p, validatedPart);
    const metrics = estimateReadability(p.content);
    const readabilityLevel = mapReadabilityToHKEAALevel(metrics);
    const hkCheck = checkHKLocalContent(p.content);

    return {
      textNumber: p.textNumber,
      passageQuality: pqCheck,
      readability: { ...metrics, estimatedHKEAALevel: readabilityLevel },
      hkLocalContent: hkCheck,
    };
  });

  const allQuestions = paper.passages.flatMap(p => p.questions);
  const qqCheck = validateQuestionQuality(allQuestions, validatedPart);

  return NextResponse.json({
    part: validatedPart,
    passageResults: results,
    questionQuality: qqCheck,
    overallPassed: results.every(r => r.passageQuality.passed) && qqCheck.passed,
  });
}

// ============================================
// Phase 4D.1: Action: review — 獨立論文評審
// ============================================
async function handlePaperReview(body: Record<string, unknown>) {
  const { paper, part } = body as { paper: DSEreadingPaper; part?: DSEpart };

  if (!paper || !paper.passages) {
    return NextResponse.json({ error: 'paper with passages array is required' }, { status: 400 });
  }

  const validatedPart: DSEpart = part && ['A', 'B1', 'B2'].includes(part as string) ? part as DSEpart : 'A';

  // Run blueprint validation first
  const allQuestions = paper.passages.flatMap(p => p.questions);
  const totalParagraphs = paper.passages.reduce((s, p) => s + (p.content.match(/\[Paragraph\s+\d+\]/gi) || []).length, 0);
  const bpCheck = validateQuestionSetBlueprint(allQuestions, Math.max(totalParagraphs, 3), { mode: 'full-paper', part: validatedPart });
  const validatorPassed = bpCheck.passed;

  // Run paper reviewer
  let reviewResult: PaperReview | null = null;
  let reviewerError: string | null = null;

  try {
    const reviewPrompt = buildPaperReviewPrompt(JSON.stringify(paper, null, 2));
    const reviewRaw = await callLLM([
      { role: 'system', content: reviewPrompt },
    ], { temperature: 0.25, maxTokens: 4096, jsonMode: true, timeoutMs: 60000 });
    const parsed = typeof reviewRaw === 'string' ? JSON.parse(reviewRaw) : reviewRaw;
    if (validateReviewStructure(parsed)) {
      reviewResult = parsed as PaperReview;
    } else {
      reviewerError = 'Reviewer output failed structure validation.';
    }
  } catch (err) {
    reviewerError = `Reviewer error: ${err instanceof Error ? err.message : 'Unknown'}`;
    logger.error({ module: 'reading-api', error: reviewerError }, 'Paper review failed');
  }

  // Gate
  const gateResult = evaluateGate(validatorPassed, reviewResult);
  const reviewMeta = buildReviewMetadata(gateResult, reviewResult);

  return NextResponse.json({
    gate: {
      action: gateResult.action,
      validatorPassed,
      reviewerRan: gateResult.reviewerRan,
      reviewerVerdict: gateResult.reviewerVerdict,
      reviewerScore: gateResult.reviewerScore,
      includeReviewerFeedback: gateResult.includeReviewerFeedback,
      warnings: gateResult.warnings,
    },
    validator: {
      passed: validatorPassed,
      issues: bpCheck.issues.slice(0, 10),
      typeFamilyCoverage: bpCheck.typeFamilyCoverage,
    },
    review: reviewResult ? {
      overallScore: reviewResult.overallScore,
      verdict: reviewResult.verdict,
      summary: reviewResult.summary,
      majorStrengths: reviewResult.majorStrengths,
      majorRisks: reviewResult.majorRisks.slice(0, 10),
      sectionReviews: reviewResult.sectionReviews,
      itemNotes: reviewResult.itemNotes?.slice(0, 20),
      priorityFixes: reviewResult.priorityFixes,
    } : null,
    reviewerError,
    metadata: reviewMeta,
  });
}

// ============================================
// Legacy: 單篇 passage 生成（向後兼容）
// ============================================
async function handleLegacyGeneration(body: Record<string, unknown>) {
  const startTime = Date.now();

  // Sprint 102: If called from exercise handler with pre-parsed result, skip AI
  const preParsed = body._preParsedResult as Record<string, unknown> | undefined;
  const { gradeLevel, topic, difficulty, questionCount } = body as {
    gradeLevel?: string;
    topic?: string;
    difficulty?: string;
    questionCount?: number;
  };

  const level = gradeLevel || 'S4';
  const totalQ = Math.min(questionCount || 6, 10);
  const resolvedTopic = normalizeTopic(topic);

  // DSE RAG
  let dseContext = '';
  try {
    if (ragService.isDSERAGEnabled()) {
      const [pastPapers, markingSchemes] = await Promise.all([
        ragService.retrievePastPaperContent('Reading', resolvedTopic, difficulty, level, 3),
        ragService.retrieveMarkingScheme('Reading', 2),
      ]);
      dseContext = ragService.buildDSEContextPrompt(
        pastPapers.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        markingSchemes.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'generate_questions',
      );
    }
  } catch (ragErr) {
    logger.warn({ module: 'reading-api', error: (ragErr as Error).message }, 'DSE RAG retrieval failed');
  }

  const dseContextBlock = dseContext ? `\n\n=== DSE Real Past Paper Reference ===\n${dseContext}\n=== End DSE Reference ===\n` : '';

  // Use lite prompt for legacy path — the full prompt with SKILL_BOUNDARY,
  // SUMMARY_CLOZE, and QUESTION_BLUEPRINT is too large and causes timeouts
  const systemPrompt = buildReadingSectionPromptLite();

  // Sprint 102: Skip AI if pre-parsed result provided (from exercise handler)
  let parsed: Record<string, unknown>;
  let passageWordCount = 0;
  let actualParagraphCount = 0;
  if (preParsed) {
    parsed = preParsed as Record<string, unknown>;
    // 2026-08-30 audit (Round 4): exercise 路徑不得繞過 passage 合約檢查。
    // 以 [Paragraph N] 標記或空行分段計數，強制 3-5 段、250-810 字。
    const pc = (parsed.readingContent || (parsed.passage as Record<string, unknown>)?.content) as string;
    passageWordCount = pc ? pc.split(/\s+/).filter(Boolean).length : 0;
    const markerCount = (pc?.match(/\[Paragraph\s+\d+\]/gi) || []).length;
    const blankLineCount = pc ? pc.split(/\n\s*\n/).filter(s => s.trim().length > 0).length : 0;
    actualParagraphCount = markerCount > 0 ? markerCount : blankLineCount;

    if (passageWordCount > 0 && passageWordCount < 250) {
      return NextResponse.json(
        apiError(`Generated passage too short: ${passageWordCount} words (minimum 250 required). Please try again.`, 'PASSAGE_TOO_SHORT', true),
        { status: 422 },
      );
    }
    if (passageWordCount > 810) {
      return NextResponse.json(
        apiError(`Generated passage too long: ${passageWordCount} words (maximum 800 allowed). Please try again.`, 'PASSAGE_TOO_LONG', true),
        { status: 422 },
      );
    }
    if (actualParagraphCount > 0 && (actualParagraphCount < 3 || actualParagraphCount > 5)) {
      return NextResponse.json(
        apiError(`Generated passage has ${actualParagraphCount} paragraph(s) (3-5 required). Please try again.`, 'PARAGRAPH_COUNT_INVALID', true),
        { status: 422 },
      );
    }
  } else {
    const legacyMaxTokens = getReadingMaxTokens({ mode: 'legacy', estimatedWords: 800 });
    const legacyTimeout = getReadingTimeout({ mode: 'legacy', maxTokens: legacyMaxTokens });

    let rawResult: string;
    let parseResult: { data: Record<string, unknown> | null; error: string | null };
    try {
      rawResult = await callLLM([
        { role: 'system', content: systemPrompt + dseContextBlock },
        { role: 'user', content: `Generate a DSE ${level} reading comprehension passage about "${resolvedTopic}" with ${totalQ} progressive questions using authentic DSE question wording. CRITICAL: The passage MUST be 500-800 words with at least 3 paragraphs. Spread questions across ALL paragraphs — no paragraph should have more than 3 questions.` },
      ], { temperature: 0.45, maxTokens: legacyMaxTokens, jsonMode: true, timeoutMs: legacyTimeout });

      // ── Parse with repair ──
      const repairResult = repairAiJson(rawResult);
      parseResult = safeJsonParse<Record<string, unknown>>(repairResult.repaired, 'legacy-generation');
      
      // Fallback: if repair made things worse, try raw text
      if ((!parseResult.data || parseResult.error) && repairResult.wasRepaired) {
        const rawParse = safeJsonParse<Record<string, unknown>>(rawResult, 'legacy-generation-raw');
        if (rawParse.data) {
          parseResult = rawParse;
          logger.info({ module: 'reading-api' }, 'JSON repair failed but raw parse succeeded — using raw output');
        }
      }

      // Check passage length, paragraph count, and distribution from first attempt
      let distributionBad = false;
      let distroMessage = '';
      let paragraphCountBad = false;
      let passageTooLong = false;
      let toneChoiceBad = false;
      if (parseResult.data) {
        const pc = (parseResult.data.readingContent || (parseResult.data.passage as Record<string, unknown>)?.content) as string;
        passageWordCount = pc ? pc.split(/\s+/).filter(Boolean).length : 0;
        passageTooLong = passageWordCount > 810; // 800 + small buffer for AI imprecision
        
        // Check actual paragraph count (must be 3-5; the upper bound keeps
        // the delivered passage consistent with the README claim)
        actualParagraphCount = (pc?.match(/\[Paragraph\s+\d+\]/gi) || []).length;
        paragraphCountBad = actualParagraphCount < 3 || actualParagraphCount > 5;
        
        // R3.10-L: tone/attitude questions must carry their own choices —
        // the key is never fabricated afterwards.
        const questions0 = (parseResult.data.questions as Array<Record<string, unknown>>) || [];
        toneChoiceBad = hasMissingToneChoices(questions0);
        if (toneChoiceBad) {
          logger.warn({ module: 'reading-api' }, 'toneAttitude/authorIntention question missing choices — needs retry');
        }
        
        // Check paragraph distribution (only if we have enough paragraphs)
        if (!paragraphCountBad) {
          const questions = questions0;
          const paraCount = Math.max(actualParagraphCount, 3);
          if (questions.length > 0) {
            const distro = checkParagraphDistribution(questions, paraCount);
            distributionBad = !distro.valid;
            distroMessage = distro.message;
            if (distributionBad) {
              logger.warn({ module: 'reading-api', distribution: distro.counts, paraCount }, distroMessage);
            }
          }
        }
        
        if (paragraphCountBad) {
          logger.warn({ module: 'reading-api', actualParagraphCount, minRequired: 3 }, 'Too few paragraphs — needs retry');
        }
        
        // ── Verify paragraph reference accuracy ──
        const questions = questions0;
        if (pc && questions.length > 0) {
          const refWarnings = verifyParagraphReferences(questions, pc);
          if (refWarnings.length > 0) {
            logger.warn({ module: 'reading-api', warnings: refWarnings }, 'Paragraph reference mismatch(es) detected');
            // Store for potential retry instruction (but don't block — one mismatch isn't fatal if distribution/word count OK)
          }
        }
      }
      
      // Retry if JSON malformed OR passage too short OR too few paragraphs OR distribution bad
      // BUT only if we have enough time budget remaining (conservative AI budget — see provider-registry)
      const elapsed = Date.now() - startTime;
      const MIN_RETRY_BUDGET_MS = 25_000; // need at least 25s for a retry to be worthwhile
      const contentNeedsRetry = (!parseResult.data || parseResult.error || (passageWordCount > 0 && passageWordCount < 250) || passageTooLong || paragraphCountBad || distributionBad || toneChoiceBad);
      const hasRetryBudget = elapsed < (115_000 - MIN_RETRY_BUDGET_MS); // 115s budget, reserve 5s from 120s
      const needsRetry = contentNeedsRetry && hasRetryBudget;

      if (contentNeedsRetry && !hasRetryBudget) {
        const skipReasons: string[] = [];
        if (!parseResult.data || parseResult.error) skipReasons.push('invalid JSON');
        if (passageWordCount > 0 && passageWordCount < 250) skipReasons.push('passage too short');
        if (passageTooLong) skipReasons.push('passage too long');
        if (paragraphCountBad) skipReasons.push('too few paragraphs');
        if (distributionBad) skipReasons.push(`bad distribution — ${distroMessage}`);
        if (toneChoiceBad) skipReasons.push('tone/attitude question missing choices');
        logger.warn({
          module: 'reading-api',
          elapsed,
          retrySkipped: true,
          reason: skipReasons.join('; '),
        }, 'Skipping retry — insufficient time budget remaining');
      }
      if (needsRetry && !preParsed) {
        // Build a cumulative retry reason (log ALL issues, not just the first)
        const issues: string[] = [];
        if (!parseResult.data || parseResult.error) issues.push('invalid JSON syntax');
        if (passageWordCount > 0 && passageWordCount < 250) issues.push(`passage too short (${passageWordCount} words, min 250)`);
        if (passageTooLong) issues.push(`passage too long (${passageWordCount} words, max 800)`);
        if (paragraphCountBad) issues.push(`too few paragraphs (${actualParagraphCount}, min 3)`);
        if (distributionBad) issues.push(`bad paragraph distribution — ${distroMessage}`);
        if (toneChoiceBad) issues.push('tone/attitude question missing choices');
        const retryReason = issues.join('; ');
        
        logger.warn({ 
          module: 'reading-api', 
          wasRepaired: repairResult.wasRepaired,
          parseError: parseResult.error,
          passageWordCount,
          retryReason,
        }, `Retrying legacy generation — ${retryReason}`);
        
        // Build cumulative retry instruction (address ALL issues simultaneously)
        const retryInstructions: string[] = [];
        if (!parseResult.data || parseResult.error) {
          retryInstructions.push('⚠️ CRITICAL: Your previous response had invalid JSON syntax. You MUST output ONLY valid JSON — no markdown fences, no trailing commas, all property names quoted, all strings properly escaped.');
        }
        if (passageWordCount > 0 && passageWordCount < 250) {
          retryInstructions.push(`⛔ CRITICAL: Your previous passage was ONLY ${passageWordCount} words. You MUST write 500-800 words. Write MORE content — add examples, details, quotes. DO NOT stop early.`);
        }
        if (passageTooLong) {
          retryInstructions.push(`⛔ CRITICAL: Your previous passage was ${passageWordCount} words — TOO LONG (max 800). You MUST shorten to 500-800 words. Remove filler phrases and meta-commentary. Be concise.`);
        }
        if (paragraphCountBad) {
          retryInstructions.push(`⛔ CRITICAL: Your passage only has ${actualParagraphCount} paragraph(s). You MUST generate EXACTLY 3-5 paragraphs, each starting with [Paragraph N] (e.g., [Paragraph 1], [Paragraph 2], [Paragraph 3]). Split your content into separate paragraphs NOW.`);
        }
        if (distributionBad) {
          retryInstructions.push(`⛔ CRITICAL: Your paragraph distribution was WRONG (${distroMessage}). For ${totalQ} questions, you MUST have exactly 2-3 questions per paragraph. REDISTRIBUTE your questions NOW — move some questions from overloaded paragraphs to underloaded ones, and update their paragraph references and question text accordingly.`);
        }
        if (toneChoiceBad) {
          retryInstructions.push('⛔ CRITICAL: Every toneAttitude / authorIntention question MUST include exactly 4 choices labelled A/B/C/D, and its "answer" field MUST be the single letter (A, B, C or D) of the correct choice. Never omit choices for these question types.');
        }
        const retryInstruction = retryInstructions.length > 0
          ? '\n' + retryInstructions.join('\n')
          : '';

        // Adjust retry params:
        // - JSON errors OR too-long: low temp (0.35) for precise output
        // - Content issues (short, few paragraphs, bad distribution): higher temp + more tokens
        const isJsonRetry = !parseResult.data || !!parseResult.error;
        const needsBoost = !isJsonRetry && !passageTooLong && (passageWordCount < 250 || paragraphCountBad || distributionBad);
        const retryTemp = isJsonRetry || passageTooLong ? 0.35 : 0.55;
        const retryMaxTokens = needsBoost ? Math.floor(legacyMaxTokens * 1.3) : legacyMaxTokens;
        const retryTimeout = needsBoost
          ? getReadingTimeout({ mode: 'legacy', maxTokens: retryMaxTokens })
          : legacyTimeout;
        
        const retryRaw = await callLLM([
          { role: 'system', content: systemPrompt + dseContextBlock + retryInstruction },
          { role: 'user', content: `Generate a DSE ${level} reading comprehension passage about "${resolvedTopic}" with ${totalQ} progressive questions. The passage MUST be 500-800 words with 3-5 paragraphs, each marked [Paragraph N]. Questions MUST be evenly distributed (2-3 per paragraph). Output ONLY the JSON object.` },
        ], { temperature: retryTemp, maxTokens: retryMaxTokens, jsonMode: true, timeoutMs: retryTimeout });
        
        const retryRepair = repairAiJson(retryRaw);
        parseResult = safeJsonParse<Record<string, unknown>>(retryRepair.repaired, 'legacy-generation-retry');

        // Fallback: if repair made things worse, try raw retry text
        if ((!parseResult.data || parseResult.error) && retryRepair.wasRepaired) {
          const rawParse = safeJsonParse<Record<string, unknown>>(retryRaw, 'legacy-generation-retry-raw');
          if (rawParse.data) {
            parseResult = rawParse;
            logger.info({ module: 'reading-api' }, 'Retry JSON repair failed but raw parse succeeded — using raw output');
          }
        }

        // Re-check passage length, paragraph count, AND distribution after retry
        if (parseResult.data) {
          const pc = (parseResult.data.readingContent || (parseResult.data.passage as Record<string, unknown>)?.content) as string;
          passageWordCount = pc ? pc.split(/\s+/).filter(Boolean).length : 0;
          actualParagraphCount = (pc?.match(/\[Paragraph\s+\d+\]/gi) || []).length;
          paragraphCountBad = actualParagraphCount < 3 || actualParagraphCount > 5;
          
          // Re-check distribution — retry may still produce bad distribution
          if (!paragraphCountBad && actualParagraphCount >= 3) {
            const questions = (parseResult.data.questions as Array<Record<string, unknown>>) || [];
            const paraCount = Math.max(actualParagraphCount, 3);
            if (questions.length > 0) {
              const retryDistro = checkParagraphDistribution(questions, paraCount);
              if (!retryDistro.valid) {
                distributionBad = true;
                distroMessage = retryDistro.message;
                logger.warn({ module: 'reading-api', distribution: retryDistro.counts, paraCount, stage: 'after-retry' }, `Retry still has ${retryDistro.message}`);
              } else {
                distributionBad = false;
                logger.info({ module: 'reading-api', distribution: retryDistro.counts }, 'Retry fixed distribution');
              }
            }
          }
          
          // Re-check paragraph reference accuracy after retry
          const retryQuestions = (parseResult.data.questions as Array<Record<string, unknown>>) || [];
          if (pc && retryQuestions.length > 0) {
            const refWarnings = verifyParagraphReferences(retryQuestions, pc);
            if (refWarnings.length > 0) {
              logger.warn({ module: 'reading-api', warnings: refWarnings, stage: 'after-retry' }, 'Retry still has paragraph reference mismatch(es)');
            }
          }

          // R3.10-L: re-check tone/attitude choices after retry — questions
          // still missing genuine choices are degraded to short-answer, never
          // given a fabricated key.
          if (hasMissingToneChoices(retryQuestions)) {
            toneChoiceBad = true;
            logger.warn({ module: 'reading-api', stage: 'after-retry' }, 'Retry still has tone/attitude questions missing choices — degrading to short-answer');
          } else {
            toneChoiceBad = false;
          }
        }
      }
    } catch (aiErr: unknown) {
      const aiMsg = aiErr instanceof Error ? aiErr.message : 'AI provider error';
      logger.error({ module: 'reading-api', error: aiMsg }, 'AI call failed in legacy generation');
      return NextResponse.json(
        apiError('The AI service is temporarily unavailable. Please try again in a moment.', 'AI_PROVIDER_ERROR', true, aiMsg),
        { status: 422 },
      );
    }

    if (!parseResult.data || parseResult.error) {
      return NextResponse.json(
        apiError('AI generated malformed reading content', 'MALFORMED_AI_OUTPUT', true, parseResult.error ?? undefined),
        { status: 422 },
      );
    }
    parsed = parseResult.data;

    // Strip markdown bold/italic markers from readingContent (DeepSeek adds **word**)
    const rcKey = parsed.readingContent ? 'readingContent' : 'passage' in parsed ? 'passage' : null;
    if (rcKey) {
      const rcVal = (rcKey === 'passage'
        ? (parsed.passage as Record<string, unknown>)?.content
        : parsed.readingContent) as string;
      if (rcVal && typeof rcVal === 'string') {
        const stripped = rcVal.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
        if (stripped !== rcVal) {
          if (rcKey === 'passage') {
            (parsed.passage as Record<string, unknown>).content = stripped;
          } else {
            parsed.readingContent = stripped;
          }
        }
      }
    }

    // Phase 4D.3: Passage length guard for legacy path (uses pre-computed word count)
    if (passageWordCount > 0 && passageWordCount < 250) {
      logger.warn({ module: 'reading-api', wordCount: passageWordCount, minRequired: 250 }, 'Generated passage too short after retry — rejecting');
      return NextResponse.json(
        apiError(`Generated passage too short: ${passageWordCount} words (minimum 250 required). Please try again with a different topic.`, 'PASSAGE_TOO_SHORT', true),
        { status: 422 },
      );
    }

    // Phase 4D.4: Paragraph count guard — reject passages outside the 3–5
    // paragraph contract (2026-08-30 audit: upper bound now enforced so the
    // delivered passage matches the README claim).
    if (actualParagraphCount > 0 && (actualParagraphCount < 3 || actualParagraphCount > 5)) {
      logger.warn({ module: 'reading-api', paragraphCount: actualParagraphCount, required: '3-5' }, 'Generated passage has invalid paragraph count after retry — rejecting');
      return NextResponse.json(
        apiError(`Generated passage has ${actualParagraphCount} paragraph(s) (3-5 required). Please try again.`, 'PARAGRAPH_COUNT_INVALID', true),
        { status: 422 },
      );
    }

    // Phase 4D.5: Upper word limit guard — reject passages exceeding 810 words (800 + buffer)
    if (passageWordCount > 810) {
      logger.warn({ module: 'reading-api', wordCount: passageWordCount, maxAllowed: 810 }, 'Generated passage too long after retry — rejecting');
      return NextResponse.json(
        apiError(`Generated passage too long: ${passageWordCount} words (maximum 800 allowed). Please try again.`, 'PASSAGE_TOO_LONG', true),
        { status: 422 },
      );
    }
  }

  // ══════════════════════════════════════════
  // Phase 4F: Run validator for diagnostic metadata (non-blocking).
  // Skipping retry loop to stay within the conservative AI time budget.
  // ══════════════════════════════════════════
  let validatorResult: ReadingValidationResult | null = null;

  if (!preParsed) {
    const content = (parsed.readingContent || (parsed.passage as Record<string, unknown>)?.content) as string;
    const questions = (parsed.questions as DSEreadingQuestion[]) || [];
    const paraCount = Math.max((content?.match(/\[Paragraph\s+\d+\]/gi) || []).length, 3);

    validatorResult = validateReadingQuestionSet(questions, {
      readingContent: content,
      paragraphCount: paraCount,
    });

    if (!validatorResult.isValid) {
      const codes = validatorResult.issues.filter(i => i.severity === 'error').map(i => i.code);
      logger.warn({
        module: 'reading-api',
        errorCodes: codes,
        metrics: validatorResult.metrics,
      }, 'Validator issues found (non-blocking — returning output anyway)');
    }
  }

  // Attach readability if passage content exists
  if (parsed.readingContent || (parsed.passage as Record<string, unknown>)?.content) {
    const content = (parsed.readingContent || (parsed.passage as Record<string, unknown>)?.content) as string;
    const metrics = estimateReadability(content);
    const readabilityLevel = mapReadabilityToHKEAALevel(metrics);
    const hkCheck = checkHKLocalContent(content);
    parsed._readability = { ...metrics, estimatedHKEAALevel: readabilityLevel };
    parsed._hkLocal = hkCheck;

    // Phase 3A: Blueprint validation on legacy generation (backward compat)
    const legacyQuestions = (parsed.questions as DSEreadingQuestion[]) || [];
    if (legacyQuestions.length > 0) {
      const paraCount = Math.max((content.match(/\[Paragraph\s+\d+\]/gi) || []).length, 3);
      const bpCheck = validateQuestionSetBlueprint(legacyQuestions, paraCount, { mode: 'legacy' });
      const mcIssues = validateAllMCDistractors(legacyQuestions);
      const combined = [...bpCheck.issues, ...mcIssues];
      const combinedCheck = {
        ...bpCheck,
        issues: combined,
        passed: !combined.some(i => i.severity === 'critical'),
        issueMessages: combined.map(i => `[${i.severity}] ${i.code}: ${i.message}`),
      };
      if (!combinedCheck.passed) {
        logger.warn({ module: 'reading-api', issues: combinedCheck.issueMessages }, 'Blueprint + MC validation warnings');
      }
      const retried = false; // No retry in non-blocking validator mode
      parsed._blueprintQuality = toBlueprintQualityMeta(combinedCheck, retried);

      // Phase 4F: Attach new validator result for diagnostics
      if (validatorResult) {
        parsed._validatorQuality = {
          isValid: validatorResult.isValid,
          retries: 0,
          errorCodes: validatorResult.issues.filter(i => i.severity === 'error').map(i => i.code),
          warningCodes: validatorResult.issues.filter(i => i.severity === 'warning').map(i => i.code),
          metrics: validatorResult.metrics,
        };
      }
    } else {
      parsed._blueprintQuality = {
        passed: true, retried: false, degraded: false, validated: false, issues: [],
      };
    }
  }

  const elapsed = Date.now() - startTime;
  logger.info({ module: 'reading-api', level, topic, elapsed, mode: 'legacy' }, 'Legacy passage generated');

  // Transform AI output to match frontend ReadingData interface
  // The v2 AI prompt returns { readingContent } and questions with { questionText, type: "mcq", choices: ["A. ..."] }
  // but frontend expects { passage: { title, content, wordCount } } and questions with { question, type: "mc", choices: ["..."] }
  const response: Record<string, unknown> = { ...parsed };

  // 1. Transform passage format: strip markers, build clean paragraphs
  if (!response.passage && response.readingContent) {
    let content = response.readingContent as string;

    // Step A: Strip ALL AI line markers
    content = content.replace(/\[line\s+\d+\]\s*/gi, '');
    content = content.replace(/\s*\[\d+\]\s*/g, ' ');

    // Step B: Split into paragraphs — only use explicit [Paragraph N] markers or natural double newlines
    // Do NOT guess paragraph boundaries from transition words — that creates false breaks
    let parts = content.split(/\n\n+/).filter(p => p.trim().length > 30);
    // If only 1 block, try splitting on [Paragraph N] markers
    if (parts.length <= 1) {
      const markerSplit = content.split(/\[Paragraph\s+\d+\]/gi);
      parts = markerSplit.filter(p => p.trim().length > 30);
    }
    // Fallback: if still one block, keep as-is — don't guess paragraph boundaries

    // ⚠️ CRITICAL: Normalize single newlines within each paragraph to spaces.
    // The AI wraps lines at ~60-70 chars in its JSON output, producing hard breaks
    // that destroy the reading flow. Each paragraph must be continuous prose.
    parts = parts.map(p => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim());

    const cleanContent = parts.join('\n\n');
    const totalWords = cleanContent.split(/\s+/).filter(Boolean).length;

    response.passage = {
      title: topic ? `${resolvedTopic.charAt(0).toUpperCase() + resolvedTopic.slice(1)} Reading` : 'Reading Passage',
      content: cleanContent,
      wordCount: totalWords,
      source: parsed.source || undefined,
    };
    delete response.readingContent;

    // ── Phase 1: Compute real paragraph/line refs using layout engine ──
    const questionsRaw = response.questions as Array<Record<string, unknown>> | undefined;
    const passageContent = cleanContent;
    if (questionsRaw && passageContent) {
      let layout: Awaited<ReturnType<typeof import('@/modules/reading/layout')['layoutReadingText']>>;
      try {
        const { layoutReadingText: doLayout } = await import('@/modules/reading/layout');
        layout = doLayout(passageContent);
      } catch (layoutErr) {
        logger.warn({ module: 'reading-api', error: (layoutErr as Error).message }, 'Layout engine failed — skipping paragraph ref computation');
        layout = null as unknown as typeof layout;
      }
      if (layout) {
      for (const q of questionsRaw) {
        const questionText = (q.questionText || q.question || '') as string;

        const aiParaMatch = questionText.match(/paragraph\s+(\d+)/i);
        const aiParagraph = aiParaMatch ? parseInt(aiParaMatch[1], 10) : undefined;

        let targetPhrase = (q.targetPhrase as string)?.trim();
        if (!targetPhrase) {
          const quotedMatch = questionText.match(/['\u2018\u2019\u201C\u201D"]([^'\u2018\u2019\u201C\u201D"]{3,60})['\u2018\u2019\u201C\u201D"]/);
          if (quotedMatch) targetPhrase = quotedMatch[1];
        }

        if (targetPhrase) {
          let bestMatch: number | null = null;
          let aiMatch: number | null = null;

          for (const para of layout.paragraphs) {
            const paraText = para.lines.map(l => l.text).join(' ');
            if (paraText.includes(targetPhrase)) {
              if (aiParagraph && para.paragraphNumber === aiParagraph) {
                aiMatch = para.paragraphNumber;
              }
              if (!bestMatch) bestMatch = para.paragraphNumber;
            }
          }

          const chosen = aiMatch || bestMatch;
          if (chosen) q._computedParagraph = chosen;
        }

        if (!q._computedParagraph && aiParagraph) {
          q._computedParagraph = aiParagraph;
        }
      }
      } // close if (layout)
    }

    // ── Phase 2: Transform questions with computed refs ──
    if (Array.isArray(response.questions)) {
      response.questions = splitTFNGSubQuestions(response.questions as Array<Record<string, unknown>>);
      if ((response.questions as Array<Record<string, unknown>>).length > totalQ) {
        response.questions = (response.questions as Array<Record<string, unknown>>).slice(0, totalQ);
      }
      response.questions = (response.questions as Array<Record<string, unknown>>).map((q: Record<string, unknown>, i: number) => {
        let rawQuestion = (q.questionText as string) || (q.question as string) || '';
        const questionZh = (q.questionTextZh as string) || (q.questionZh as string) || undefined;

        let question = rawQuestion.replace(/\s*\(line\s+\d+(-\d+)?\)\s*/gi, ' ');

        // Correct AI's wrong paragraph reference with computed value
        const computedPara = q._computedParagraph as number | undefined;
        // Fallback: parse paragraph number from question text if computed value is missing
        // Skip for summaryCloze — they span the whole passage
        const isSummary = (q.type as string) === 'summaryCloze';
        const textParaMatch = isSummary ? null : rawQuestion.match(/(?:paragraph|para\.?)\s*(\d+)/i);
        const textPara = textParaMatch ? parseInt(textParaMatch[1], 10) : undefined;
        const resolvedPara = computedPara || textPara;
        if (resolvedPara) {
          q.paragraphRef = resolvedPara;
          question = question.replace(
            /(According to|With reference to|Based on|In)\s+paragraph\s+\d+/gi,
            `$1 paragraph ${resolvedPara}`,
          );
        }
        question = question.replace(/\s+/g, ' ').trim();

        const aiType = (q.type as string) || 'shortAnswer';

        // Sprint 110: Fix summaryCloze single-paragraph references — they always span the whole passage
        if (aiType === 'summaryCloze') {
          question = question.replace(
            /(according to|with reference to|based on|in|complete the following summary of)\s+paragraph\s+\d+/gi,
            '$1 the passage'
          );
        }

        let choices: string[] | undefined;
        if (Array.isArray(q.choices)) {
          choices = (q.choices as string[]).map((c: string) => c.replace(/^[A-D][).]\s*/, ''));
          const substantive = choices.filter(c => c.trim().length > 2);
          if (substantive.length === 0) choices = undefined;
        }
        if (aiType === 'trueFalseNG' && (!choices || choices.length === 0)) {
          choices = ['True', 'False', 'Not Given'];
        }
        // R3.10-L: NEVER fabricate tone/attitude choices + a keyword-guessed
        // answer key. A question without genuine choices is delivered as an
        // AI-scored short-answer question instead (the LLM-authored answer
        // text remains the key; tone_attitude routes to AI semantic scoring).
        // 2026-08-29 audit: require exactly 4 substantive choices to deliver
        // as MCQ — 2-3 option tone questions degrade to short-answer too.
        // 2026-08-30 audit (R8): threshold aligned with hasMissingToneChoices
        // (>2 length) — bare-letter placeholders must not count as choices.
        if (aiType === 'toneAttitude' || aiType === 'authorIntention') {
          const substantive = choices ? choices.filter(c => c.trim().length > 2) : [];
          if (substantive.length < 4) choices = undefined;
        }

        const tier = (q.tier as string)
          || (aiType === 'inference' || aiType === 'toneAttitude' ? 'inferential'
          : aiType === 'summaryCloze' || aiType === 'authorIntention' ? 'evaluative'
          : i < totalQ / 3 ? 'literal' : i < (totalQ * 2) / 3 ? 'inferential' : 'evaluative');

        // Use system-computed paragraphRef from Phase 1
        const paragraphRef = (q.paragraphRef as number) || undefined;
        const dseType = mapDseTypeToFrontend(aiType);

        // 2026-08-30 audit: a degraded tone question (choices removed) whose
        // answer key is a bare letter/number is meaningless for short-answer
        // scoring — clear the key so the empty-answer drop below removes it.
        const degradedToneLetterKey =
          (aiType === 'toneAttitude' || aiType === 'authorIntention') &&
          !choices &&
          /^\s*\(?[A-Da-d1-4]\)?[).、]?\s*$/.test(String(q.answer ?? '').trim());

        return {
          // R3.7: 伺服器分配的正典題目 id（assignServerOwnedQuestionIds
          // 於生成時持久化題目定義並回填 id）。
          id: '',
          index: (q.index as number) || i + 1,
          tier,
          paragraphRef: paragraphRef ? Math.min(paragraphRef, 7) : undefined,
          question,
          questionZh,
          type: isMcLikeDseType(dseType) && choices && choices.length >= 2 ? 'mc' : 'short-answer',
          dseType,
          marks: (q.marks as number) || 1,
          wordLimit: (q.wordLimit as string) || undefined,
          acceptAlso: Array.isArray(q.acceptAlso) ? q.acceptAlso as string[] : [],
          paragraphCoverage: paragraphRef ? [paragraphRef] : [],
          wholeText: false,
          choices: isMcLikeDseType(dseType) && choices ? choices : undefined,
          answer: degradedToneLetterKey ? '' : (q.answer as string) || '',
          explanationZh: (q.explanationZh as string) || undefined,
          explanationEn: (q.explanationEn as string) || undefined,
        };
      });
      // 2026-08-29 audit: never persist/deliver a question whose canonical
      // answer key is empty — it cannot be scored fairly (a blank student
      // answer would exact-match a blank key and earn full marks).
      const qCountBeforeDrop = (response.questions as Array<Record<string, unknown>>).length;
      response.questions = (response.questions as Array<Record<string, unknown>>).filter(
        q => String(q.answer ?? '').trim().length > 0,
      );
      if ((response.questions as Array<Record<string, unknown>>).length < qCountBeforeDrop) {
        logger.warn({ module: 'reading', dropped: qCountBeforeDrop - (response.questions as Array<Record<string, unknown>>).length }, 'Dropped questions with empty answer keys');
      }
      response.questions = filterUngroundedPhraseSearch(
        response.questions as Array<Record<string, unknown>>,
        cleanContent,
      );
      response.questions = await assignServerOwnedQuestionIds(
        response.questions as Array<Record<string, unknown>>,
      );
    }
  } else {
    // 2. Transform question format from v2 AI output to legacy frontend format (no passage transform needed)
    if (Array.isArray(response.questions)) {
      response.questions = splitTFNGSubQuestions(response.questions as Array<Record<string, unknown>>);
      // Sprint 102: Trim to requested count after TFNG splitting
      if ((response.questions as Array<Record<string, unknown>>).length > totalQ) {
        response.questions = (response.questions as Array<Record<string, unknown>>).slice(0, totalQ);
      }
      response.questions = (response.questions as Array<Record<string, unknown>>).map((q: Record<string, unknown>, i: number) => {
        // Map questionText → question
        const question = (q.questionText as string) || (q.question as string) || '';
        const questionZh = (q.questionTextZh as string) || (q.questionZh as string) || undefined;

        // Map AI question type to legacy type (Sprint 102: expanded MCQ types)
        const aiType = (q.type as string) || 'shortAnswer';

        // Sprint 110: Fix summaryCloze single-paragraph references — they always span the whole passage
        const questionFixed = aiType === 'summaryCloze'
          ? question.replace(
              /(according to|with reference to|based on|in|complete the following summary of)\s+paragraph\s+\d+/gi,
              '$1 the passage'
            )
          : question;

        // Strip "A. " prefix from choices if present
        let choices: string[] | undefined;
        if (Array.isArray(q.choices)) {
          choices = (q.choices as string[]).map((c: string) => c.replace(/^[A-D][).]\s*/, ''));
          const substantive = choices.filter(c => c.trim().length > 2);
          if (substantive.length === 0) choices = undefined;
        }
        // Sprint 102: Auto-provide TFNG choices when AI doesn't include them
        if (aiType === 'trueFalseNG' && (!choices || choices.length === 0)) {
          choices = ['True', 'False', 'Not Given'];
        }
        // R3.10-L: NEVER fabricate tone/attitude choices + a keyword-guessed
        // answer key. A question without genuine choices is delivered as an
        // AI-scored short-answer question instead (the LLM-authored answer
        // text remains the key; tone_attitude routes to AI semantic scoring).
        // 2026-08-29 audit: require exactly 4 substantive choices to deliver
        // as MCQ — 2-3 option tone questions degrade to short-answer too.
        // 2026-08-30 audit (R8): threshold aligned with hasMissingToneChoices.
        if (aiType === 'toneAttitude' || aiType === 'authorIntention') {
          const substantive = choices ? choices.filter(c => c.trim().length > 2) : [];
          if (substantive.length < 4) choices = undefined;
        }

        // Determine tier from question metadata or default based on position
        const tier = (q.tier as string)
          || (aiType === 'inference' || aiType === 'toneAttitude' ? 'inferential'
          : aiType === 'summaryCloze' || aiType === 'authorIntention' ? 'evaluative'
          : i < totalQ / 3 ? 'literal' : i < (totalQ * 2) / 3 ? 'inferential' : 'evaluative');

        // Use system-computed paragraphRef (set below via targetPhrase mapping)
        const paragraphRef = (q.paragraphRef as number) || undefined;
        const dseType2 = mapDseTypeToFrontend(aiType);

        // 2026-08-30 audit: a degraded tone question (choices removed) whose
        // answer key is a bare letter/number is meaningless for short-answer
        // scoring — clear the key so the empty-answer drop below removes it.
        const degradedToneLetterKey =
          (aiType === 'toneAttitude' || aiType === 'authorIntention') &&
          !choices &&
          /^\s*\(?[A-Da-d1-4]\)?[).、]?\s*$/.test(String(q.answer ?? '').trim());

        return {
          // R3.7: 伺服器分配的正典題目 id（assignServerOwnedQuestionIds
          // 於生成時持久化題目定義並回填 id）。
          id: '',
          index: (q.index as number) || i + 1,
          tier,
          paragraphRef: paragraphRef ? Math.min(paragraphRef, 7) : undefined,
          question: questionFixed,
          questionZh,
          type: isMcLikeDseType(dseType2) && choices && choices.length >= 2 ? 'mc' : 'short-answer',
          dseType: dseType2,
          marks: (q.marks as number) || 1,
          wordLimit: (q.wordLimit as string) || undefined,
          acceptAlso: Array.isArray(q.acceptAlso) ? q.acceptAlso as string[] : [],
          paragraphCoverage: paragraphRef ? [paragraphRef] : [],
          wholeText: false,
          choices: isMcLikeDseType(dseType2) && choices ? choices : undefined,
          answer: degradedToneLetterKey ? '' : (q.answer as string) || '',
          explanationZh: (q.explanationZh as string) || undefined,
          explanationEn: (q.explanationEn as string) || undefined,
        };
      });
      // 2026-08-29 audit: never persist/deliver a question whose canonical
      // answer key is empty — it cannot be scored fairly (a blank student
      // answer would exact-match a blank key and earn full marks).
      const qCountBeforeDrop = (response.questions as Array<Record<string, unknown>>).length;
      response.questions = (response.questions as Array<Record<string, unknown>>).filter(
        q => String(q.answer ?? '').trim().length > 0,
      );
      if ((response.questions as Array<Record<string, unknown>>).length < qCountBeforeDrop) {
        logger.warn({ module: 'reading', dropped: qCountBeforeDrop - (response.questions as Array<Record<string, unknown>>).length }, 'Dropped questions with empty answer keys');
      }
      response.questions = filterUngroundedPhraseSearch(
        response.questions as Array<Record<string, unknown>>,
        (response.passage as { content?: string } | undefined)?.content ?? '',
      );
      response.questions = await assignServerOwnedQuestionIds(
        response.questions as Array<Record<string, unknown>>,
      );
    }
  }
  response._metadata = { generationTimeMs: elapsed, mode: 'legacy-single-passage' };

  return NextResponse.json(response);
}

// ============================================
// Helper: Generate targeted recommendations
// ============================================

// ============================================
// R3.7: 生成時持久化伺服器持有的正典題目定義
// ============================================
/**
 * Persist each generated question as a server-owned definition and
 * assign the persisted id as its canonical identity.
 *
 * R37-H05: generation semantics — every generation request produces a
 * NEW set of immutable definitions (no dedup of identical content).
 * createMany is a single atomic statement: either the whole set is
 * persisted or the request fails — there is no partial set. If the
 * write fails, the error propagates (HTTP 500) so the client retries;
 * no rd-* fallback ids are ever produced for new generations.
 */
async function assignServerOwnedQuestionIds(
  questions: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const ids = await persistGeneratedReadingQuestions(
    questions.map((q, i) => ({
      questionType: String(q.type || 'short-answer'),
      dseType: typeof q.dseType === 'string' ? q.dseType : null,
      questionText: String(q.question || ''),
      choices: Array.isArray(q.choices) ? (q.choices as string[]) : null,
      answer: String(q.answer || ''),
      marks: typeof q.marks === 'number' && Number.isFinite(q.marks) && q.marks > 0 ? q.marks : 1,
      orderIndex: i,
    })),
  );
  return questions.map((q, i) => ({ ...q, id: ids[i] }));
}

function generateRecommendations(
  errorBreakdown: Record<string, number>,
  typeBreakdown: Record<string, { correct: number; total: number }>,
): string[] {
  const recommendations: string[] = [];

  // Error-type based recommendations (bilingual)
  if (errorBreakdown['reference_error']) {
    recommendations.push('🔍 代詞指涉題 (Reference) 較弱：建議練習「向前找1-2句的原則」，並將答案代入原句檢查。 / Reference questions are a weak point: practise the "look back 1-2 sentences" rule and substitute your answer back into the original sentence to check.');
  }
  if (errorBreakdown['false_vs_ng_confusion']) {
    recommendations.push('⚠️ T/F/NG 混淆 False 與 Not Given：False = 文章明確反對；NG = 文章完全沒有提及。請複習此區別。 / T/F/NG confusion between False and Not Given: False = the text clearly contradicts; NG = the text does not mention it at all. Review this distinction.');
  }
  if (errorBreakdown['inference_error']) {
    recommendations.push('🧠 推論題 (Inference) 需要加強：不要 over-infer，只推斷文中有 evidence 支持的內容。 / Inference questions need work: do not over-infer — only draw conclusions supported by evidence in the text.');
  }
  if (errorBreakdown['vocabulary_error']) {
    recommendations.push('📖 詞彙題 (Vocabulary) 需改善：使用 context clues（前後2句）推斷詞義，不要只看字典意思。 / Vocabulary questions: use context clues (2 sentences before/after) to infer meaning instead of relying only on dictionary definitions.');
  }
  if (errorBreakdown['word_limit_exceeded']) {
    recommendations.push('✂️ 注意字數限制：DSE 明確要求 "ONE word" 或 "no more than THREE words"，超出即失分。 / Mind the word limit: DSE explicitly requires "ONE word" or "no more than THREE words" — exceeding it loses marks.');
  }

  // Question-type based recommendations (bilingual)
  for (const [type, stats] of Object.entries(typeBreakdown)) {
    if (stats.total >= 2 && stats.correct / stats.total < 0.5) {
      const typeName = type.replace(/([A-Z])/g, ' $1').trim();
      recommendations.push(`📋 ${typeName} 題型正確率低於50%，建議針對此題型進行專項訓練。 / Accuracy on ${typeName} questions is below 50% — consider targeted practice on this question type.`);
    }
  }

  return recommendations;
}
