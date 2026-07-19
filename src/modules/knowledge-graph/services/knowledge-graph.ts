// Sprint 21: Knowledge Graph — full curriculum graph with all 6 skill dimensions
// Builds on top of the existing GRAMMAR_GRAPH from learning module
import type {
  KnowledgeNode, KnowledgeEdge, KnowledgeGraph, GraphMetadata,
  CEFRLevel, HKDSELevel,
} from '../types';
import type { SkillDimension } from '@/modules/profile/types';
import { GRAMMAR_GRAPH } from '@/modules/learning/services/knowledge-graph';

// ============================================
// CEFR ↔ HKDSE Level Mapping
// ============================================

export const CEFR_TO_HKDSE: Record<CEFRLevel, HKDSELevel[]> = {
  A1: ['S1'],
  A2: ['S1', 'S2'],
  B1: ['S2', 'S3', 'S4'],
  B2: ['S4', 'S5', 'S6'],
  C1: ['S6'],
  C2: ['S6'],
};

export const HKDSE_TO_CEFR: Record<HKDSELevel, CEFRLevel> = {
  S1: 'A2', S2: 'B1', S3: 'B1', S4: 'B2', S5: 'B2', S6: 'B2',
};

// ============================================
// Build KnowledgeNode from existing SkillNode
// ============================================

function buildGrammarNode(id: string, title: string, titleZh: string, dseLevel: HKDSELevel, prerequisites: string[], estimatedHours: number, successors: string[]): KnowledgeNode {
  return {
    id, title, titleZh,
    skill: 'grammar',
    difficulty: (dseLevel === 'S1' || dseLevel === 'S2') ? 1 : (dseLevel === 'S3' || dseLevel === 'S4') ? 2 : 3 as 1 | 2 | 3,
    cefr: HKDSE_TO_CEFR[dseLevel],
    hkdseLevel: dseLevel,
    estimatedLearningTime: estimatedHours * 60,
    masteryThreshold: 70,
    prerequisites,
    successors,
    learningObjectives: [`Master ${title} for HKDSE ${dseLevel} level`],
    learningObjectivesZh: [`掌握${titleZh}，達 HKDSE ${dseLevel} 水平`],
    commonMistakes: [{ description: `Common errors with ${title}`, descriptionZh: `${titleZh}常見錯誤`, severity: 'major' }],
    exampleQuestions: [{ question: `Practice ${title}`, questionZh: `練習${titleZh}`, answer: '', explanation: '' }],
    tags: ['grammar', `hkdse-${dseLevel.toLowerCase()}`, id],
  };
}

// ============================================
// VOCABULARY NODES
// ============================================

