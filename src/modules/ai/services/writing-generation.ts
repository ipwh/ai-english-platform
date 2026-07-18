// Sprint 5: Writing generation — extracted from ai-service.ts
import { callLLM } from './ai-service';
import { parseAIJSON } from './json-utils';
import { logger } from '@/shared/logger/logger';
import { isDSERAGEnabled, retrieveMarkingScheme, buildDSEContextPrompt, type DSESkill } from '@/modules/ai/services/rag-service';
import { validateDSEtopicMatch } from './dse-topics';
import { DSE_TEXT_TYPE_GUIDE, VOCAB_UPGRADES } from './dse-writing-data';
import { getWritingOutlineSystemPrompt, buildWritingOutlineUserPrompt } from '@/modules/ai/prompts';
import { getDSEEmpiricalTopics } from './dse-topics';
// 七、寫作題目生成（獨立於練習題目生成）
// ============================================

export interface GenerateWritingPromptInput {
  userId?: string;
  textType: string;
  gradeLevel: string;
  wordLimit: number;
  topicHint?: string;
  lang?: 'zh' | 'en';
  /** 學生弱項技能，用於針對性出題 */
  weakSkills?: string[];
}

export interface GenerateWritingOutlineInput {
  userId?: string;
  textType: string;
  gradeLevel: string;
  wordLimit: number;
  writingPrompt: string;
  topicHint?: string;
  lang?: 'zh' | 'en';
  /** 學生弱項技能 */
  weakSkills?: string[];
}

export interface GenerateWritingGuideInput {
  userId?: string;
  textType: string;
  gradeLevel: string;
  writingPrompt: string;
  studentDraft?: string; // 可選：學生當前草稿，提供針對性建議
  lang?: 'zh' | 'en';
}

export interface WritingGuide {
  /** 段落結構指南 */
  structureGuide: { paragraph: number; role: string; roleZh: string; tips: string; tipsZh: string }[];
  /** 實用句式 */
  usefulPhrases: { english: string; chinese: string; purpose: string }[];
  /** 常見錯誤提醒 */
  commonMistakes: { mistake: string; mistakeZh: string; correction: string; correctionZh: string }[];
  /** 詞彙升級建議 */
  vocabularyUpgrades: { basic: string; advanced: string; context: string }[];
}

/**
// (DSE_TEXT_TYPE_GUIDE / VOCAB_UPGRADES / CHINGLISH_FIXES extracted to src/lib/ai/dse-writing-data.ts)
/**
 * ✍️ 生成寫作題目 — 產出一個具體、符合 DSE 標準的作文題目
 * 整合 DSE 教學專家指引：包含情境、角色、任務、具體要求、字數
 */
