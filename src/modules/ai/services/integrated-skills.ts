// Sprint 5: Integrated Skills — extracted from ai-service.ts
import { callLLM } from './ai-service';
import { parseAIJSON } from './json-utils';
import { logger } from '@/shared/logger/logger';
import { isDSERAGEnabled, retrieveMarkingScheme, buildDSEContextPrompt, type DSESkill } from '@/modules/ai/services/rag-service';
import { buildIntegratedSkillsGenPrompt, buildIntegratedSkillsAnalysisPrompt } from '@/modules/ai/prompts';
import { INTEGRATED_SKILLS_DIFF_MAP, INTEGRATED_SKILLS_TASK_TYPE_MAP } from './integrated-skills-config';
import { getDSEEmpiricalTopics } from './dse-topics';
import { normalizeListeningContent } from './listening-normalizer';
import { sanitizeForAI } from './sanitizer';
// 七點六、Integrated Skills — DSE Paper 3 Part B 綜合能力訓練
// ============================================

export interface GenerateIntegratedSkillsInput {
  userId?: string;
  gradeLevel: string;
  difficulty: 'remedial' | 'core' | 'challenge';
  taskType: 'summary' | 'email-reply' | 'short-article' | 'report' | 'speech' | 'proposal' | 'notice' | 'press-release' | 'letter-to-editor';
  topicHint?: string;
}

/** Data File 中的一個來源文件 */
export interface DataFileSource {
  type: 'email' | 'memo' | 'report-excerpt' | 'webpage' | 'statistics' | 'notice';
  title: string;
  content: string;
  relevantFor: number[];
  sourceDate?: string;
}

export interface IntegratedSkillsTask {
  /** 聽力材料（對話/獨白格式，供 TTS 播放） */
  listeningContent: string;
  /** 聽力主題簡介（中文） */
  listeningTopicZh: string;
  /** Data File 資料來源（模擬真實 Paper 3 資料夾） */
  dataFile?: { sources: DataFileSource[] };
  /** Note-taking 指引（告訴學生要留意什麼） */
  noteTakingGuide: { question: string; hint: string }[];
  /** 寫作任務說明（DSE 風格） */
  writingTask: string;
  /** 寫作任務類型 */
  taskType: string;
  /** 建議字數 */
  wordLimit: number;
  /** 預期內容要點（供批改時參考） */
  expectedContentPoints: string[];
  /** 聽力原文參考答案（供批改比對） */
  listeningAnswers: { question: string; answer: string }[];
}

export interface AnalyzeIntegratedSkillsInput {
  userId?: string;
  /** 原始聽力材料 */
  listeningContent: string;
  /** Data File 來源（若有） */
  dataFileSources?: DataFileSource[];
  /** Note-taking 指引 */
  noteTakingGuide: { question: string; hint: string }[];
  /** 預期內容要點 */
  expectedContentPoints: string[];
  /** 寫作任務 */
  writingTask: string;
  /** 任務類型 */
  taskType: string;
  /** 學生 note-taking 內容 */
  studentNotes: string;
  /** 學生完成的寫作 */
  studentWriting: string;
  /** 學生年級 */
  gradeLevel?: string;
}

export interface IntegratedSkillsAnalysis {
  /** 總分 0-100（weighted: listening×0.40 + language×0.35 + organization×0.25） */
  overallScore: number;
  /** Listening 提取準確度 0-100 */
  listeningAccuracy: number;
  /** 語言準確度 0-100 */
  languageAccuracy: number;
  /** 組織清晰度 0-100 */
  organizationClarity: number;
  /** 內容完整度 0-100 */
  contentCompleteness: number;
  /** 已提取的要點 */
  capturedPoints: string[];
  /** 遺漏的要點 */
  missedPoints: string[];
  /** 抄襲檢測警告 */
  overCopyWarnings: { original: string; studentText?: string; suggestion: string; sourceType?: string }[];
  /** 中式英文警告 */
  chinglishWarnings?: { original: string; suggestion: string; explanation: string }[];
  /** 文法錯誤 */
  grammarErrors: { original: string; correction: string; explanation: string }[];
  /** 詞彙升級建議 */
  vocabularySuggestions: { original: string; suggestion: string; reason: string }[];
  /** Data Manipulation 反饋 */
  dataManipulationFeedback?: string;
  /** 結構評語（繁體中文） */
  structureFeedback: string;
  /** Note-taking 品質評語 */
  noteTakingFeedback?: string;
  /** 總評（繁體中文） */
  generalComment: string;
  /** 改進建議（繁體中文） */
  improvementTips: string[];
  /** 對應 HKDSE Level */
  estimatedLevel: string;
  /** 評分明細 */
  scoringBreakdown?: { listeningWeighted: string; languageWeighted: string; organizationWeighted: string; formula: string };
}

/**
 * 🎧✍️ 生成 Integrated Skills 任務
 * 先提供聆聽材料 → Note-taking 指引 → 寫作任務
 * 模擬 DSE Paper 3 Part B 的真實考試流程
 */
