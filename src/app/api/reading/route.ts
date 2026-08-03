// ============================================
// API: /api/reading — DSE Paper 1 閱讀理解 v3
// Features:
//   - Full DSE Paper generation (multi-passage, 42 marks)
//   - 19 question types with EXACT DSE wording
//   - B1/B2 level cap enforcement
//   - Passage quality validation (word count, line markers, readability)
//   - HK-local content density check
//   - Wrong answer analysis & classification
//   - Summary Cloze / Paraphrase / Idiom training endpoints
//   - Time management metadata
//   - Sprint 102: Rubric-based semantic evaluation (HKDSE-examiner style)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { evaluateWithAI } from '@/modules/ai/services/ai-evaluator';
import type { AIEvaluationResult } from '@/modules/ai/services/ai-evaluator';
import type { QuestionRubric } from '@/modules/ai/prompts/reading/types';
import { callLLM } from '@/modules/ai/services/ai-service';
import {
  retrievePastPaperContent,
  retrieveMarkingScheme,
  buildDSEContextPrompt,
  isDSERAGEnabled,
} from '@/modules/ai/services/rag-service';
import { logger } from '@/shared/logger/logger';
import {
  buildFullDSEPaperPrompt,
  buildReadingSectionPrompt,
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
  passageWordCountRange,
  recommendedQuestionCount,
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
import { evaluateGate, buildReviewerRetryFeedback, buildReviewMetadata } from '@/modules/reading/review/paper-reviewer-gate';
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
  estimateCopyingRatio,
  classifyCopyingLevel,
  classifyParaphraseQuality,
  detectLexicalShift,
  detectStructuralShift,
  detectGrammarFit,
  assessCompleteness,
  buildEvaluation,
} from '@/modules/reading/evaluation';
import type { ReadingAnswerEvaluation } from '@/modules/reading/evaluation';
import { buildReadingDiagnosticFeedback } from '@/modules/reading/feedback';
import type { ReadingDiagnosticFeedback } from '@/modules/reading/feedback';

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