const VOCABULARY_NODES: KnowledgeNode[] = [
  {
    id: 'vocab-basic-academic', title: 'Basic Academic Vocabulary', titleZh: '基礎學術詞彙',
    skill: 'vocabulary', difficulty: 1, cefr: 'A2', hkdseLevel: 'S1',
    estimatedLearningTime: 180, masteryThreshold: 65,
    prerequisites: [], successors: ['vocab-theme-based', 'vocab-word-formation'],
    learningObjectives: ['Recognize and use 500+ common academic words'], learningObjectivesZh: ['認識及運用 500+ 常見學術詞彙'],
    commonMistakes: [{ description: 'Confusing similar-looking words', descriptionZh: '混淆拼寫相似的詞彙', severity: 'major' }],
    exampleQuestions: [{ question: 'Choose the correct word: affect vs effect', questionZh: '選擇正確詞彙：affect vs effect', answer: '', explanation: '' }],
    tags: ['vocabulary', 'academic', 'foundation'],
  },
  {
    id: 'vocab-theme-based', title: 'Theme-Based Vocabulary', titleZh: '主題詞彙',
    skill: 'vocabulary', difficulty: 2, cefr: 'B1', hkdseLevel: 'S3',
    estimatedLearningTime: 240, masteryThreshold: 65,
    prerequisites: ['vocab-basic-academic'], successors: ['vocab-advanced-domain'],
    learningObjectives: ['Learn vocabulary organized by DSE themes (environment, technology, society, etc.)'], learningObjectivesZh: ['按 DSE 主題學習詞彙（環境、科技、社會等）'],
    commonMistakes: [{ description: 'Using words in wrong context', descriptionZh: '在不當語境使用詞彙', severity: 'major' }],
    exampleQuestions: [{ question: 'Match the word to the correct theme category', questionZh: '將詞彙配對至正確主題類別', answer: '', explanation: '' }],
    tags: ['vocabulary', 'thematic', 'dse-themes'],
  },
  {
    id: 'vocab-word-formation', title: 'Word Formation', titleZh: '構詞法',
    skill: 'vocabulary', difficulty: 2, cefr: 'B1', hkdseLevel: 'S2',
    estimatedLearningTime: 150, masteryThreshold: 60,
    prerequisites: ['vocab-basic-academic'], successors: ['vocab-advanced-domain'],
    learningObjectives: ['Understand prefixes, suffixes, and word roots'], learningObjectivesZh: ['理解前綴、後綴及詞根'],
    commonMistakes: [{ description: 'Incorrect prefix/suffix usage', descriptionZh: '錯誤使用前綴/後綴', severity: 'minor' }],
    exampleQuestions: [{ question: 'Form a new word using the suffix -tion', questionZh: '使用後綴 -tion 構成新詞', answer: '', explanation: '' }],
    tags: ['vocabulary', 'morphology', 'word-building'],
  },
  {
    id: 'vocab-advanced-domain', title: 'Advanced Domain Vocabulary', titleZh: '進階領域詞彙',
    skill: 'vocabulary', difficulty: 4, cefr: 'B2', hkdseLevel: 'S5',
    estimatedLearningTime: 300, masteryThreshold: 70,
    prerequisites: ['vocab-theme-based', 'vocab-word-formation'], successors: [],
    learningObjectives: ['Master domain-specific vocabulary for DSE Paper 1 and Paper 2'], learningObjectivesZh: ['掌握 DSE 卷一卷二領域專用詞彙'],
    commonMistakes: [{ description: 'Overusing advanced words incorrectly', descriptionZh: '錯誤使用過於艱深的詞彙', severity: 'major' }],
    exampleQuestions: [{ question: 'Use domain vocabulary in a formal essay', questionZh: '在正式文章中運用領域詞彙', answer: '', explanation: '' }],
    tags: ['vocabulary', 'advanced', 'dse-paper-1', 'dse-paper-2'],
  },
  {
    id: 'vocab-collocations', title: 'Collocations & Phrases', titleZh: '搭配詞與短語',
    skill: 'vocabulary', difficulty: 3, cefr: 'B1', hkdseLevel: 'S4',
    estimatedLearningTime: 200, masteryThreshold: 65,
    prerequisites: ['vocab-theme-based'], successors: ['vocab-advanced-domain'],
    learningObjectives: ['Learn and apply common English collocations'], learningObjectivesZh: ['學習及應用常見英語搭配詞'],
    commonMistakes: [{ description: 'Direct translation from Chinese creating unnatural collocations', descriptionZh: '中式直譯造成不自然搭配', severity: 'major' }],
    exampleQuestions: [{ question: 'Choose the correct collocation: make/do a decision', questionZh: '選擇正確搭配：make/do a decision', answer: '', explanation: '' }],
    tags: ['vocabulary', 'collocations', 'fluency'],
  },
];

// ============================================
// READING NODES
// ============================================

