// ============================================
// 資料型別定義 — AI 英語學習平台
// 依據：ELE KLACG 2017（香港英文課程指引）
// ============================================

// ============================================
// 一、課程架構核心 (ELE KLACG 2017 Ch.2)
// ============================================

/** 課程三大範疇 (Three Strands) */
export type CurriculumStrand = 'interpersonal' | 'knowledge' | 'experience';

/** 學習階段 (Key Stages)：KS1=P1-P3, KS2=P4-P6, KS3=S1-S3, KS4=S4-S6 */
export type KeyStage = 'KS1' | 'KS2' | 'KS3' | 'KS4';

/** 年級 (對應 Key Stage) */
export type GradeLevel = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

/** 學習目標分類 (Learning Objective Categories) */
export type LearningObjCategory =
  | 'language-forms'       // 語言形式與溝通功能
  | 'language-skills'      // 語言技能與發展策略
  | 'attitudes';           // 英語學習態度

// ============================================
// 二、語言形式與溝通功能 (Language Forms & Communicative Functions)
//    參照 Appendix 4
// ============================================

/** 文法項目 (Grammar Items) — 對應 Appendix 4 */
export type GrammarItem =
  | 'tenses'                    // 時態
  | 'conditionals'              // 條件句 (Type 0/1/2/3)
  | 'passive-voice'             // 被動語態
  | 'reported-speech'           // 轉述句
  | 'relative-clauses'          // 關係子句
  | 'modals'                    // 情態動詞
  | 'articles'                  // 冠詞
  | 'prepositions'              // 介詞
  | 'connectives'               // 連接詞
  | 'gerunds-infinitives'       // 動名詞與不定詞
  | 'subject-verb-agreement'    // 主謂一致
  | 'comparatives-superlatives' // 比較級與最高級
  | 'question-forms'            // 疑問句
  | 'negation'                  // 否定句
  | 'phrasal-verbs'             // 片語動詞
  | 'adjectives-adverbs'        // 形容詞與副詞
  | 'pronouns'                  // 代名詞
  | 'quantifiers'               // 數量詞
  | 'participles'               // 分詞（現在/過去分詞作形容詞）
  | 'inversion'                 // 倒裝句
  | 'noun-clauses'              // 名詞子句
  | 'participle-phrases';       // 分詞短語

/** 溝通功能 (Communicative Functions) — 對應 Appendix 4 */
export type CommunicativeFunction =
  | 'greeting-introducing'       // 打招呼 / 自我介紹
  | 'thanking-apologizing'       // 致謝 / 道歉
  | 'requesting-offering'        // 請求 / 提供協助
  | 'describing-people-things'   // 描述人物事物
  | 'comparing-contrasting'      // 比較對比
  | 'explaining-giving-reasons'  // 解釋原因
  | 'expressing-opinions'        // 表達意見
  | 'agreeing-disagreeing'       // 同意 / 反對
  | 'persuading-advising'        // 說服 / 建議
  | 'narrating-events'           // 敘述事件
  | 'giving-instructions'        // 給予指示
  | 'making-predictions'         // 作出預測
  | 'expressing-feelings'        // 表達感受
  | 'discussing-possibilities';  // 討論可能性

// ============================================
// 三、語言技能與發展策略 (Language Skills & Development Strategies)
//    參照 Appendix 5
// ============================================

/** 語言技能 */
export type LanguageSkill = 'listening' | 'speaking' | 'reading' | 'writing';

/** 語言發展策略 (Language Development Strategies) */
export type LanguageStrategy =
  | 'word-formation'        // 構詞法
  | 'collocations'          // 詞彙搭配
  | 'lexical-relations'     // 詞義關係
  | 'guessing-meaning'      // 猜測詞義
  | 'dictionary-use'        // 使用字典
  | 'word-webs'             // 詞彙網絡圖
  | 'mnemonics'             // 記憶法
  | 'skimming'              // 略讀
  | 'scanning'              // 掃讀
  | 'inferencing'           // 推論
  | 'identifying-main-idea' // 找出主旨
  | 'text-structure'        // 文本結構分析
  | 'planning'              // 構思
  | 'drafting'              // 草稿
  | 'revising'              // 修改
  | 'editing'               // 校對
  | 'peer-review';          // 同儕互評