function isMcLikeDseType(dseType: string): boolean {
  return dseType === 'multiple_choice' || dseType === 'true_false_not_given';
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
  // Proportional timeout: ~2.5ms per token, min 25s, max 60s
  return Math.min(60000, Math.max(25000, Math.ceil(params.maxTokens * 0.0025)));
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
      { status: 500 },
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
        _subLabel: sub.label,
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
    if (isDSERAGEnabled()) {
      const [pastPapers, markingSchemes] = await Promise.all([
        retrievePastPaperContent('Reading', topic || 'general interest', undefined, gradeLevel, 3),
        retrieveMarkingScheme('Reading', 2),
      ]);
      dseContext = buildDSEContextPrompt(
        pastPapers.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        markingSchemes.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'generate_questions',
      );
      if (dseContext) {
        logger.info({ module: 'reading-api', topic, paperCount: pastPapers.length }, 'DSE RAG context built for full paper');
      }
    }
  } catch (ragErr) {
    logger.warn({ module: 'reading-api', error: (ragErr as Error).message }, 'DSE RAG retrieval failed, continuing without it');
  }

  const systemPrompt = buildFullDSEPaperPrompt({
    gradeLevel,
    part: validatedPart,
    targetLevel: resolvedLevel,
    topic: topic as string | undefined,
    textTypes: textTypes as string[] | undefined,
  });

  const dseContextBlock = dseContext ? `\n\n=== DSE Real Past Paper Reference ===\n${dseContext}\n=== End DSE Reference ===\n` : '';

  const result = await callLLM([
    { role: 'system', content: systemPrompt + dseContextBlock },
    { role: 'user', content: `Generate a complete DSE Paper 1 Part ${validatedPart} paper for ${gradeLevel} students (target Level ${resolvedLevel}) about "${topic || 'DSE-appropriate topic'}". Return the complete JSON paper object.` },
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

  const validatedPart: DSEpart = ['A', 'B1', 'B2'].includes(partLabel as string) ? partLabel as DSEpart : 'A';
  const targetLevel = platformDifficultyToHKEAALevel(difficulty, validatedPart);

  const prompt = buildReadingExercisePrompt({
    count: Math.min(count, 10),
    difficultyLabel: { remedial: '補底', core: '核心', challenge: '挑戰' }[difficulty],
    gradeLevel,
    topic: topic || 'DSE-appropriate topic',
    partLabel: validatedPart,
    targetLevel,
  });

  const result = await callLLM([
    { role: 'system', content: prompt },
    { role: 'user', content: `Generate ${count} DSE Paper 1 Part ${validatedPart} reading questions (${difficulty} level, ${gradeLevel}) about "${topic || 'general interest'}". The reading passage MUST be 500-800 words. Spread questions across ALL paragraphs evenly. Return JSON.` },
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
async function handleAnswerAnalysis(body: Record<string, unknown>) {
  const {
    questions,
    studentAnswers,
    passageContent,
  } = body as {
    questions: DSEreadingQuestion[];
    studentAnswers: Record<number, string>;
    passageContent?: string;
  };

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
    const useApi = requiresApiEvaluation(dseType);

    let result: AIEvaluationResult;

    if (!useApi) {
      // Objective: simple exact/semantic matching — no AI needed
      const normAns = studentAnswer.toLowerCase().trim();
      const normCorrect = q.answer.toLowerCase().trim();
      const isExact = normAns === normCorrect;
      const isContained = normCorrect.includes(normAns) && normAns.length > 2;
      result = {
        score: isExact ? q.marks : isContained ? q.marks : 0,
        maxScore: q.marks,
        isCorrect: isExact || isContained,
        isPartiallyCorrect: false,
        feedbackZh: isExact ? '✅ 正確！' : isContained ? '✅ 正確！' : `❌ 不正確。參考答案：${q.answer}`,
        feedbackEn: isExact ? '✅ Correct!' : isContained ? '✅ Correct!' : `❌ Incorrect. Expected: ${q.answer}`,
      };
    } else {
      // Subjective: use AI semantic evaluation
      result = await evaluateWithAI(studentAnswer, q.answer, q.questionText || '', q.marks);
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

  // Estimate HKEAA level from accuracy (rough mapping)
  const estimatedLevel: HKEAALevel = accuracy >= 0.85 ? 5 : accuracy >= 0.70 ? 4 : accuracy >= 0.50 ? 3 : accuracy >= 0.30 ? 2 : 1;

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

  // DSE RAG
  let dseContext = '';
  try {
    if (isDSERAGEnabled()) {
      const [pastPapers, markingSchemes] = await Promise.all([
        retrievePastPaperContent('Reading', topic || 'general interest', difficulty, level, 3),
        retrieveMarkingScheme('Reading', 2),
      ]);
      dseContext = buildDSEContextPrompt(
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
  if (preParsed) {
    parsed = preParsed as Record<string, unknown>;
  } else {
    let rawResult: string;
    try {
      // Timeout: 30s for initial generation (Vercel 60s budget: 30s init + 2×15s retries)
      rawResult = await callLLM([
        { role: 'system', content: systemPrompt + dseContextBlock },
        { role: 'user', content: `Generate a DSE ${level} reading comprehension passage about "${topic || 'general interest'}" with ${totalQ} progressive questions using authentic DSE question wording. CRITICAL: The passage MUST be 500-800 words with at least 3 paragraphs. Spread questions across ALL paragraphs — no paragraph should have more than 3 questions.` },
      ], { temperature: 0.45, maxTokens: getReadingMaxTokens({ mode: 'legacy', estimatedWords: 800 }), jsonMode: true, timeoutMs: 30000 });
    } catch (aiErr: unknown) {
      const aiMsg = aiErr instanceof Error ? aiErr.message : 'AI provider error';
      logger.error({ module: 'reading-api', error: aiMsg }, 'AI call failed in legacy generation');
      return NextResponse.json(
        apiError('The AI service is temporarily unavailable. Please try again in a moment.', 'AI_PROVIDER_ERROR', true, aiMsg),
        { status: 422 },
      );
    }

    const parseResult = safeJsonParse<Record<string, unknown>>(rawResult, 'legacy-generation');
    if (!parseResult.data || parseResult.error) {
      return NextResponse.json(
        apiError('AI generated malformed reading content', 'MALFORMED_AI_OUTPUT', true, parseResult.error ?? undefined),
        { status: 422 },
      );
    }
    parsed = parseResult.data;

    // Phase 4D.3: Passage length guard for legacy path
    const passageContent = (parsed.readingContent || (parsed.passage as Record<string, unknown>)?.content) as string;
    if (passageContent) {
      const wordCount = passageContent.split(/\s+/).filter(Boolean).length;
      if (wordCount < 250) {
        logger.warn({ module: 'reading-api', wordCount, minRequired: 250 }, 'Generated passage too short — rejecting');
        return NextResponse.json(
          apiError(`Generated passage too short: ${wordCount} words (minimum 250 required). Please try again with a different topic.`, 'PASSAGE_TOO_SHORT', true),
          { status: 422 },
        );
      }
    }
  }

  // ══════════════════════════════════════════
  // Phase 4F: Validator-based quality gate — up to 2 regeneration attempts
  // Replaces the old blueprint-only retry with comprehensive validation.
  // ══════════════════════════════════════════
  let validatorRetries = 0;
  const MAX_VALIDATOR_RETRIES = 2;
  let validatorResult: ReadingValidationResult | null = null;

  if (!preParsed) {
    const content = (parsed.readingContent || (parsed.passage as Record<string, unknown>)?.content) as string;
    let questions = (parsed.questions as DSEreadingQuestion[]) || [];
    const paraCount = Math.max((content?.match(/\[Paragraph\s+\d+\]/gi) || []).length, 3);

    validatorResult = validateReadingQuestionSet(questions, {
      readingContent: content,
      paragraphCount: paraCount,
    });

    while (!validatorResult.isValid && validatorRetries < MAX_VALIDATOR_RETRIES) {
      const errorCodes = validatorResult.issues
        .filter(i => i.severity === 'error')
        .map(i => i.code);
      logger.warn({
        module: 'reading-api',
        attempt: validatorRetries + 1,
        errorCodes,
        metrics: validatorResult.metrics,
      }, 'Validator found errors — regenerating');

      const errorMessages = validatorResult.issues
        .filter(i => i.severity === 'error')
        .map(i => `- [${i.code}] ${i.message}`)
        .join('\n');
      const retryPrompt = `\n\n## ⚠️ REGENERATION REQUIRED — Fix ALL of these issues:\n${errorMessages}\n\nReturn JSON with the corrected question set.`;

      try {
        const retryRaw = await callLLM([
          { role: 'system', content: systemPrompt + dseContextBlock + retryPrompt },
          { role: 'user', content: `Regenerate the question set. Fix ALL of the issues listed above. Passage must be 500-800 words. Return JSON.` },
        ], { temperature: 0.40, maxTokens: getReadingMaxTokens({ mode: 'legacy', estimatedWords: 800 }), jsonMode: true, timeoutMs: 15000 });

        const retryParse = safeJsonParse<Record<string, unknown>>(retryRaw, 'legacy-validator-retry');
        if (retryParse.data && !retryParse.error) {
          parsed = retryParse.data;
          const newContent = (parsed.readingContent || (parsed.passage as Record<string, unknown>)?.content) as string;
          questions = (parsed.questions as DSEreadingQuestion[]) || [];
          const newParaCount = Math.max((newContent?.match(/\[Paragraph\s+\d+\]/gi) || []).length, 3);
          validatorResult = validateReadingQuestionSet(questions, {
            readingContent: newContent || content,
            paragraphCount: Math.max(newParaCount, paraCount),
          });
        } else {
          logger.warn({ module: 'reading-api', error: retryParse.error }, 'Validator retry parse failed — stopping');
          break;
        }
      } catch (retryErr) {
        logger.warn({ module: 'reading-api', error: (retryErr as Error).message }, 'Validator retry AI call failed — stopping');
        break;
      }
      validatorRetries++;
    }

    // If still invalid after all retries, return structured 422
    if (validatorResult && !validatorResult.isValid) {
      const codes = validatorResult.issues
        .filter(i => i.severity === 'error')
        .map(i => i.code);
      const messages = validatorResult.issues
        .filter(i => i.severity === 'error')
        .slice(0, 5)
        .map(i => i.message);
      logger.error({
        module: 'reading-api',
        attempts: validatorRetries + 1,
        errorCodes: codes,
        metrics: validatorResult.metrics,
      }, 'Validator still failing after max retries');
      return NextResponse.json(
        apiError(
          `Generated reading content does not meet quality standards: ${messages.join('; ')}`,
          'VALIDATOR_FAILED',
          true,
          JSON.stringify({ errorCodes: codes, attempts: validatorRetries + 1 }),
        ),
        { status: 422 },
      );
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
      const retried = validatorRetries > 0;
      parsed._blueprintQuality = toBlueprintQualityMeta(combinedCheck, retried);

      // Phase 4F: Attach new validator result for diagnostics
      if (validatorResult) {
        parsed._validatorQuality = {
          isValid: validatorResult.isValid,
          retries: validatorRetries,
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
      title: topic ? `${topic.charAt(0).toUpperCase() + topic.slice(1)} Reading` : 'Reading Passage',
      content: cleanContent,
      wordCount: totalWords,
      source: parsed.source || undefined,
    };
    delete response.readingContent;

    // ── Phase 1: Compute real paragraph/line refs using layout engine ──
    const questionsRaw = response.questions as Array<Record<string, unknown>> | undefined;
    const passageContent = cleanContent;
    if (questionsRaw && passageContent) {
      const { layoutReadingText } = await import('@/modules/reading/layout');
      const layout = layoutReadingText(passageContent);
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
        const textParaMatch = rawQuestion.match(/(?:paragraph|para\.?)\s*(\d+)/i);
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
        const MCQ_TYPES = ['mcq', 'mcCloze', 'trueFalseNG', 'toneAttitude', 'authorIntention', 'negativeInference', 'vocabularyInContext', 'summaryCloze', 'sequencing', 'tableCompletion', 'matching'];
        const isMc = MCQ_TYPES.includes(aiType) || (Array.isArray(q.choices) && (q.choices as string[]).length >= 2);

        let choices: string[] | undefined;
        if (Array.isArray(q.choices)) {
          choices = (q.choices as string[]).map((c: string) => c.replace(/^[A-D][).]\s*/, ''));
          const substantive = choices.filter(c => c.trim().length > 2);
          if (substantive.length === 0) choices = undefined;
        }
        if (aiType === 'trueFalseNG' && (!choices || choices.length === 0)) {
          choices = ['True', 'False', 'Not Given'];
        }

        const tier = (q.tier as string) || (i < totalQ / 3 ? 'literal' : i < (totalQ * 2) / 3 ? 'inferential' : 'evaluative');

        // Use system-computed paragraphRef from Phase 1
        const paragraphRef = (q.paragraphRef as number) || undefined;
        const dseType = mapDseTypeToFrontend(aiType);

        return {
          index: (q.index as number) || i + 1,
          tier,
          paragraphRef: paragraphRef ? Math.min(paragraphRef, 7) : undefined,
          question,
          questionZh,
          type: isMcLikeDseType(dseType) ? 'mc' : 'short-answer',
          dseType,
          marks: (q.marks as number) || 1,
          wordLimit: (q.wordLimit as string) || undefined,
          acceptAlso: Array.isArray(q.acceptAlso) ? q.acceptAlso as string[] : [],
          paragraphCoverage: paragraphRef ? [paragraphRef] : [],
          wholeText: false,
          choices: isMcLikeDseType(dseType) && choices ? choices : undefined,
          answer: (q.answer as string) || '',
          explanationZh: (q.explanationZh as string) || undefined,
          explanationEn: (q.explanationEn as string) || undefined,
        };
      });
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
        const MCQ_TYPES = ['mcq', 'mcCloze', 'trueFalseNG', 'toneAttitude', 'authorIntention', 'negativeInference', 'vocabularyInContext', 'summaryCloze', 'sequencing', 'tableCompletion', 'matching'];
        const isMc = MCQ_TYPES.includes(aiType) || (Array.isArray(q.choices) && (q.choices as string[]).length >= 2);

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

        // Determine tier from question metadata or default based on position
        const tier = (q.tier as string) || (i < totalQ / 3 ? 'literal' : i < (totalQ * 2) / 3 ? 'inferential' : 'evaluative');

        // Use system-computed paragraphRef (set below via targetPhrase mapping)
        const paragraphRef = (q.paragraphRef as number) || undefined;
        const dseType2 = mapDseTypeToFrontend(aiType);

        return {
          index: (q.index as number) || i + 1,
          tier,
          paragraphRef: paragraphRef ? Math.min(paragraphRef, 7) : undefined,
          question,
          questionZh,
          type: isMcLikeDseType(dseType2) ? 'mc' : 'short-answer',
          dseType: dseType2,
          marks: (q.marks as number) || 1,
          wordLimit: (q.wordLimit as string) || undefined,
          acceptAlso: Array.isArray(q.acceptAlso) ? q.acceptAlso as string[] : [],
          paragraphCoverage: paragraphRef ? [paragraphRef] : [],
          wholeText: false,
          choices: isMcLikeDseType(dseType2) && choices ? choices : undefined,
          answer: (q.answer as string) || '',
          explanationZh: (q.explanationZh as string) || undefined,
          explanationEn: (q.explanationEn as string) || undefined,
        };
      });
    }
  }
  response._metadata = { generationTimeMs: elapsed, mode: 'legacy-single-passage' };

  return NextResponse.json(response);
}

// ============================================
// Helper: Generate targeted recommendations
// ============================================
function generateRecommendations(
  errorBreakdown: Record<string, number>,
  typeBreakdown: Record<string, { correct: number; total: number }>,
): string[] {
  const recommendations: string[] = [];

  // Error-type based recommendations
  if (errorBreakdown['reference_error']) {
    recommendations.push('🔍 代詞指涉題 (Reference) 較弱：建議練習「向前找1-2句的原則」，並將答案代入原句檢查。');
  }
  if (errorBreakdown['false_vs_ng_confusion']) {
    recommendations.push('⚠️ T/F/NG 混淆 False 與 Not Given：False = 文章明確反對；NG = 文章完全沒有提及。請複習此區別。');
  }
  if (errorBreakdown['inference_error']) {
    recommendations.push('🧠 推論題 (Inference) 需要加強：不要 over-infer，只推斷文中有 evidence 支持的內容。');
  }
  if (errorBreakdown['vocabulary_error']) {
    recommendations.push('📖 詞彙題 (Vocabulary) 需改善：使用 context clues（前後2句）推斷詞義，不要只看字典意思。');
  }
  if (errorBreakdown['word_limit_exceeded']) {
    recommendations.push('✂️ 注意字數限制：DSE 明確要求 "ONE word" 或 "no more than THREE words"，超出即失分。');
  }

  // Question-type based recommendations
  for (const [type, stats] of Object.entries(typeBreakdown)) {
    if (stats.total >= 2 && stats.correct / stats.total < 0.5) {
      const typeName = type.replace(/([A-Z])/g, ' $1').trim();
      recommendations.push(`📋 ${typeName} 題型正確率低於50%，建議針對此題型進行專項訓練。`);
    }
  }

  return recommendations;
}