export async function generateIntegratedSkills(
  input: GenerateIntegratedSkillsInput
): Promise<IntegratedSkillsTask> {
  const diff = INTEGRATED_SKILLS_DIFF_MAP[input.difficulty];
  const taskInfo = INTEGRATED_SKILLS_TASK_TYPE_MAP[input.taskType];
  const dseTopics = getDSEEmpiricalTopics('listening', undefined, 6).map(t => `  • ${t}`).join('\n');

  const systemPrompt = buildIntegratedSkillsGenPrompt({
    gradeLevel: input.gradeLevel,
    difficulty: input.difficulty,
    taskType: input.taskType,
    topicHint: input.topicHint,
    dseTopics,
    diffLines: diff.lines,
    diffTraps: diff.traps,
    diffWordLimit: diff.wordLimit,
    diffLabel: diff.label,
    taskInfoName: taskInfo.name,
    taskInfoNameZh: taskInfo.nameZh,
    taskInfoFormatHint: taskInfo.formatHint,
    diffDataFilePages: diff.dataFilePages,
    diffSpeakerCount: diff.speakerCount,
    taskRequiredElements: taskInfo.requiredElements,
  });

  const userPrompt = `生成一個 DSE Paper 3 Part B Integrated Skills 練習：
- 任務類型：${taskInfo.name} (${taskInfo.nameZh})
- 年級：${input.gradeLevel}
- 難度：${input.difficulty}
- 字數要求：約 ${diff.wordLimit} words${input.topicHint ? `\n- 主題：${input.topicHint}` : ''}
- Data File 頁數：${diff.dataFilePages}`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.6, maxTokens: 4096, jsonMode: true, timeoutMs: 30000, userId: input.userId }
  );

  const task = parseAIJSON<IntegratedSkillsTask>(result);

  // 驗證必要欄位
  if (!task.listeningContent || !task.writingTask) {
    throw new Error('AI 生成的 Integrated Skills 任務不完整');
  }

  return {
    listeningContent: normalizeListeningContent(task.listeningContent),
    listeningTopicZh: task.listeningTopicZh || 'Integrated Skills 聆聽任務',
    dataFile: task.dataFile,
    noteTakingGuide: task.noteTakingGuide || [],
    writingTask: task.writingTask,
    taskType: input.taskType,
    wordLimit: diff.wordLimit,
    expectedContentPoints: task.expectedContentPoints || [],
    listeningAnswers: task.listeningAnswers || [],
  };
}

/**
 * 🎧✍️ 批改 Integrated Skills 答案
 * 同時評估 Listening 提取準確度 + Writing 品質
 */
export async function analyzeIntegratedSkills(
  input: AnalyzeIntegratedSkillsInput
): Promise<IntegratedSkillsAnalysis> {
  const sanitizedWriting = sanitizeForAI(input.studentWriting);

  // ============================================
  // DSE RAG：檢索 Paper 3 Listening & Integrated Skills Marking Scheme
  // ============================================
  let paper3MSContext = '';
  try {
    if (isDSERAGEnabled()) {
      const msChunks = await retrieveMarkingScheme('Listening', 3);
      paper3MSContext = buildDSEContextPrompt(
        [],
        msChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'analyze_integrated'
      );
      if (paper3MSContext) {
        logger.info({ module: 'dse-rag', msChunks: msChunks.length }, 'analyzeIntegratedSkills: Retrieved Listening MS chunks');
      }
    }
  } catch (err) {
    logger.warn({ module: 'dse-rag', error: err instanceof Error ? err.message : String(err) }, 'analyzeIntegratedSkills MS retrieval failed, fallback');
    paper3MSContext = '';
  }

  const systemPrompt = buildIntegratedSkillsAnalysisPrompt(paper3MSContext);

  const expectedPointsText = input.expectedContentPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');

  // Build Data File context for analysis
  let dataFileContext = '';
  if (input.dataFileSources && input.dataFileSources.length > 0) {
    dataFileContext = '\n【Data File 資料】\n' + input.dataFileSources.map((s, i) =>
      `[來源 ${i + 1}] ${s.type}: ${s.title}\n${s.content.slice(0, 500)}`
    ).join('\n\n');
  }

  const userPrompt = `【聆聽材料】
${input.listeningContent.slice(0, 3000)}
${dataFileContext}
【Note-taking 指引】
${input.noteTakingGuide.map(g => `- ${g.question} (提示: ${g.hint})`).join('\n')}

【預期內容要點】
${expectedPointsText}

【寫作任務】
${input.writingTask}

【學生 Note-taking】
${input.studentNotes || '(未填寫)'}

【學生寫作】
"""
${sanitizedWriting}
"""

請批改此 Integrated Skills 答案。`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.3, maxTokens: 4096, jsonMode: true, timeoutMs: 30000, userId: input.userId }
  );

  const analysis = parseAIJSON<IntegratedSkillsAnalysis>(result);

  if (!analysis.overallScore && analysis.overallScore !== 0) {
    throw new Error('AI Integrated Skills 分析不完整');
  }

  return analysis;
}

// ============================================
// 八、輔助函數
// ============================================

/** 檢查 DeepSeek API 是否已設定 */