const READING_NODES: KnowledgeNode[] = [
  {
    id: 'reading-skimming', title: 'Skimming & Scanning', titleZh: '略讀與掃讀',
    skill: 'reading', difficulty: 1, cefr: 'A2', hkdseLevel: 'S1',
    estimatedLearningTime: 120, masteryThreshold: 65,
    prerequisites: [], successors: ['reading-main-idea', 'reading-text-types'],
    learningObjectives: ['Quickly locate key information in texts'], learningObjectivesZh: ['快速定位文本關鍵信息'],
    commonMistakes: [{ description: 'Reading every word instead of scanning', descriptionZh: '逐字閱讀而非掃讀', severity: 'minor' }],
    exampleQuestions: [{ question: 'Scan the passage for the year mentioned', questionZh: '掃讀文章找出提及的年份', answer: '', explanation: '' }],
    tags: ['reading', 'speed-reading', 'foundation'],
  },
  {
    id: 'reading-main-idea', title: 'Identifying Main Ideas', titleZh: '辨識主旨',
    skill: 'reading', difficulty: 2, cefr: 'B1', hkdseLevel: 'S3',
    estimatedLearningTime: 150, masteryThreshold: 65,
    prerequisites: ['reading-skimming'], successors: ['reading-inference', 'reading-summary'],
    learningObjectives: ['Identify topic sentences and main arguments'], learningObjectivesZh: ['辨識主題句及主要論點'],
    commonMistakes: [{ description: 'Confusing supporting details with main idea', descriptionZh: '將支持細節誤認為主旨', severity: 'major' }],
    exampleQuestions: [{ question: 'What is the main idea of paragraph 2?', questionZh: '第二段的主旨是甚麼？', answer: '', explanation: '' }],
    tags: ['reading', 'comprehension', 'main-idea'],
  },
  {
    id: 'reading-text-types', title: 'Understanding Text Types', titleZh: '理解文體類型',
    skill: 'reading', difficulty: 2, cefr: 'B1', hkdseLevel: 'S2',
    estimatedLearningTime: 180, masteryThreshold: 65,
    prerequisites: ['reading-skimming'], successors: ['reading-inference'],
    learningObjectives: ['Recognize and analyze different text types (narrative, expository, persuasive, etc.)'], learningObjectivesZh: ['辨識及分析不同文體（敘述、說明、議論等）'],
    commonMistakes: [{ description: 'Applying wrong reading strategy for text type', descriptionZh: '對不同文體使用錯誤的閱讀策略', severity: 'major' }],
    exampleQuestions: [{ question: 'What type of text is this?', questionZh: '這是哪種文體？', answer: '', explanation: '' }],
    tags: ['reading', 'text-types', 'analysis'],
  },
  {
    id: 'reading-inference', title: 'Making Inferences', titleZh: '推論技巧',
    skill: 'reading', difficulty: 3, cefr: 'B1', hkdseLevel: 'S4',
    estimatedLearningTime: 180, masteryThreshold: 70,
    prerequisites: ['reading-main-idea', 'reading-text-types'], successors: ['reading-critical-analysis'],
    learningObjectives: ['Draw logical conclusions from implicit information'], learningObjectivesZh: ['從隱含信息中得出邏輯結論'],
    commonMistakes: [{ description: 'Making assumptions not supported by text', descriptionZh: '作出文本不支持的假設', severity: 'critical' }],
    exampleQuestions: [{ question: 'What can you infer about the authors attitude?', questionZh: '你可以推論作者持甚麼態度？', answer: '', explanation: '' }],
    tags: ['reading', 'inference', 'critical-thinking'],
  },
  {
    id: 'reading-summary', title: 'Summarizing Texts', titleZh: '文本摘要',
    skill: 'reading', difficulty: 2, cefr: 'B1', hkdseLevel: 'S3',
    estimatedLearningTime: 120, masteryThreshold: 65,
    prerequisites: ['reading-main-idea'], successors: ['reading-critical-analysis'],
    learningObjectives: ['Write concise summaries capturing key points'], learningObjectivesZh: ['撰寫簡潔摘要，捕捉重點'],
    commonMistakes: [{ description: 'Including too many details in summary', descriptionZh: '摘要包含過多細節', severity: 'minor' }],
    exampleQuestions: [{ question: 'Summarize the passage in 50 words', questionZh: '用 50 字總結文章', answer: '', explanation: '' }],
    tags: ['reading', 'summary', 'synthesis'],
  },
  {
    id: 'reading-critical-analysis', title: 'Critical Analysis', titleZh: '批判分析',
    skill: 'reading', difficulty: 4, cefr: 'B2', hkdseLevel: 'S5',
    estimatedLearningTime: 240, masteryThreshold: 70,
    prerequisites: ['reading-inference', 'reading-summary'], successors: [],
    learningObjectives: ['Evaluate arguments, identify bias, analyze tone and purpose'], learningObjectivesZh: ['評估論點、識別偏見、分析語氣與目的'],
    commonMistakes: [{ description: 'Accepting text claims without critical evaluation', descriptionZh: '未經批判評估便接受文本主張', severity: 'major' }],
    exampleQuestions: [{ question: 'Evaluate the strength of the argument in paragraph 3', questionZh: '評估第三段論點的強度', answer: '', explanation: '' }],
    tags: ['reading', 'critical-analysis', 'evaluation'],
  },
];

