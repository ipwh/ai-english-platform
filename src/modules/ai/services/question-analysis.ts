// ============================================
// Sprint 47: 審題訓練模組 — DSE Paper 2 十大錯誤之首
// 自動分析題目關鍵詞、隱藏要求、審題清單
// ============================================

import { DSE_TEXT_TYPE_GUIDE } from './dse-writing-data';

// ============================================
// 指令動詞知識庫
// ============================================

interface InstructionVerb {
  verb: string;
  meaningZh: string;
  whatToDo: string;
  whatToDoZh: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
}

const INSTRUCTION_VERBS: InstructionVerb[] = [
  { verb: 'write', meaningZh: '撰寫', whatToDo: 'Produce a complete piece of writing in the specified text type', whatToDoZh: '以指定文體撰寫完整文章', difficulty: 'basic' },
  { verb: 'explain', meaningZh: '解釋', whatToDo: 'Give reasons WHY something happens. Provide causes, effects, and elaboration.', whatToDoZh: '解釋原因，提供因果關係和詳細闡述', difficulty: 'basic' },
  { verb: 'describe', meaningZh: '描述', whatToDo: 'Paint a picture with words. Include sensory details (sight, sound, feeling). Use "Show, Don\'t Tell".', whatToDoZh: '用文字描繪畫面，包含感官細節（視覺、聽覺、感受），用「Show, Don\'t Tell」技巧', difficulty: 'basic' },
  { verb: 'discuss', meaningZh: '討論', whatToDo: 'Present BOTH sides of an issue. Include advantages AND disadvantages. Give your own view at the end.', whatToDoZh: '呈現議題的兩面觀點，包括利弊分析，最後給出個人看法', difficulty: 'intermediate' },
  { verb: 'express your opinion/views', meaningZh: '表達意見', whatToDo: 'State your position clearly. Support with reasons and examples. You may acknowledge the other side but focus on YOUR view.', whatToDoZh: '清晰表明立場，以理由和例子支持，可以簡略提及反方觀點但聚焦己方', difficulty: 'intermediate' },
  { verb: 'share your experience(s)', meaningZh: '分享經歷', whatToDo: 'Use first-person narrative. Describe a specific event/memory. Include your feelings and what you learned.', whatToDoZh: '以第一人稱敘述，描述具體事件/回憶，包含感受和學到的體會', difficulty: 'basic' },
  { verb: 'elaborate on', meaningZh: '闡述', whatToDo: 'Go deeper. Provide detailed explanation, examples, and implications. More than just "describe".', whatToDoZh: '深入闡述，提供詳細解釋、例子和延伸含義，比 describe 更深入', difficulty: 'advanced' },
  { verb: 'outline', meaningZh: '概述', whatToDo: 'Give the main points briefly. Do NOT go into deep detail. Use clear, concise language.', whatToDoZh: '簡要列出主要觀點，不要深入細節，使用清晰簡潔的語言', difficulty: 'basic' },
  { verb: 'provide suggestions', meaningZh: '提供建議', whatToDo: 'Give CONCRETE, actionable recommendations. Each suggestion should be specific and practical.', whatToDoZh: '提供具體可行的建議，每項建議都應具體且實用', difficulty: 'intermediate' },
  { verb: 'compare', meaningZh: '比較', whatToDo: 'Show similarities AND differences. Use comparison language: "similarly", "in contrast", "whereas".', whatToDoZh: '展示相同點和不同點，使用比較語言', difficulty: 'intermediate' },
  { verb: 'argue', meaningZh: '論證', whatToDo: 'Take a clear stance. Provide strong evidence. Include counter-argument and rebuttal.', whatToDoZh: '採取清晰立場，提供有力證據，包含反方論點和駁論', difficulty: 'advanced' },
  { verb: 'justify', meaningZh: '證明合理', whatToDo: 'Give reasons that prove your position is correct. Each reason needs evidence.', whatToDoZh: '提供證明立場正確的理由，每個理由都需要證據', difficulty: 'advanced' },
  { verb: 'propose', meaningZh: '提議', whatToDo: 'Present a plan or solution. Include details: what, how, when, who, resources needed.', whatToDoZh: '提出計劃或解決方案，包含細節：什麼、如何、何時、誰、所需資源', difficulty: 'advanced' },
  { verb: 'create', meaningZh: '創作', whatToDo: 'Produce original content. For leaflets: use headings, bullet points. For stories: include plot and characters.', whatToDoZh: '創作原創內容。宣傳單張用標題和要點；故事包含情節和角色', difficulty: 'intermediate' },
];