export async function generateWritingPrompt(input: GenerateWritingPromptInput): Promise<string> {
  const _lang = input.lang || 'en';
  const guide = DSE_TEXT_TYPE_GUIDE[input.textType];

  const structureHint = guide
    ? `\nThis text type (${guide.name}) should include: ${guide.requiredElements.join(', ')}.\nRecommended structure: ${guide.structure.map(s => `${s.role} → ${s.keyContent}`).join(' | ')}`
    : '';

  const weakSkillHint = input.weakSkills?.length
    ? `\nThe student struggles with: ${input.weakSkills.join(', ')}. Design the prompt to specifically challenge and develop these weak areas.`
    : '';

  const systemPrompt = `You are an experienced HKDSE English Language Paper 2 examiner who has marked thousands of DSE scripts.

Create ONE complete, self-contained writing prompt that mirrors the style, complexity, and expectations of the REAL HKDSE English Paper 2 Part B.

The prompt MUST include ALL of these elements in order:
1. CONTEXT: A clear, realistic situation or background (1-2 sentences) that a Hong Kong secondary school student would relate to
2. ROLE: Who the writer is (e.g. "You are the chairperson of the Student Council", "You are the editor of your school magazine")
3. TASK: What to write, CLEARLY stating the required text type (e.g. "Write a letter to the editor...", "Write an article for your school magazine...")
4. REQUIREMENTS: 3 specific content points or guiding questions that the student MUST address. These should be concrete and checkable.
5. WORD LIMIT: "Write about ${input.wordLimit} words."

Text type: ${guide?.name || input.textType}${structureHint}
Grade: ${input.gradeLevel} (${input.gradeLevel === 'S1' || input.gradeLevel === 'S2' || input.gradeLevel === 'S3' ? 'junior secondary — school life, family, hobbies, personal experiences' : 'senior secondary — social issues, argumentative topics, DSE-level complexity'})

═══════════════════════════════════════
DSE EMPIRICAL TOPIC DATABASE — MANDATORY REFERENCE
═══════════════════════════════════════
⚠️ CRITICAL: Strictly base the topic on real DSE Paper 2 themes from 2012-2024 past papers.
Mimic actual DSE format: situation → role → task → specific requirements → word limit.
DO NOT invent topics not found in real DSE exams.

Real DSE Paper 2 reference topics (use one as inspiration):
${getDSEEmpiricalTopics('writing', undefined, 5).map(t => `  • ${t}`).join('\n')}
${input.topicHint ? `\nTopic area: ${input.topicHint}` : ''}
For ${input.gradeLevel}${input.gradeLevel === 'S1' || input.gradeLevel === 'S2' || input.gradeLevel === 'S3' ? ' (junior), prefer topics related to school life, family, hobbies, personal experiences — avoid complex social/abstract topics' : ' (senior), prefer social issues, argumentative topics, abstract concepts at DSE complexity level'}.${weakSkillHint}

DSE QUALITY STANDARDS:
- The prompt must be SPECIFIC and ACTIONABLE — not vague. Students should know exactly what to write.
- Include 3 checkable requirements (not just "express your views")
- The context must feel REAL and RELEVANT to HK students
- The task must match the text type's genre conventions (e.g., a speech needs audience awareness; a proposal needs measurable objectives)
- Use DSE-style phrasing: "Write a letter to...", "You are...", "In your [text type], you should..."

Example of a HIGH-QUALITY DSE prompt (from real DSE 2020):
"You are the chairperson of your school's Environmental Protection Club. Your school has recently conducted a waste audit and found that 40% of campus waste comes from single-use plastics. Write a proposal to the school principal outlining a plan to make the campus plastic-free by the end of the academic year. In your proposal, you should (1) describe at least three concrete measures, (2) explain the expected benefits for the school community, and (3) address one potential challenge and how to overcome it. Write about 400 words."

CRITICAL: Output ONLY the writing prompt. No headings, no labels, no "Here is a prompt:". Just the complete, ready-to-use prompt text.`.trim();

  const userPrompt = `Create a DSE-style writing prompt. Text type: ${guide?.name || input.textType}. Grade: ${input.gradeLevel}. Word limit: ${input.wordLimit} words.${input.topicHint ? ` Topic: ${input.topicHint}.` : ''}${input.weakSkills?.length ? ` Target weak skills: ${input.weakSkills.join(', ')}.` : ''}`;

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.8, maxTokens: 1024, timeoutMs: 25000, userId: input.userId }
  );

  const prompt = result.trim();

  // === DSE Topic Validation (post-generation) ===
  const topicCheck = validateDSEtopicMatch(prompt, 'writing');
  if (!topicCheck.matched) {
    logger.warn({ module: 'ai-service', score: topicCheck.score.toFixed(3), matched: topicCheck.matchedKeywords }, 'Writing prompt DSE topic match LOW — may not align with real DSE Paper 2 themes.');
  } else {
    logger.info({ module: 'ai-service', score: topicCheck.score.toFixed(3), matched: topicCheck.matchedKeywords.slice(0, 5) }, 'Writing prompt DSE validation passed');
  }

  return prompt;
}

/**
 * 生成寫作大綱 — 產出中英對照、結構化的段落式大綱
 * 每個段落有獨特的具體內容，不是題目的重述
 */