// ============================================
// 四、文本類型 (Text Types) — 參照 Appendix 3
// ============================================

export type TextType =
  | 'story' | 'biography' | 'diary' | 'news-report'
  | 'information-report' | 'explanation' | 'news-article' | 'editorial'
  | 'brochure' | 'leaflet' | 'poster' | 'notice'
  | 'instructions' | 'recipe' | 'rules'
  | 'personal-letter' | 'formal-letter' | 'complaint-letter' | 'email'
  | 'blog-post' | 'social-media-post' | 'invitation'
  | 'argumentative-essay' | 'discussion' | 'debate-speech'
  | 'poem' | 'song-lyrics' | 'play-script' | 'film-review' | 'book-review'
  | 'graph' | 'chart' | 'map' | 'timeline'
  | 'advertisement' | 'webpage' | 'multimodal-text';

// ============================================
// 五、共通能力 (Generic Skills) — 9 項，3 個集群
//    參照 Section 2.2.3
// ============================================

export type GenericSkillCluster = 'basic' | 'thinking' | 'personal-social';

export type GenericSkill =
  | 'communication'       // 溝通能力
  | 'mathematical'        // 數學能力
  | 'it-skills'           // 資訊科技能力
  | 'critical-thinking'   // 批判性思考
  | 'creativity'          // 創造力
  | 'problem-solving'     // 解決問題
  | 'self-management'     // 自我管理
  | 'self-learning'       // 自主學習
  | 'collaboration';      // 協作能力

// ============================================
// 六、價值觀與態度 (Values & Attitudes)
//    參照 Appendix 8 & 9，七大首要價值觀
// ============================================

export type PriorityValue =
  | 'perseverance'      // 堅毅
  | 'respect'           // 尊重他人
  | 'responsibility'    // 責任感
  | 'national-identity' // 國民身份認同
  | 'commitment'        // 承擔精神
  | 'integrity'         // 誠信
  | 'care-for-others';  // 關愛

// ============================================
// 七、學習模組 (Modules) — 參照 Appendix 11
// ============================================

export type ModuleTheme =
  | 'myself-and-family'
  | 'school-life'
  | 'food-and-drinks'
  | 'hobbies-and-interests'
  | 'nature-and-environment'
  | 'cultures-of-the-world'
  | 'science-and-technology'
  | 'health-and-wellness'
  | 'social-issues'
  | 'work-and-careers'
  | 'media-and-communication'
  | 'teenage-life';

// ============================================
// 八、使用者 / 角色
// ============================================

export type UserRole = 'student' | 'teacher' | 'admin';

export interface User {
  id: string;
  nameZh: string;
  nameEn: string;
  role: UserRole;
  avatar?: string;
  className?: string;
  classNumber?: string;
  email?: string;
  streakDays: number;
  joinedAt: string;
}

// ============================================
// 九、技能掌握 (Skill Mastery)
// ============================================

export type DifficultyLevel = 'remedial' | 'core' | 'challenge';

export interface SkillMastery {
  strand: CurriculumStrand;
  category: LearningObjCategory;
  grammarItem?: GrammarItem;
  languageSkill?: LanguageSkill;
  subSkill: string;
  subSkillZh: string;
  percentage: number;
  lastPracticed: string;
  keyStage: KeyStage;
}

export interface SkillSummary {
  grammarItem?: GrammarItem;
  languageSkill?: LanguageSkill;
  subSkill: string;
  subSkillZh: string;
  accuracy: number;
  totalAttempts: number;
}

// ============================================
// 十、學生
// ============================================