// ============================================
// 審題分析結果類型
// ============================================

export interface QuestionAnalysis {
  keywords: {
    instructionVerbs: Array<{ word: string; meaningZh: string; whatToDo: string; whatToDoZh: string }>;
    textType: { type: string; typeZh: string; formatRequirements: string[] };
    context: { role: string; roleZh: string; scenario: string; scenarioZh: string };
    audience: { who: string; whoZh: string; toneRequired: string };
    contentRequirements: string[];
  };
  hiddenRequirements: {
    appropriateTone: string;
    suggestedTense: string;
    suggestedPerson: string;
    specialNotes: string[];
  };
  checklist: string[];
  commonPitfalls: Array<{ pitfall: string; pitfallZh: string; howToAvoid: string }>;
  offTopicIndicators: string[];
}

// ============================================
// 主分析函數
// ============================================

/**
 * 分析一條 DSE 寫作題目，提取關鍵詞、隱藏要求、審題清單
 */
export function analyzeDSEQuestion(
  questionText: string,
  textType?: string
): QuestionAnalysis {
  const lower = questionText.toLowerCase();

  // 1. 提取指令動詞
  const instructionVerbs = INSTRUCTION_VERBS.filter(iv =>
    new RegExp(`\\b${iv.verb}\\b`, 'i').test(questionText)
  );

  // 2. 識別文體
  const detectedTextType = detectTextType(questionText, textType);

  // 3. 識別情境（角色）
  const context = detectContext(questionText);

  // 4. 識別受眾
  const audience = detectAudience(questionText);

  // 5. 提取內容要求
  const contentRequirements = detectContentRequirements(questionText);

  // 6. 分析隱藏要求
  const hidden = analyzeHiddenRequirements(questionText, detectedTextType, audience.toneRequired);

  // 7. 生成審題清單
  const checklist = generateChecklist(questionText, detectedTextType, instructionVerbs, contentRequirements);

  // 8. 識別常見陷阱
  const pitfalls = identifyPitfalls(questionText, detectedTextType);

  // 9. 離題指標
  const offTopicIndicators = generateOffTopicIndicators(questionText, detectedTextType);

  return {
    keywords: {
      instructionVerbs: instructionVerbs.map(iv => ({
        word: iv.verb,
        meaningZh: iv.meaningZh,
        whatToDo: iv.whatToDo,
        whatToDoZh: iv.whatToDoZh,
      })),
      textType: detectedTextType,
      context,
      audience,
      contentRequirements,
    },
    hiddenRequirements: hidden,
    checklist,
    commonPitfalls: pitfalls,
    offTopicIndicators,
  };
}

// ============================================
// 輔助函數
// ============================================