// ============================================
// WRITING NODES
// ============================================

const WRITING_NODES: KnowledgeNode[] = [
  {
    id: 'writing-paragraph', title: 'Paragraph Structure', titleZh: '段落結構',
    skill: 'writing', difficulty: 1, cefr: 'A2', hkdseLevel: 'S1',
    estimatedLearningTime: 150, masteryThreshold: 65,
    prerequisites: [], successors: ['writing-essay-structure', 'writing-coherence'],
    learningObjectives: ['Write well-structured paragraphs with topic sentences'], learningObjectivesZh: ['撰寫結構良好的段落，包含主題句'],
    commonMistakes: [{ description: 'Missing topic sentence', descriptionZh: '缺少主題句', severity: 'major' }],
    exampleQuestions: [{ question: 'Write a paragraph about your favourite hobby', questionZh: '寫一段關於你喜愛的嗜好', answer: '', explanation: '' }],
    tags: ['writing', 'paragraph', 'foundation'],
  },
  {
    id: 'writing-essay-structure', title: 'Essay Structure', titleZh: '文章結構',
    skill: 'writing', difficulty: 2, cefr: 'B1', hkdseLevel: 'S2',
    estimatedLearningTime: 180, masteryThreshold: 65,
    prerequisites: ['writing-paragraph'], successors: ['writing-argumentative', 'writing-discursive', 'writing-letter'],
    learningObjectives: ['Structure essays with introduction, body, and conclusion'], learningObjectivesZh: ['以引言、正文、結論結構文章'],
    commonMistakes: [{ description: 'Weak or missing thesis statement', descriptionZh: '論點陳述薄弱或缺失', severity: 'critical' }],
    exampleQuestions: [{ question: 'Outline an essay on the importance of education', questionZh: '為「教育的重要性」擬定大綱', answer: '', explanation: '' }],
    tags: ['writing', 'essay', 'structure'],
  },
  {
    id: 'writing-coherence', title: 'Coherence & Cohesion', titleZh: '連貫與銜接',
    skill: 'writing', difficulty: 2, cefr: 'B1', hkdseLevel: 'S3',
    estimatedLearningTime: 150, masteryThreshold: 65,
    prerequisites: ['writing-paragraph'], successors: ['writing-argumentative'],
    learningObjectives: ['Use transition words and logical connectors effectively'], learningObjectivesZh: ['有效使用過渡詞及邏輯連接詞'],
    commonMistakes: [{ description: 'Overusing or misusing transition words', descriptionZh: '過度使用或誤用過渡詞', severity: 'minor' }],
    exampleQuestions: [{ question: 'Add appropriate transitions to connect these sentences', questionZh: '加入適當過渡詞連接這些句子', answer: '', explanation: '' }],
    tags: ['writing', 'coherence', 'transitions'],
  },
  {
    id: 'writing-argumentative', title: 'Argumentative Writing', titleZh: '議論文寫作',
    skill: 'writing', difficulty: 3, cefr: 'B2', hkdseLevel: 'S4',
    estimatedLearningTime: 240, masteryThreshold: 70,
    prerequisites: ['writing-essay-structure', 'writing-coherence'], successors: ['writing-advanced-composition'],
    learningObjectives: ['Construct logical arguments with evidence and counterarguments'], learningObjectivesZh: ['以證據及反駁建構邏輯論證'],
    commonMistakes: [{ description: 'Weak evidence or unsupported claims', descriptionZh: '證據薄弱或主張無依據', severity: 'critical' }],
    exampleQuestions: [{ question: 'Write an argumentative essay: Should school uniforms be abolished?', questionZh: '寫議論文：應否廢除校服？', answer: '', explanation: '' }],
    tags: ['writing', 'argumentative', 'dse-paper-2'],
  },
  {
    id: 'writing-discursive', title: 'Discursive Writing', titleZh: '討論文寫作',
    skill: 'writing', difficulty: 3, cefr: 'B2', hkdseLevel: 'S4',
    estimatedLearningTime: 240, masteryThreshold: 70,
    prerequisites: ['writing-essay-structure'], successors: ['writing-advanced-composition'],
    learningObjectives: ['Present balanced views on complex topics'], learningObjectivesZh: ['就複雜議題提出平衡觀點'],
    commonMistakes: [{ description: 'Showing bias instead of balanced discussion', descriptionZh: '表現偏見而非平衡討論', severity: 'major' }],
    exampleQuestions: [{ question: 'Discuss the pros and cons of social media', questionZh: '討論社交媒體的利與弊', answer: '', explanation: '' }],
    tags: ['writing', 'discursive', 'dse-paper-2'],
  },
  {
    id: 'writing-letter', title: 'Letter & Email Writing', titleZh: '書信及電郵寫作',
    skill: 'writing', difficulty: 2, cefr: 'B1', hkdseLevel: 'S3',
    estimatedLearningTime: 180, masteryThreshold: 65,
    prerequisites: ['writing-essay-structure'], successors: ['writing-advanced-composition'],
    learningObjectives: ['Write formal and informal letters/emails with correct format'], learningObjectivesZh: ['以正確格式撰寫正式及非正式書信/電郵'],
    commonMistakes: [{ description: 'Mixing formal and informal tone', descriptionZh: '混合正式與非正式語氣', severity: 'major' }],
    exampleQuestions: [{ question: 'Write a formal letter of complaint', questionZh: '撰寫一封正式投訴信', answer: '', explanation: '' }],
    tags: ['writing', 'letter', 'email', 'format'],
  },
  {
    id: 'writing-advanced-composition', title: 'Advanced Composition', titleZh: '進階寫作',
    skill: 'writing', difficulty: 5, cefr: 'B2', hkdseLevel: 'S6',
    estimatedLearningTime: 300, masteryThreshold: 75,
    prerequisites: ['writing-argumentative', 'writing-discursive', 'writing-letter'], successors: [],
    learningObjectives: ['Master advanced writing techniques for HKDSE Level 5+'], learningObjectivesZh: ['掌握進階寫作技巧以達 HKDSE 5+ 水平'],
    commonMistakes: [{ description: 'Overly complex sentences reducing clarity', descriptionZh: '句子過於複雜影響清晰度', severity: 'major' }],
    exampleQuestions: [{ question: 'Write a feature article on a social issue', questionZh: '就社會議題撰寫專題文章', answer: '', explanation: '' }],
    tags: ['writing', 'advanced', 'dse-level-5'],
  },
];