export interface Student extends User {
  role: 'student';
  level: GradeLevel;
  keyStage: KeyStage;
  overallAccuracy: number;
  strandMastery: { interpersonal: number; knowledge: number; experience: number };
  skillMastery: { listening: number; speaking: number; reading: number; writing: number };
  masteryBySkill: SkillMastery[];
  weakSkills: SkillSummary[];
  assignments: AssignmentSummary[];
  mistakes: MistakeItem[];
  vocabularyItems: VocabItem[];
  genericSkills: { skill: GenericSkill; level: number }[];
  diagnosticCompleted: boolean;
}

// ============================================
// 十一、教師
// ============================================

export interface Teacher extends User {
  role: 'teacher';
  subjects: string[];
  classes: string[];
}

// ============================================
// 十二、練習題目
// ============================================

export type QuestionType = 'mc' | 'fill-blank' | 'error-correction' | 'short-writing' | 'matching' | 'reordering' | 'cloze';

export interface PracticeQuestion {
  id: string;
  type: QuestionType;
  strand: CurriculumStrand;
  grammarItem?: GrammarItem;
  languageSkill?: LanguageSkill;
  communicativeFunction?: CommunicativeFunction;
  textType?: TextType;
  unitId?: string;
  subSkill: string;
  subSkillZh: string;
  difficulty: DifficultyLevel;
  gradeLevel: GradeLevel;
  keyStage: KeyStage;
  prompt: string;
  promptZh?: string;
  choices?: string[];
  answer: string;
  explanationZh: string;
  explanationEn: string;
  commonMistake: string;
  grammarPoint?: string;
  hintLevels: string[];
  genericSkills?: GenericSkill[];
  values?: PriorityValue[];
  audioUrl?: string;
  vocabularyFocus?: string[];
  /** 聆聽題：獨立聆聽內容（對話/段落），與 prompt（題目）分開 */
  listeningContent?: string;
  listeningContentZh?: string;
  /** 閱讀題：獨立閱讀篇章，與 prompt（題目）分開 */
  readingContent?: string;
  readingContentZh?: string;
}

// ============================================
// 十三、作業 / 任務
// ============================================

export type AssignmentStatus = 'not-started' | 'in-progress' | 'completed' | 'overdue';
export type ReviewStatus = 'pending' | 'reviewed' | 'returned';

export interface Assignment {
  id: string;
  title: string;
  className: string;
  gradeLevel: GradeLevel;
  keyStage: KeyStage;
  strand: CurriculumStrand;
  grammarItem?: GrammarItem;
  languageSkill?: LanguageSkill;
  difficulty: DifficultyLevel;
  questionType: QuestionType;
  questionCount: number;
  dueDate: string;
  status: AssignmentStatus;
  completionRate: number;
  assignedBy: string;
  createdAt: string;
  unitId?: string;
}

export interface AssignmentSummary {
  id: string;
  title: string;
  strand?: CurriculumStrand;
  grammarItem?: GrammarItem;
  languageSkill?: LanguageSkill;
  dueDate: string;
  status: AssignmentStatus;
  score?: number;
  teacherFeedback?: string;
}

// ============================================
// 十四、錯題
// ============================================

export type MistakeType = 'grammar' | 'vocabulary' | 'comprehension' | 'careless' | 'time-management' | 'chinglish';

export interface MistakeItem {
  id: string;
  questionId: string;
  questionSummary: string;
  strand?: CurriculumStrand;
  grammarItem?: GrammarItem;
  languageSkill?: LanguageSkill;
  subSkill?: string;
  subSkillZh?: string;
  mistakeType: MistakeType;
  studentAnswer: string;
  correctAnswer: string;
  date: string;
  reviewed: boolean;
  inReviewList: boolean;
  aiExplanation?: string;
}

// ============================================
// 十五、生字簿
// ============================================

export type Familiarity = 'new' | 'learning' | 'familiar' | 'mastered';