function detectTextType(questionText: string, providedType?: string): { type: string; typeZh: string; formatRequirements: string[] } {
  const lower = questionText.toLowerCase();

  // If text type is explicitly provided, use its guide
  if (providedType && DSE_TEXT_TYPE_GUIDE[providedType]) {
    const guide = DSE_TEXT_TYPE_GUIDE[providedType];
    return {
      type: guide.name,
      typeZh: guide.nameZh,
      formatRequirements: guide.requiredElements,
    };
  }

  // Auto-detect from question text
  const textTypePatterns: Array<{ pattern: RegExp; type: string; typeZh: string }> = [
    { pattern: /letter\s+to\s+the\s+editor/i, type: 'Letter to the Editor', typeZh: '致編輯的信' },
    { pattern: /(formal\s+)?letter|email\s+to\s+(the\s+)?(manager|principal|editor|director)/i, type: 'Formal Letter', typeZh: '正式書信' },
    { pattern: /informal\s+letter|letter\s+to\s+(a\s+)?friend|letter\s+of\s+advice/i, type: 'Informal Letter', typeZh: '非正式書信' },
    { pattern: /article\s+for\s+(a\s+)?(school|travel|local)\s+(magazine|newspaper|newsletter)/i, type: 'Article', typeZh: '文章' },
    { pattern: /feature\s+article/i, type: 'Feature Article', typeZh: '專題報導' },
    { pattern: /speech|address\s+to|talk\s+to/i, type: 'Speech', typeZh: '演講辭' },
    { pattern: /proposal|propose\s+a\s+plan/i, type: 'Proposal', typeZh: '計劃書' },
    { pattern: /report\s+(on|to|about)|write\s+a\s+report/i, type: 'Report', typeZh: '報告' },
    { pattern: /blog\s+(entry|post)|write\s+a\s+blog/i, type: 'Blog Entry', typeZh: '部落格文章' },
    { pattern: /(promotional\s+)?leaflet|brochure|create\s+a\s+(promotional\s+)?leaflet/i, type: 'Promotional Leaflet', typeZh: '宣傳單張' },
    { pattern: /diary|dear\s+diary/i, type: 'Diary Entry', typeZh: '日記' },
    { pattern: /essay|argumentative|discuss\s+(the|both)|express\s+your\s+(opinion|views)/i, type: 'Argumentative Essay', typeZh: '議論文' },
    { pattern: /short\s+story|write\s+a\s+story/i, type: 'Short Story', typeZh: '短篇故事' },
    { pattern: /notice|announcement/i, type: 'Notice', typeZh: '通告' },
    { pattern: /complete\s+the\s+form|fill\s+in|application\s+form/i, type: 'Application Form', typeZh: '申請表格' },
    { pattern: /email\s+to/i, type: 'Email', typeZh: '電郵' },
  ];

  for (const { pattern, type, typeZh } of textTypePatterns) {
    if (pattern.test(lower)) {
      const guide = Object.values(DSE_TEXT_TYPE_GUIDE).find(g => g.name === type);
      return {
        type,
        typeZh,
        formatRequirements: guide?.requiredElements || ['Clear structure', 'Appropriate tone', 'Complete content'],
      };
    }
  }

  // Fallback
  return { type: 'General Writing', typeZh: '一般寫作', formatRequirements: ['Introduction', 'Body paragraphs', 'Conclusion'] };
}

function detectContext(questionText: string): { role: string; roleZh: string; scenario: string; scenarioZh: string } {
  const rolePatterns: Array<{ pattern: RegExp; role: string; roleZh: string }> = [
    { pattern: /you\s+are\s+(the\s+)?(a\s+)?(chairperson|president|head)\s+of/i, role: 'Club/Society Chairperson', roleZh: '學會/社團主席' },
    { pattern: /you\s+are\s+(the\s+)?(a\s+)?(school\s+)?reporter/i, role: 'School Reporter', roleZh: '校園記者' },
    { pattern: /you\s+are\s+(the\s+)?(a\s+)?(student|form\s+\d\s+student)/i, role: 'Student', roleZh: '學生' },
    { pattern: /you\s+are\s+(the\s+)?(a\s+)?(employee|staff|team\s+member)/i, role: 'Employee', roleZh: '員工' },
    { pattern: /you\s+are\s+(the\s+)?(a\s+)?(customer|guest|visitor)/i, role: 'Customer/Guest', roleZh: '顧客/訪客' },
    { pattern: /you\s+are\s+(the\s+)?(a\s+)?(editor)/i, role: 'Editor', roleZh: '編輯' },
    { pattern: /you\s+are\s+(the\s+)?(a\s+)?(friend)/i, role: 'Friend', roleZh: '朋友' },
    { pattern: /as\s+(a|the)\s+(student|reporter|employee|editor|chairperson)/i, role: 'Role specified in context', roleZh: '情境中指定的角色' },
  ];

  for (const { pattern, role, roleZh } of rolePatterns) {
    if (pattern.test(questionText)) {
      return {
        role,
        roleZh,
        scenario: questionText.slice(0, 150).trim(),
        scenarioZh: questionText.slice(0, 100).trim(),
      };
    }
  }

  return { role: 'Writer (unspecified)', roleZh: '作者（未指定）', scenario: questionText.slice(0, 150).trim(), scenarioZh: questionText.slice(0, 100).trim() };
}