// ============================================
// LISTENING NODES
// ============================================

const LISTENING_NODES: KnowledgeNode[] = [
  {
    id: 'listening-gist', title: 'Listening for Gist', titleZh: '聆聽主旨',
    skill: 'listening', difficulty: 1, cefr: 'A2', hkdseLevel: 'S1',
    estimatedLearningTime: 120, masteryThreshold: 60,
    prerequisites: [], successors: ['listening-detail', 'listening-note-taking'],
    learningObjectives: ['Understand the main topic and purpose of spoken texts'], learningObjectivesZh: ['理解口語文本的主題及目的'],
    commonMistakes: [{ description: 'Getting distracted by unfamiliar words', descriptionZh: '被不熟悉詞彙分散注意力', severity: 'minor' }],
    exampleQuestions: [{ question: 'What is the main topic of the conversation?', questionZh: '對話的主題是甚麼？', answer: '', explanation: '' }],
    tags: ['listening', 'gist', 'foundation'],
  },
  {
    id: 'listening-detail', title: 'Listening for Detail', titleZh: '聆聽細節',
    skill: 'listening', difficulty: 2, cefr: 'B1', hkdseLevel: 'S3',
    estimatedLearningTime: 150, masteryThreshold: 65,
    prerequisites: ['listening-gist'], successors: ['listening-inference', 'listening-integrated'],
    learningObjectives: ['Capture specific information, numbers, and facts'], learningObjectivesZh: ['捕捉具體信息、數字及事實'],
    commonMistakes: [{ description: 'Missing key details while focusing on general meaning', descriptionZh: '專注大意時錯過關鍵細節', severity: 'major' }],
    exampleQuestions: [{ question: 'What time does the speaker say the event starts?', questionZh: '講者說活動何時開始？', answer: '', explanation: '' }],
    tags: ['listening', 'detail', 'comprehension'],
  },
  {
    id: 'listening-note-taking', title: 'Note-Taking While Listening', titleZh: '聆聽筆記',
    skill: 'listening', difficulty: 2, cefr: 'B1', hkdseLevel: 'S2',
    estimatedLearningTime: 150, masteryThreshold: 60,
    prerequisites: ['listening-gist'], successors: ['listening-integrated'],
    learningObjectives: ['Take effective notes while listening to extended speech'], learningObjectivesZh: ['在聆聽長篇講話時有效記錄筆記'],
    commonMistakes: [{ description: 'Writing too much and missing subsequent content', descriptionZh: '記錄過多導致錯過後續內容', severity: 'major' }],
    exampleQuestions: [{ question: 'Listen and take notes, then answer questions', questionZh: '聆聽並記錄筆記，然後回答問題', answer: '', explanation: '' }],
    tags: ['listening', 'note-taking', 'strategy'],
  },
  {
    id: 'listening-inference', title: 'Inference in Listening', titleZh: '聆聽推論',
    skill: 'listening', difficulty: 3, cefr: 'B1', hkdseLevel: 'S4',
    estimatedLearningTime: 180, masteryThreshold: 65,
    prerequisites: ['listening-detail'], successors: ['listening-integrated'],
    learningObjectives: ['Infer speaker attitude, intention, and implied meaning'], learningObjectivesZh: ['推論講者態度、意圖及隱含意義'],
    commonMistakes: [{ description: 'Taking literal meaning when tone implies otherwise', descriptionZh: '當語氣暗示相反時仍取字面意思', severity: 'critical' }],
    exampleQuestions: [{ question: 'What is the speakers attitude toward the proposal?', questionZh: '講者對提案持甚麼態度？', answer: '', explanation: '' }],
    tags: ['listening', 'inference', 'tone'],
  },
  {
    id: 'listening-integrated', title: 'Integrated Listening Tasks', titleZh: '綜合聆聽任務',
    skill: 'listening', difficulty: 4, cefr: 'B2', hkdseLevel: 'S5',
    estimatedLearningTime: 240, masteryThreshold: 70,
    prerequisites: ['listening-detail', 'listening-note-taking', 'listening-inference'], successors: [],
    learningObjectives: ['Complete DSE Paper 3 style integrated listening-writing tasks'], learningObjectivesZh: ['完成 DSE 卷三風格綜合聆聽寫作任務'],
    commonMistakes: [{ description: 'Poor time management across listening and writing phases', descriptionZh: '聆聽與寫作階段的時間管理不善', severity: 'critical' }],
    exampleQuestions: [{ question: 'Listen to the recording and complete the data file', questionZh: '聆聽錄音並完成資料檔案', answer: '', explanation: '' }],
    tags: ['listening', 'integrated', 'dse-paper-3'],
  },
];