/** 0-5 SRS 掌握度評級 */
export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface VocabItem {
  id: string;
  word: string;
  partOfSpeech: string;
  allPartOfSpeech?: string[];     // 所有常見詞性
  meaningZh: string;
  secondaryMeaningZh?: string;    // 次要中文意思
  exampleSentence: string;
  exampleZh: string;
  synonyms?: string[];            // 同義字
  antonyms?: string[];            // 反義字
  collocations?: string[];        // 常見搭配
  /** 學習策略提示 — 由前端根據 familiarity + masteryLevel 推導，不存 DB */
  strategy?: string;
  familiarity: Familiarity;
  masteryLevel: MasteryLevel;    // 0-5
  nextReviewDate: string;
  easeFactor?: number;
  reviewInterval?: number;
  createdAt?: string;            // 加入生字簿日期
}

// ============================================
// 十六、教材
// ============================================

export type MaterialType = 'pdf' | 'docx' | 'image' | 'ppt' | 'video' | 'audio' | 'link';
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Material {
  id: string;
  title: string;
  type: MaterialType;
  uploadedAt: string;
  tags: string[];
  module?: ModuleTheme;
  unitId?: string;
  textType?: TextType;
  gradeLevels?: GradeLevel[];
  ocrStatus: ProcessingStatus;
  ragStatus: ProcessingStatus;
  fileSize: string;
  uploadedBy: string;
  canGenerateQuestions?: boolean;
}

// ============================================
// 十七、AI 批改覆核
// ============================================

export interface ReviewItem {
  id: string;
  studentId: string;
  studentName: string;
  assignmentId: string;
  assignmentTitle: string;
  questionPrompt: string;
  questionType?: string;
  studentAnswer: string;
  aiScore: number;
  aiFeedback: string;
  aiMistakeType?: MistakeType;
  teacherScore?: number;
  teacherFeedback?: string;
  status: ReviewStatus;
  submittedAt: string;
}

// ============================================
// 十八、通知
// ============================================

export type NotificationType = 'assignment' | 'feedback' | 'reminder' | 'system' | 'achievement' | 'curriculum-update';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
}

// ============================================
// 十九、成就徽章
// ============================================

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  genericSkill?: GenericSkill;
  value?: PriorityValue;
  unlockedAt?: string;
  unlocked: boolean;
}

// ============================================
// 二十、班級
// ============================================

export interface ClassInfo {
  id: string;
  name: string;
  gradeLevel: GradeLevel;
  keyStage: KeyStage;
  studentCount: number;
  avgAccuracy: number;
  avgCompletionRate: number;
  weakestGrammarItem?: GrammarItem;
  weakestSkill?: LanguageSkill;
}

// ============================================
// 二十一、報告與分析
// ============================================

export interface WeeklyReport {
  id: string;
  className: string;
  weekStart: string;
  avgAccuracy: number;
  avgCompletion: number;
  activeStudents: number;
  topWeakGrammar?: GrammarItem;
  topWeakSkill?: LanguageSkill;
  topWeakSkillZh?: string;
  highlights: string;
  strandProgress?: { interpersonal: number; knowledge: number; experience: number };
}