function detectAudience(questionText: string): { who: string; whoZh: string; toneRequired: string } {
  const lower = questionText.toLowerCase();

  if (/editor/i.test(lower) && /letter to the editor/i.test(lower)) {
    return { who: 'Newspaper Editor and general public', whoZh: '報紙編輯及公眾', toneRequired: 'Formal, persuasive, respectful' };
  }
  if (/principal|headmaster|headmistress|school\s+board/i.test(lower)) {
    return { who: 'School Principal/Board', whoZh: '校長/校董會', toneRequired: 'Formal, respectful, persuasive' };
  }
  if (/hotel\s+manager|restaurant\s+manager|store\s+manager/i.test(lower)) {
    return { who: 'Business Manager', whoZh: '商業經理', toneRequired: 'Formal but firm, polite complaint' };
  }
  if (/friend/i.test(lower)) {
    return { who: 'Friend', whoZh: '朋友', toneRequired: 'Informal, warm, supportive' };
  }
  if (/fellow\s+students|schoolmates|classmates/i.test(lower)) {
    return { who: 'Fellow Students', whoZh: '同學', toneRequired: 'Semi-formal, engaging, relatable' };
  }
  if (/tourists|visitors|travel/i.test(lower)) {
    return { who: 'Tourists/Travelers', whoZh: '遊客/旅客', toneRequired: 'Engaging, informative, inviting' };
  }
  if (/general\s+public|community|residents/i.test(lower)) {
    return { who: 'General Public', whoZh: '公眾', toneRequired: 'Accessible, informative, balanced' };
  }
  if (/teenagers|young\s+people|youth/i.test(lower)) {
    return { who: 'Teenagers/Young People', whoZh: '青少年', toneRequired: 'Engaging, relatable, casual-professional' };
  }

  return { who: 'General audience (infer from context)', whoZh: '一般讀者（從上下文推斷）', toneRequired: 'Semi-formal, clear, appropriate to text type' };
}

function detectContentRequirements(questionText: string): string[] {
  const requirements: string[] = [];

  // Look for numbered/bulleted requirements
  const bulletMatch = questionText.match(/[•\-\*]\s*(.+?)(?=[•\-\*\n]|$)/g);
  if (bulletMatch) {
    bulletMatch.forEach(b => requirements.push(b.replace(/^[•\-\*]\s*/, '').trim()));
  }

  // Look for "you should" patterns
  const shouldMatches = questionText.match(/you\s+should\s+[^.;]+/gi);
  if (shouldMatches) {
    shouldMatches.forEach(m => {
      const cleaned = m.replace(/you\s+should\s+/i, '').trim();
      if (!requirements.some(r => r.includes(cleaned.slice(0, 20)))) {
        requirements.push(cleaned);
      }
    });
  }

  // Look for "include the following" / "in your [text], you should"
  const includeMatch = questionText.match(/(?:include|explain|describe|discuss)\s*(?::|the\s+following)?\s*[^.;]+/gi);
  if (includeMatch && requirements.length === 0) {
    includeMatch.forEach(m => requirements.push(m.trim()));
  }

  return requirements.length > 0 ? requirements : ['Respond to all parts of the prompt'];
}