// ============================================
// SPEAKING NODES
// ============================================

const SPEAKING_NODES: KnowledgeNode[] = [
  {
    id: 'speaking-pronunciation', title: 'Pronunciation & Intonation', titleZh: '發音與語調',
    skill: 'speaking', difficulty: 1, cefr: 'A2', hkdseLevel: 'S1',
    estimatedLearningTime: 180, masteryThreshold: 60,
    prerequisites: [], successors: ['speaking-fluency', 'speaking-discussion'],
    learningObjectives: ['Produce clear and intelligible English speech'], learningObjectivesZh: ['產出清晰易懂的英語口語'],
    commonMistakes: [{ description: 'Flat intonation making speech sound monotonous', descriptionZh: '語調平淡使說話聽起來單調', severity: 'minor' }],
    exampleQuestions: [{ question: 'Read the passage aloud with appropriate intonation', questionZh: '以適當語調朗讀文章', answer: '', explanation: '' }],
    tags: ['speaking', 'pronunciation', 'foundation'],
  },
  {
    id: 'speaking-fluency', title: 'Speaking Fluency', titleZh: '說話流暢度',
    skill: 'speaking', difficulty: 2, cefr: 'B1', hkdseLevel: 'S2',
    estimatedLearningTime: 180, masteryThreshold: 60,
    prerequisites: ['speaking-pronunciation'], successors: ['speaking-discussion', 'speaking-presentation'],
    learningObjectives: ['Speak English with natural pace and minimal hesitation'], learningObjectivesZh: ['以自然節奏說英語，減少猶豫'],
    commonMistakes: [{ description: 'Overthinking grammar while speaking', descriptionZh: '說話時過度思考文法', severity: 'major' }],
    exampleQuestions: [{ question: 'Speak for 1 minute about your weekend plans', questionZh: '用 1 分鐘談論你的週末計劃', answer: '', explanation: '' }],
    tags: ['speaking', 'fluency', 'confidence'],
  },
  {
    id: 'speaking-discussion', title: 'Group Discussion Skills', titleZh: '小組討論技巧',
    skill: 'speaking', difficulty: 3, cefr: 'B1', hkdseLevel: 'S4',
    estimatedLearningTime: 240, masteryThreshold: 70,
    prerequisites: ['speaking-pronunciation', 'speaking-fluency'], successors: ['speaking-dse-exam'],
    learningObjectives: ['Participate effectively in group discussions: agree, disagree, elaborate'], learningObjectivesZh: ['有效參與小組討論：同意、反對、闡述'],
    commonMistakes: [{ description: 'Dominating discussion or not contributing enough', descriptionZh: '主導討論或貢獻不足', severity: 'major' }],
    exampleQuestions: [{ question: 'Discuss with your group: Should homework be banned?', questionZh: '小組討論：應否禁止家課？', answer: '', explanation: '' }],
    tags: ['speaking', 'discussion', 'collaboration'],
  },
  {
    id: 'speaking-presentation', title: 'Individual Presentation', titleZh: '個人演講',
    skill: 'speaking', difficulty: 3, cefr: 'B1', hkdseLevel: 'S3',
    estimatedLearningTime: 180, masteryThreshold: 65,
    prerequisites: ['speaking-fluency'], successors: ['speaking-dse-exam'],
    learningObjectives: ['Deliver a structured 2-minute individual response'], learningObjectivesZh: ['進行有結構的 2 分鐘個人回應'],
    commonMistakes: [{ description: 'Running out of ideas before time is up', descriptionZh: '未夠時間便無話可說', severity: 'major' }],
    exampleQuestions: [{ question: 'Give a 2-minute response: What makes a good leader?', questionZh: '2 分鐘回應：怎樣的領袖才算好？', answer: '', explanation: '' }],
    tags: ['speaking', 'presentation', 'structure'],
  },
  {
    id: 'speaking-dse-exam', title: 'DSE Speaking Exam Preparation', titleZh: 'DSE 口試準備',
    skill: 'speaking', difficulty: 5, cefr: 'B2', hkdseLevel: 'S6',
    estimatedLearningTime: 300, masteryThreshold: 75,
    prerequisites: ['speaking-discussion', 'speaking-presentation'], successors: [],
    learningObjectives: ['Master DSE Paper 4 Speaking exam format and strategies'], learningObjectivesZh: ['掌握 DSE 卷四口試格式及策略'],
    commonMistakes: [{ description: 'Not responding to other candidates points', descriptionZh: '未回應其他考生的觀點', severity: 'critical' }],
    exampleQuestions: [{ question: 'Mock DSE group discussion: 8 minutes', questionZh: '模擬 DSE 小組討論：8 分鐘', answer: '', explanation: '' }],
    tags: ['speaking', 'dse-exam', 'paper-4'],
  },
];