export async function generateWritingOutline(input: GenerateWritingOutlineInput): Promise<string> {
  const _lang = input.lang || 'en';
  const guide = DSE_TEXT_TYPE_GUIDE[input.textType];

  // 提取文體特定的結構指引
  const structureGuide = guide
    ? guide.structure.map(s => `- Paragraph ${s.paragraph}: ${s.role} (${s.roleZh}) — ${s.keyContent}`).join('\n')
    : '';

  const commonErrors = guide
    ? guide.commonErrors.map(e => `- ❌ ${e.error} (${e.errorZh}) → ✅ ${e.fix}`).join('\n')
    : '';

  const weakSkillHint = input.weakSkills?.length
    ? `\nStudent weaknesses: ${input.weakSkills.join(', ')}. Emphasize these areas in the outline.`
    : '';

  const systemPrompt = getWritingOutlineSystemPrompt({
    gradeLevel: input.gradeLevel,
    textType: input.textType,
    guideName: guide?.name || input.textType,
    wordLimit: input.wordLimit,
    writingPrompt: input.writingPrompt,
    topicHint: input.topicHint,
    structureGuide,
    commonErrors,
    weakSkillHint,
  });

  const userPrompt = buildWritingOutlineUserPrompt({
    guideName: guide?.name || input.textType,
    textType: input.textType,
    gradeLevel: input.gradeLevel,
    wordLimit: input.wordLimit,
    writingPrompt: input.writingPrompt,
  });

  const result = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.7, maxTokens: 4096, timeoutMs: 25000, userId: input.userId }
  );

  return result.trim();
}

// ============================================
// 七點五、寫作即時輔助 — 結構指南 + 實用句式 + 常見錯誤
// ============================================

/**
 * ✍️ generateWritingGuide
 * 為學生提供即時寫作輔助：段落結構指南、實用句式、常見錯誤提醒、詞彙升級建議
 * 可基於學生當前草稿提供針對性建議
 */
export function generateWritingGuide(input: GenerateWritingGuideInput): WritingGuide {
  const guide = DSE_TEXT_TYPE_GUIDE[input.textType];

  // === 1. 段落結構指南 ===
  const structureGuide: WritingGuide['structureGuide'] = guide
    ? guide.structure.map(s => ({
        paragraph: s.paragraph,
        role: s.role,
        roleZh: s.roleZh,
        tips: s.keyContent,
        tipsZh: s.keyContent, // keyContent 已混合中英
      }))
    : [
        { paragraph: 1, role: 'Introduction', roleZh: '引言', tips: 'Hook + Background + Thesis/Context', tipsZh: '開首語 + 背景 + 論點/情境' },
        { paragraph: 2, role: 'Body Paragraph 1', roleZh: '主體段落一', tips: 'Topic sentence + Example + Explanation', tipsZh: '主題句 + 例子 + 解釋' },
        { paragraph: 3, role: 'Body Paragraph 2', roleZh: '主體段落二', tips: 'Topic sentence + Example + Explanation', tipsZh: '主題句 + 例子 + 解釋' },
        { paragraph: 4, role: 'Conclusion', roleZh: '結論', tips: 'Summary + Final thought + Call to action', tipsZh: '總結 + 最終觀點 + 行動呼籲' },
      ];

  // === 2. 實用句式 ===
  const usefulPhrases: WritingGuide['usefulPhrases'] = guide
    ? [
        ...guide.usefulOpeners.map(o => ({ english: o, chinese: '開首句式', purpose: 'opening' })),
        ...guide.usefulClosers.map(c => ({ english: c, chinese: '結尾句式', purpose: 'closing' })),
      ]
    : [
        { english: 'In recent years, [topic] has become a subject of considerable debate.', chinese: '近年來，[主題] 已成為廣受討論的議題。', purpose: 'opening' },
        { english: 'It is widely believed that... However, I would argue that...', chinese: '普遍認為...但我想指出...', purpose: 'opening' },
        { english: 'In conclusion, it is clear that...', chinese: '總括而言，顯然...', purpose: 'closing' },
      ];

  // === 3. 常見錯誤提醒 ===
  const commonMistakes: WritingGuide['commonMistakes'] = guide
    ? guide.commonErrors.map(e => ({
        mistake: e.error,
        mistakeZh: e.errorZh,
        correction: e.fix,
        correctionZh: e.fix,
      }))
    : [
        { mistake: 'Off-topic or not addressing all parts of the prompt', mistakeZh: '離題或未回應所有題目要求', correction: 'Circle keywords in the prompt and check off each one as you write.', correctionZh: '圈出題目關鍵詞，每寫一段就檢查是否有回應。' },
        { mistake: 'No specific examples to support arguments', mistakeZh: '缺乏具體例子支持論點', correction: 'For each argument, add at least one concrete example (data, news, personal experience).', correctionZh: '每個論點至少配一個具體例子（數據、新聞、個人經歷）。' },
        { mistake: 'Repetitive vocabulary and simple sentences only', mistakeZh: '詞彙重複、句式單調', correction: 'Use the vocabulary upgrade suggestions below. Vary sentence starters (adverbs, participle phrases, subordinate clauses).', correctionZh: '參考下方詞彙升級建議。變換句子開頭方式（副詞、分詞片語、從屬子句）。' },
      ];

  // === 4. 詞彙升級建議 ===
  const vocabularyUpgrades: WritingGuide['vocabularyUpgrades'] = VOCAB_UPGRADES.slice(0, 10);

  return {
    structureGuide,
    usefulPhrases,
    commonMistakes,
    vocabularyUpgrades,
  };
}