export interface SkillHeatmapData {
  item: string;
  itemZh: string;
  [className: string]: number | string;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ClassStudentSummary {
  id: string;
  nameZh: string;
  nameEn: string;
  completionRate: number;
  accuracy: number;
  weakSkillZh: string;
  weakSkill?: GrammarItem | LanguageSkill;
  lastLogin: string;
  riskLevel: RiskLevel;
  weakGenericSkill?: GenericSkill;
}

// ============================================
// 二十二、寫作支援
// ============================================

export interface WritingDraft {
  id: string;
  title: string;
  prompt: string;
  textType?: TextType;
  draft: string;
  revisedVersion?: string;
  aiSuggestions?: string[];
  chinglishWarnings?: string[];
  teacherComment?: string;
  submittedAt: string;
  unitId?: string;
}

// ============================================
// 二十三、KPI 卡片
// ============================================

export interface KpiData {
  label: string;
  value: number | string;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  change?: number;
  icon?: string;
}

// ============================================
// 二十四、課程對照輔助常數
// ============================================

export const GRAMMAR_ITEM_LABELS: Record<GrammarItem, { zh: string; en: string }> = {
  'tenses': { zh: '時態', en: 'Tenses' },
  'conditionals': { zh: '條件句', en: 'Conditionals' },
  'passive-voice': { zh: '被動語態', en: 'Passive Voice' },
  'reported-speech': { zh: '轉述句', en: 'Reported Speech' },
  'relative-clauses': { zh: '關係子句', en: 'Relative Clauses' },
  'modals': { zh: '情態動詞', en: 'Modals' },
  'articles': { zh: '冠詞', en: 'Articles' },
  'prepositions': { zh: '介詞', en: 'Prepositions' },
  'connectives': { zh: '連接詞', en: 'Connectives' },
  'gerunds-infinitives': { zh: '動名詞與不定詞', en: 'Gerunds & Infinitives' },
  'subject-verb-agreement': { zh: '主謂一致', en: 'Subject-Verb Agreement' },
  'comparatives-superlatives': { zh: '比較級與最高級', en: 'Comparatives & Superlatives' },
  'question-forms': { zh: '疑問句', en: 'Question Forms' },
  'negation': { zh: '否定句', en: 'Negation' },
  'phrasal-verbs': { zh: '片語動詞', en: 'Phrasal Verbs' },
  'adjectives-adverbs': { zh: '形容詞與副詞', en: 'Adjectives & Adverbs' },
  'pronouns': { zh: '代名詞', en: 'Pronouns' },
  'quantifiers': { zh: '數量詞', en: 'Quantifiers' },
  'participles': { zh: '分詞', en: 'Participles' },
  'inversion': { zh: '倒裝句', en: 'Inversion' },
  'noun-clauses': { zh: '名詞子句', en: 'Noun Clauses' },
  'participle-phrases': { zh: '分詞短語', en: 'Participle Phrases' },
};

export const PRIORITY_VALUE_LABELS: Record<PriorityValue, { zh: string; en: string }> = {
  'perseverance': { zh: '堅毅', en: 'Perseverance' },
  'respect': { zh: '尊重他人', en: 'Respect for Others' },
  'responsibility': { zh: '責任感', en: 'Responsibility' },
  'national-identity': { zh: '國民身份認同', en: 'National Identity' },
  'commitment': { zh: '承擔精神', en: 'Commitment' },
  'integrity': { zh: '誠信', en: 'Integrity' },
  'care-for-others': { zh: '關愛', en: 'Care for Others' },
};

export const MODULE_THEME_LABELS: Record<ModuleTheme, { zh: string; en: string }> = {
  'myself-and-family': { zh: '個人與家庭', en: 'Myself and Family' },
  'school-life': { zh: '校園生活', en: 'School Life' },
  'food-and-drinks': { zh: '飲食', en: 'Food and Drinks' },
  'hobbies-and-interests': { zh: '興趣與嗜好', en: 'Hobbies and Interests' },
  'nature-and-environment': { zh: '自然與環境', en: 'Nature and Environment' },
  'cultures-of-the-world': { zh: '世界文化', en: 'Cultures of the World' },
  'science-and-technology': { zh: '科學與科技', en: 'Science and Technology' },
  'health-and-wellness': { zh: '健康與保健', en: 'Health and Wellness' },
  'social-issues': { zh: '社會議題', en: 'Social Issues' },
  'work-and-careers': { zh: '工作與事業', en: 'Work and Careers' },
  'media-and-communication': { zh: '媒體與通訊', en: 'Media and Communication' },
  'teenage-life': { zh: '青少年生活', en: 'Teenage Life' },
};

/** 年級對應學習階段 */
export function getKeyStage(gradeLevel: GradeLevel): KeyStage {
  switch (gradeLevel) {
    case 'S1': case 'S2': case 'S3': return 'KS3';
    case 'S4': case 'S5': case 'S6': return 'KS4';
  }
}

/** @deprecated 使用 GrammarItem | LanguageSkill 替代，保留以兼容舊程式碼 */
export type SkillCategory = 'grammar' | 'vocabulary' | 'reading' | 'writing' | 'error-correction';
