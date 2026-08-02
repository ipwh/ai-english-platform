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
} from '@/modules/ai/prompts/reading/types';
import { DSE_PART_QUESTION_MIX } from '@/modules/ai/prompts/reading/dse-question-templates';
import { B1_B2_LEVEL_CAPS, HKEAA_TO_PLATFORM_DIFFICULTY } from '@/modules/ai/prompts/reading/dse-level-descriptors';
import { DSE_TEXT_TYPES, DSE_PUBLICATION_SOURCES } from '@/modules/ai/prompts/reading/text-types';

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
      default:
        // Backward compat: single passage generation
        return handleLegacyGeneration(body);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    logger.error({ module: 'reading-api', error: msg }, 'Reading API error');
    return NextResponse.json({ error: msg }, { status: 500 });
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
  ], { temperature: 0.45, maxTokens: 8192, jsonMode: true, timeoutMs: 30000 });

  const paper = JSON.parse(result) as DSEreadingPaper;

  // Post-generation quality validation
  const warnings: string[] = [];
  for (const passage of paper.passages) {
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

  const elapsed = Date.now() - startTime;
  logger.info({ module: 'reading-api', part: validatedPart, level: resolvedLevel, passages: paper.passages.length, questions: allQuestions.length, elapsed, warnings: warnings.length }, 'Full paper generated');

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
    count: Math.min(count, 7),
    difficultyLabel: { remedial: '補底', core: '核心', challenge: '挑戰' }[difficulty],
    gradeLevel,
    topic: topic || 'DSE-appropriate topic',
    partLabel: validatedPart,
    targetLevel,
  });

  const result = await callLLM([
    { role: 'system', content: prompt },
    { role: 'user', content: `Generate ${count} DSE Paper 1 Part ${validatedPart} reading questions (${difficulty} level, ${gradeLevel}) about "${topic || 'general interest'}". The reading passage MUST be 500-800 words. Return JSON.` },
  ], { temperature: 0.45, maxTokens: 6144, jsonMode: true, timeoutMs: 30000 });

  const parsed = JSON.parse(result);

  // Validate minimum passage length
  const passageText = parsed.readingContent as string || '';
  const wordCount = passageText.split(/\s+/).filter(Boolean).length;
  if (wordCount < 200) {
    throw new Error(`Generated passage too short: ${wordCount} words (minimum 500 required). Please retry.`);
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
  } = body as {
    questions: DSEreadingQuestion[];
    studentAnswers: Record<number, string>;
  };

  if (!questions || !studentAnswers) {
    return NextResponse.json({ error: 'questions and studentAnswers are required' }, { status: 400 });
  }

  // Sprint 102.5: AI-powered semantic evaluation for subjective questions
  // Objective types (MCQ, TFNG) use fast exact matching
  const OBJECTIVE_TYPES = new Set(['mcq', 'mcCloze', 'trueFalseNG', 'matching', 'sequencing', 'tableCompletion', 'summaryCloze']);

  const analyses: AnswerAnalysis[] = await Promise.all(questions.map(async q => {
    // Try multiple index formats (TFNG split uses float indices like 2.0, 2.1)
    let studentAnswer = (studentAnswers[q.index] || '').trim();
    if (!studentAnswer) studentAnswer = ((studentAnswers as Record<string, string>)[String(q.index)] || '').trim();
    if (!studentAnswer) studentAnswer = (studentAnswers[Math.floor(q.index)] || '').trim();

    // Normalize TFNG answers: "T"/"F"/"NG" → "True"/"False"/"Not Given"
    if (q.type === 'trueFalseNG') {
      studentAnswer = studentAnswer === 'T' ? 'True' : studentAnswer === 'F' ? 'False' : studentAnswer === 'NG' ? 'Not Given' : studentAnswer;
    }

    let result: AIEvaluationResult;
    if (OBJECTIVE_TYPES.has(q.type)) {
      // Simple exact/semantic matching for objective questions — no AI needed
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
      // Subjective types: use AI semantic evaluation
      result = await evaluateWithAI(studentAnswer, q.answer, q.questionText || '', q.marks);
    }

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
    count: Math.min(count, 7),
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
    count: Math.min(count, 7),
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
    count: Math.min(count, 7),
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

  const systemPrompt = buildReadingSectionPrompt();

  // Sprint 102: Skip AI if pre-parsed result provided (from exercise handler)
  const parsed: Record<string, unknown> = preParsed || JSON.parse(
    await callLLM([
      { role: 'system', content: systemPrompt + dseContextBlock },
      { role: 'user', content: `Generate a DSE ${level} reading comprehension passage about "${topic || 'general interest'}" with ${totalQ} progressive questions using authentic DSE question wording. Passage must be 500-800 words.` },
    ], { temperature: 0.45, maxTokens: 4096, jsonMode: true, timeoutMs: 25000 })
  );

  // Attach readability if passage content exists
  if (parsed.readingContent || (parsed.passage as Record<string, unknown>)?.content) {
    const content = (parsed.readingContent || (parsed.passage as Record<string, unknown>)?.content) as string;
    const metrics = estimateReadability(content);
    const readabilityLevel = mapReadabilityToHKEAALevel(metrics);
    const hkCheck = checkHKLocalContent(content);
    parsed._readability = { ...metrics, estimatedHKEAALevel: readabilityLevel };
    parsed._hkLocal = hkCheck;
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

        // Priority 1: targetPhrase mapping (trust real text search over AI hallucination)
        let targetPhrase = (q.targetPhrase as string)?.trim();
        if (!targetPhrase) {
          const quotedMatch = questionText.match(/['\u2018\u2019\u201C\u201D"]([^'\u2018\u2019\u201C\u201D"]{3,60})['\u2018\u2019\u201C\u201D"]/);
          if (quotedMatch) targetPhrase = quotedMatch[1];
        }
        if (targetPhrase) {
          for (const para of layout.paragraphs) {
            const paraText = para.lines.map(l => l.text).join(' ');
            if (paraText.includes(targetPhrase)) {
              q._computedParagraph = para.paragraphNumber;
              for (const line of para.lines) {
                if (line.text.includes(targetPhrase)) {
                  q._computedLine = String(line.line);
                  break;
                }
              }
              break;
            }
          }
        }

        // Fallback: extract paragraph number from question text (AI's intent)
        if (!q._computedParagraph) {
          const paraMatch = questionText.match(/paragraph\s+(\d+)/i);
          if (paraMatch) q._computedParagraph = parseInt(paraMatch[1], 10);
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
        if (computedPara) {
          q.paragraphRef = computedPara;
          question = question.replace(
            /(According to|With reference to)\s+paragraph\s+\d+/gi,
            `$1 paragraph ${computedPara}`,
          );
        }

        // Inject system-computed line number (now available from Phase 1)
        const computedLine = q._computedLine as string | undefined;
        const targetPhrase = (q.targetPhrase as string)?.trim();
        if (computedLine && targetPhrase) {
          const escaped = targetPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const lineRefRe = new RegExp(`('${escaped}'|"${escaped}")\\s*`, 'gi');
          question = question.replace(lineRefRe, `$&(line ${computedLine}) `);
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
        let paragraphRef = (q.paragraphRef as number) || undefined;

        return {
          index: (q.index as number) || i + 1,
          tier,
          paragraphRef: paragraphRef ? Math.min(paragraphRef, 7) : undefined,
          question,
          questionZh,
          type: isMc ? 'mc' : 'short-answer',
          choices: isMc && choices ? choices : undefined,
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

        return {
          index: (q.index as number) || i + 1,
          tier,
          paragraphRef: paragraphRef ? Math.min(paragraphRef, 7) : undefined,
          question,
          questionZh,
          type: isMc ? 'mc' : 'short-answer',
          choices: isMc && choices ? choices : undefined,
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
