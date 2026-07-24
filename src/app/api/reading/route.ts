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
  ], { temperature: 0.45, maxTokens: 8192, jsonMode: true, timeoutMs: 45000 });

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
    count: Math.min(count, 10),
    difficultyLabel: { remedial: '補底', core: '核心', challenge: '挑戰' }[difficulty],
    gradeLevel,
    topic: topic || 'DSE-appropriate topic',
    partLabel: validatedPart,
    targetLevel,
  });

  const result = await callLLM([
    { role: 'system', content: prompt },
    { role: 'user', content: `Generate ${count} DSE Paper 1 Part ${validatedPart} reading questions (${difficulty} level, ${gradeLevel}) about "${topic || 'general interest'}". Include the reading passage. Return JSON.` },
  ], { temperature: 0.45, maxTokens: 4096, jsonMode: true, timeoutMs: 25000 });

  const parsed = JSON.parse(result);

  // Sprint 102: Route through legacy handler for full passage + question transformation
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

  // 1. Transform passage format + add paragraph breaks + fix line markers
  if (!response.passage && response.readingContent) {
    let content = response.readingContent as string;

    // Step A: Add paragraph breaks before [N] markers if not already present
    // Also handle [N] paragraph markers (AI uses both [N] and [line N])
    content = content.replace(/([^\n])\s*\[(\d+)\]/g, '$1\n\n[$2]');
    // Ensure first paragraph marker gets a break too
    content = content.replace(/^\s*\[(\d+)\]/, '[$1]');

    // Step A1: Ensure [N] paragraph markers have double newlines

    // Step A2: Capture AI's [line N] markers BEFORE stripping, so we can remap question references
    // Record each marker's line number and its word position in the text
    interface AiMarker { lineNum: number; wordPos: number }
    const aiMarkers: AiMarker[] = [];
    // Pre-scan: count words up to each [line N] marker in the content (before stripping)
    {
      const preContent = content.replace(/\s*\[line\s+\d+\]\s*/gi, ' '); // temp strip for word counting
      // Find marker positions in original content by scanning
      let scanIdx = 0;
      const markerRegex = /\[line\s+(\d+)\]/gi;
      let match: RegExpExecArray | null;
      // Count words up to each marker in the stripped version
      const strippedWords = preContent.split(/\s+/);
      // We estimate: each marker was at roughly (markerCharPos / totalChars) * totalWords position
      // More accurate: find word index in content before stripping
      let wordCount = 0;
      let i = 0;
      while (i < content.length) {
        // Check for [line N] marker at this position
        const slice = content.slice(i);
        const m = slice.match(/^\[line\s+(\d+)\]\s*/i);
        if (m) {
          aiMarkers.push({ lineNum: parseInt(m[1], 10), wordPos: wordCount });
          i += m[0].length;
          continue;
        }
        const ch = content[i];
        if (ch === ' ' || ch === '\n') {
          wordCount++;
        }
        i++;
      }
    }

    // Step B: Strip all AI-generated [line N] markers + convert [N] paragraph markers
    // Sprint 102: preserve paragraph breaks, convert [N] to \n\n
    content = content.replace(/\[line\s+\d+\]\s*/gi, '');
    // Convert standalone [N] paragraph markers to double newlines
    content = content.replace(/\s*\[(\d+)\]\s*/g, '\n\n');

    // Step C: Recalculate and insert accurate [line N] markers
    // DSE standard: ~10-12 words per line, markers every 5 lines (~50-60 words)
    // Bug fix (Sprint 102): Use paragraph-aware line counting for more accurate markers
    const WORDS_PER_LINE = 11;
    const MARKER_INTERVAL = 5; // every 5 lines

    // Split into paragraphs and count lines per paragraph
    const paragraphs = content.split(/\n\n+/);
    let result = '';
    let globalWordCount = 0;
    let globalLineCount = 0;

    // Sprint 102: Build lineMap — {line, startChar, endChar, text} for every line
    interface LineMapEntry { line: number; startChar: number; endChar: number; text: string }
    const lineMap: LineMapEntry[] = [];
    let currentLineStart = 0;
    let currentLineWords = 0;
    let currentLineText = '';
    let globalCharCount = 0;

    const flushLine = () => {
      if (currentLineText.trim()) {
        lineMap.push({
          line: lineMap.length + 1,
          startChar: currentLineStart,
          endChar: globalCharCount,
          text: currentLineText.trim(),
        });
      }
      currentLineStart = globalCharCount + 1;
      currentLineWords = 0;
      currentLineText = '';
    };

    for (let pi = 0; pi < paragraphs.length; pi++) {
      const para = paragraphs[pi];
      if (!para.trim()) { result += '\n\n'; continue; }
      const paraWords = para.split(/\s+/).filter(Boolean);
      const paraLines = Math.ceil(paraWords.length / WORDS_PER_LINE);

      // Sprint 102.5: Add paragraph number marker and rebuild paragraph word-by-word
      result += `[${pi + 1}] `;
      globalCharCount += String(pi + 1).length + 3;

      // Insert line markers at global word-count boundaries (paragraph-agnostic)
      const words = para.split(/(\s+)/); // split but keep whitespace
      let paraWordIdx = 0;
      for (const token of words) {
        result += token;
        globalCharCount += token.length;
        currentLineText += token;
        if (/^\s+$/.test(token)) {
          // Word boundary — count words in the preceding non-whitespace
          // We count when we see whitespace after a word
          continue; // whitespace tokens don't represent word count change here
        }
        // Non-whitespace token = a word
        if (token.trim()) {
          paraWordIdx++;
          globalWordCount++;
          currentLineWords++;
          if (currentLineWords >= WORDS_PER_LINE) {
            flushLine();
          }
          // Insert [line N] marker every MARKER_INTERVAL lines (based on global word count)
          if (globalWordCount > 0 && globalWordCount % (MARKER_INTERVAL * WORDS_PER_LINE) === 0) {
            const markerLine = Math.ceil(globalWordCount / WORDS_PER_LINE);
            result += ` [line ${markerLine}] `;
          }
        }
      }
      // Add paragraph separator
      if (pi < paragraphs.length - 1) {
        result += '\n\n';
        globalCharCount += 2;
        currentLineText += '\n\n';
      }
      // Flush last line of paragraph
      if (currentLineWords > 0) flushLine();
      globalLineCount += paraLines;
    }

    // Recalculate total words and rebuild newLineByWordPos for question remapping
    const totalWords = result.split(/\s+/).filter(w => !w.match(/^\[line\s+\d+\]$/i)).length;
    const totalLines = globalLineCount || Math.ceil(totalWords / WORDS_PER_LINE);
    const newLineByWordPos = new Map<number, number>();
    {
      let wc = 0;
      const resultChars = [...result];
      let i = 0;
      while (i < resultChars.length) {
        // Check for [line N] marker
        const slice = resultChars.slice(i).join('');
        const m = slice.match(/^\[line\s+(\d+)\]\s*/i);
        if (m) {
          newLineByWordPos.set(wc, parseInt(m[1], 10));
          i += m[0].length;
          continue;
        }
        const ch = resultChars[i];
        if (ch === ' ' || ch === '\n') wc++;
        i++;
      }
    }

    // Step D: Build old-line-number → new-line-number mapping for question remapping
    const oldToNewLine = new Map<number, number>();
    for (const aiMarker of aiMarkers) {
      const oldLine = aiMarker.lineNum;
      const oldWordPos = aiMarker.wordPos;
      // Find the closest new line marker to this word position
      let bestNewLine = oldLine; // default: keep same (fallback)
      let bestDist = Infinity;
      for (const [newWp, newLine] of newLineByWordPos) {
        const dist = Math.abs(newWp - oldWordPos);
        if (dist < bestDist) {
          bestDist = dist;
          bestNewLine = newLine;
        }
      }
      oldToNewLine.set(oldLine, bestNewLine);
    }

    // Helper: remap a line number reference with ±2 line tolerance
    const remapLine = (oldLine: number): number => {
      // Direct match first
      if (oldToNewLine.has(oldLine)) return oldToNewLine.get(oldLine)!;
      // ±2 tolerance: check neighboring lines
      for (const delta of [1, -1, 2, -2]) {
        const neighbor = oldLine + delta;
        if (oldToNewLine.has(neighbor)) return oldToNewLine.get(neighbor)!;
      }
      // Proportional fallback
      const maxOldLine = aiMarkers.length > 0
        ? Math.max(...aiMarkers.map(m => m.lineNum))
        : totalLines;
      const ratio = totalLines / Math.max(maxOldLine, 1);
      return Math.max(5, Math.round(oldLine * ratio / MARKER_INTERVAL) * MARKER_INTERVAL);
    };

    // Helper: remap (line X) or (lines X-Y) references in question text
    const remapQuestionTextLineRefs = (text: string): string => {
      return text.replace(/\(lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?\s*\)/gi, (full, line1: string, line2?: string) => {
        const new1 = remapLine(parseInt(line1, 10));
        if (line2) {
          const new2 = remapLine(parseInt(line2, 10));
          return `(lines ${new1}-${new2})`;
        }
        return `(line ${new1})`;
      });
    };

    response.passage = {
      title: topic ? `${topic.charAt(0).toUpperCase() + topic.slice(1)} Reading` : 'Reading Passage',
      content: result,
      wordCount: totalWords,
      source: parsed.source || undefined,
      lineNote: 'Line numbers are approximate (~11 words per line). Refer to paragraph numbers for precise location.',
      lineMap, // Sprint 102: {line, startChar, endChar, text} for every line
    };
    delete response.readingContent;

    // 2. Transform question format from v2 AI output to legacy frontend format
    if (Array.isArray(response.questions)) {
      response.questions = splitTFNGSubQuestions(response.questions as Array<Record<string, unknown>>);
      // Sprint 102: Trim to requested count after TFNG splitting
      if ((response.questions as Array<Record<string, unknown>>).length > totalQ) {
        response.questions = (response.questions as Array<Record<string, unknown>>).slice(0, totalQ);
      }
      response.questions = (response.questions as Array<Record<string, unknown>>).map((q: Record<string, unknown>, i: number) => {
        // Map questionText → question
        let rawQuestion = (q.questionText as string) || (q.question as string) || '';
        const questionZh = (q.questionTextZh as string) || (q.questionZh as string) || undefined;

        // Remap line number references in question text to match recalculated passage
        const question = remapQuestionTextLineRefs(rawQuestion);

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

        // Determine paragraph reference — remap using oldToNewLine if lineRef is present
        let paragraphRef = (q.paragraphRef as number) || 1;
        if (!q.paragraphRef && q.lineRef) {
          const oldLineRef = parseInt(String(q.lineRef).match(/\d+/)?.[0] || '1', 10);
          const newLine = remapLine(oldLineRef);
          // Estimate paragraph from new line number: each paragraph ~4-6 lines
          paragraphRef = Math.max(1, Math.ceil(newLine / 5));
        }

        return {
          index: (q.index as number) || i + 1,
          tier,
          paragraphRef: Math.min(paragraphRef, 7), // clamp to passage paragraphs
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

        // Determine paragraph reference
        const paragraphRef = (q.paragraphRef as number) || (q.lineRef ? parseInt(String(q.lineRef).match(/\d+/)?.[0] || '1', 10) : 1);

        return {
          index: (q.index as number) || i + 1,
          tier,
          paragraphRef: Math.min(paragraphRef, 7),
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