// ============================================
// Build Complete Knowledge Graph
// ============================================

function buildGraphFromExistingGrammar(): KnowledgeNode[] {
  // Compute successors from existing prerequisite data
  const successorMap = new Map<string, string[]>();
  for (const skill of GRAMMAR_GRAPH) {
    for (const prereq of skill.prerequisites) {
      if (!successorMap.has(prereq)) successorMap.set(prereq, []);
      successorMap.get(prereq)!.push(skill.id);
    }
  }

  return GRAMMAR_GRAPH.map(skill => {
    const successors = successorMap.get(skill.id) ?? [];
    return buildGrammarNode(
      skill.id,
      skill.name,
      skill.nameZh,
      skill.dseLevel as HKDSELevel,
      skill.prerequisites,
      skill.estimatedHours,
      successors,
    );
  });
}

export function buildFullKnowledgeGraph(): KnowledgeGraph {
  const grammarNodes = buildGraphFromExistingGrammar();

  const allNodes = [
    ...grammarNodes,
    ...VOCABULARY_NODES,
    ...READING_NODES,
    ...WRITING_NODES,
    ...LISTENING_NODES,
    ...SPEAKING_NODES,
  ];

  const nodeMap = new Map<string, KnowledgeNode>();
  for (const node of allNodes) {
    nodeMap.set(node.id, node);
  }

  // Build edges from prerequisite/successor relationships
  const edges: KnowledgeEdge[] = [];
  for (const node of allNodes) {
    for (const prereq of node.prerequisites) {
      edges.push({
        id: `${prereq}→${node.id}`,
        source: prereq,
        target: node.id,
        type: 'prerequisite',
        weight: 1,
        label: 'requires',
      });
    }
    for (const succ of node.successors) {
      // Only add if not already added as prerequisite edge
      const edgeId = `${node.id}→${succ}`;
      if (!edges.some(e => e.id === edgeId)) {
        edges.push({
          id: edgeId,
          source: node.id,
          target: succ,
          type: 'prerequisite',
          weight: 1,
          label: 'unlocks',
        });
      }
    }
  }

  // Compute metadata
  const nodesPerSkill: Record<SkillDimension, number> = { grammar: 0, vocabulary: 0, reading: 0, writing: 0, listening: 0, speaking: 0 };
  const nodesPerCefr: Record<CEFRLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
  const nodesPerHkdse: Record<HKDSELevel, number> = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0, S6: 0 };

  for (const node of allNodes) {
    nodesPerSkill[node.skill]++;
    nodesPerCefr[node.cefr]++;
    nodesPerHkdse[node.hkdseLevel]++;
  }

  const metadata: GraphMetadata = {
    totalNodes: allNodes.length,
    totalEdges: edges.length,
    nodesPerSkill,
    nodesPerCefr,
    nodesPerHkdse,
    version: '2.0.0',
    lastUpdated: new Date(),
  };

  return { nodes: nodeMap, edges, metadata };
}

// Singleton instance for performance
let _graphInstance: KnowledgeGraph | null = null;

export function getKnowledgeGraph(): KnowledgeGraph {
  if (!_graphInstance) {
    _graphInstance = buildFullKnowledgeGraph();
  }
  return _graphInstance;
}

export function invalidateGraphCache(): void {
  _graphInstance = null;
}