function analyzeHiddenRequirements(
  questionText: string,
  textType: { type: string; typeZh: string },
  toneRequired: string
): { appropriateTone: string; suggestedTense: string; suggestedPerson: string; specialNotes: string[] } {
  const specialNotes: string[] = [];
  const lower = questionText.toLowerCase();

  // Tone
  let appropriateTone = toneRequired;
  if (/complaint|disappointed|unhappy|problem|issue|concern/i.test(lower)) {
    appropriateTone += ' — Express dissatisfaction politely but firmly. Avoid aggressive language.';
    specialNotes.push('這是投訴/不滿類文章，需保持禮貌但堅定的語氣，切忌情緒化或攻擊性用詞。');
  }

  // Tense
  let suggestedTense = 'Present tense for opinions; past tense for recounting events';
  if (/recently|yesterday|last\s+(week|month|year)|experience(d)?|happened/i.test(lower)) {
    suggestedTense = 'PAST TENSE for describing events; present tense for current feelings/reflections';
    specialNotes.push('題目含有過去時間標記，描述事件時需用過去式。');
  }
  if (/plan|upcoming|will|future|next|propose|suggest/i.test(lower)) {
    suggestedTense = 'FUTURE/PRESENT for plans and suggestions; present for current situation';
  }

  // Person
  let suggestedPerson = 'First person (I/we) for personal views; third person for objective facts';
  if (textType.type === 'Report' || textType.type === 'Proposal') {
    suggestedPerson = 'THIRD PERSON primarily. Minimize "I". Use passive voice and objective statements.';
    specialNotes.push('報告/計劃書應以第三人稱和被動語態為主，保持客觀專業。');
  }
  if (textType.type === 'Diary Entry' || textType.type === 'Blog Entry') {
    suggestedPerson = 'FIRST PERSON (I) throughout. This is personal writing.';
    specialNotes.push('日記/部落格是個人化文體，全程使用第一人稱「I」。');
  }
  if (textType.type === 'Speech') {
    suggestedPerson = 'First AND second person (I/we + you). Engage the audience directly.';
    specialNotes.push('演講辭需使用第一和第二人稱，直接與聽眾互動。');
  }

  return { appropriateTone, suggestedTense, suggestedPerson, specialNotes };
}

function generateChecklist(
  questionText: string,
  textType: { type: string; typeZh: string; formatRequirements: string[] },
  instructionVerbs: InstructionVerb[],
  contentRequirements: string[]
): string[] {
  const checklist: string[] = [
    `📝 我確認文體是「${textType.typeZh}」嗎？`,
    `🎯 我理解要${instructionVerbs.map(iv => iv.meaningZh).join('、')}嗎？`,
    ...formatRequirements.map((req, i) => `✅ 格式檢查 ${i + 1}：我的文章有包含「${req}」嗎？`),
    ...contentRequirements.map((req, i) => `📋 內容要點 ${i + 1}：我有回應「${req}」嗎？`),
    `🔍 每寫完一段，我都有回頭檢查是否離題嗎？`,
    `⏱️ 我的字數是否在要求範圍內？`,
    `✍️ 我有留時間做校對（proofreading）嗎？`,
  ];

  return checklist;
}