/**
 * ✍️ generateAdaptiveWritingGuide
 * AI 驅動的自適應寫作輔助：根據學生當前草稿提供個人化指引
 * 與 generateWritingGuide（靜態查表）互補
 */
export async function generateAdaptiveWritingGuide(
  input: GenerateWritingGuideInput
): Promise<{
  personalizedTips: string[];
  structureIssues: string[];
  suggestedNextParagraph: string;
  missingElements: string[];
}> {
  if (!input.studentDraft || input.studentDraft.trim().length < 20) {
    return {
      personalizedTips: ['開始寫作後，AI 會根據你的草稿提供個人化建議。'],
      structureIssues: [],
      suggestedNextParagraph: '先寫出你的 Introduction（Hook + Background + Thesis），然後回來查看 AI 建議。',
      missingElements: [],
    };
  }

  const guide = DSE_TEXT_TYPE_GUIDE[input.textType];
  const draftSnippet = input.studentDraft.slice(0, 2000);

  const systemPrompt = `你是一位香港 DSE English Paper 2 寫作導師，正在幫助學生即時改善他們的作文。
請根據學生的當前草稿提供簡潔、具體、可執行的建議。

文體類型：${guide?.name || input.textType}
年級：${input.gradeLevel}
${guide ? `必備元素：${guide.requiredElements.join(', ')}` : ''}

回覆純 JSON（以 { 開頭 } 結尾）：
{
  "personalizedTips": ["具體建議1", "具體建議2", "具體建議3"],
  "structureIssues": ["結構問題1", "結構問題2"],
  "suggestedNextParagraph": "建議下一段寫什麼（繁體中文，30-50字）",
  "missingElements": ["缺少的元素1", "缺少的元素2"]
}

所有中文使用繁體中文。`;

  const userPrompt = `寫作任務：${input.writingPrompt}\n\n學生當前草稿：\n"""\n${draftSnippet}\n"""\n\n請提供個人化寫作建議。`;

  try {
    const result = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.4, maxTokens: 1024, jsonMode: true, timeoutMs: 15000, userId: input.userId }
    );

    return parseAIJSON<{
      personalizedTips: string[];
      structureIssues: string[];
      suggestedNextParagraph: string;
      missingElements: string[];
    }>(result);
  } catch {
    // Fallback: return generic guidance
    return {
      personalizedTips: ['繼續寫作，完成後可以使用 AI 批改獲得詳細分析。'],
      structureIssues: [],
      suggestedNextParagraph: '繼續發展你的下一個論點，記得使用 PEEL 結構。',
      missingElements: [],
    };
  }
}

// ============================================