function identifyPitfalls(
  questionText: string,
  textType: { type: string; typeZh: string }
): Array<{ pitfall: string; pitfallZh: string; howToAvoid: string }> {
  const pitfalls: Array<{ pitfall: string; pitfallZh: string; howToAvoid: string }> = [];

  // General pitfalls
  pitfalls.push({
    pitfall: 'Misreading the text type and using wrong format',
    pitfallZh: '誤判文體，使用錯誤格式',
    howToAvoid: `確認文體是「${textType.typeZh}」。熟記此文體的必備格式元素。`,
  });

  pitfalls.push({
    pitfall: 'Not addressing ALL the content requirements listed in the prompt',
    pitfallZh: '遺漏題目列出的內容要求',
    howToAvoid: '在題目上圈出所有內容要點，每寫完一個就打勾確認。',
  });

  pitfalls.push({
    pitfall: 'Writing off-topic — including irrelevant information',
    pitfallZh: '離題 — 寫了不相關的內容',
    howToAvoid: '每段寫完後問自己：「這段是否直接回應題目要求？」若非必要，刪除。',
  });

  // Text-type specific pitfalls
  if (textType.type === 'Formal Letter') {
    pitfalls.push({
      pitfall: 'Using "Yours sincerely" with "Dear Sir/Madam" (or vice versa)',
      pitfallZh: '稱呼與結尾敬語配對錯誤',
      howToAvoid: 'Dear [Name] → Yours sincerely | Dear Sir/Madam → Yours faithfully',
    });
  }

  if (textType.type === 'Speech') {
    pitfalls.push({
      pitfall: 'Forgetting to greet the audience and thank them at the end',
      pitfallZh: '忘記開場問候和結尾致謝',
      howToAvoid: '開頭必寫「Good morning/afternoon, [audience]」，結尾必寫「Thank you」。',
    });
  }

  if (textType.type === 'Argumentative Essay') {
    pitfalls.push({
      pitfall: 'Writing a one-sided essay without counter-argument and rebuttal',
      pitfallZh: '只寫單方面論點，缺少反方論點和駁論',
      howToAvoid: '必須包含 1 個 counter-argument + 1 個 rebuttal。這是 Level 3 和 Level 5 的分水嶺。',
    });
  }

  if (textType.type === 'Proposal') {
    pitfalls.push({
      pitfall: 'Objectives too vague — not SMART (Specific, Measurable, Achievable, Relevant, Time-bound)',
      pitfallZh: '目標太空泛，不符合 SMART 原則',
      howToAvoid: '每個目標要有具體數字/指標。例如「Increase participation by 30%」而非「Get more people involved」。',
    });
  }

  if (textType.type === 'Report') {
    pitfalls.push({
      pitfall: 'Using too much first person (I/we) — report should be objective',
      pitfallZh: '過度使用第一人稱，報告應客觀',
      howToAvoid: '使用被動語態：「It was found that...」而非「I found that...」。',
    });
  }

  return pitfalls;
}

function generateOffTopicIndicators(questionText: string, textType: { type: string; typeZh: string }): string[] {
  const indicators = [
    '你的文章沒有明確回應題目的核心要求',
    '大量抄襲題目原文而非用自己的文字表達',
    '引入與題目完全無關的個人經歷或知識',
    '文體格式完全錯誤（例如題目要求書信，你寫成文章）',
    '語氣與受眾完全不匹配（例如對校長用口語化語氣）',
    '內容重複，三個論點實際上在說同一件事',
    '結論段引入新的論點或例子',
  ];

  if (textType.type === 'Argumentative Essay') {
    indicators.push('只有描述問題而沒有表達自己的立場（缺少 thesis statement）');
  }

  return indicators;
}

// ============================================
// 快速審題摘要（給學生看）
// ============================================

export interface QuickAnalysisSummary {
  textTypeZh: string;
  instructionVerbsZh: string;
  audienceZh: string;
  tone: string;
  keyRequirements: string[];
  topTip: string;
}

export function getQuickAnalysis(analysis: QuestionAnalysis): QuickAnalysisSummary {
  return {
    textTypeZh: analysis.keywords.textType.typeZh,
    instructionVerbsZh: analysis.keywords.instructionVerbs.map(iv => iv.meaningZh).join('、'),
    audienceZh: analysis.keywords.audience.whoZh,
    tone: analysis.hiddenRequirements.appropriateTone.split(' — ')[0] || analysis.hiddenRequirements.appropriateTone,
    keyRequirements: analysis.keywords.contentRequirements.slice(0, 3),
    topTip: analysis.commonPitfalls[0]?.howToAvoid || '仔細閱讀題目，確保理解所有要求後才開始寫作。',
  };
}
