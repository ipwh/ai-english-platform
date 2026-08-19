// ============================================
// Integrated Skills 配置 — Paper 3 難度 + 題型對照表
// 提取自 ai-service.ts 的 generateIntegratedSkills() 函式
// v2 — 擴充至 9 種文體 + 陷阱類型 + 筆記符號 + 時間配置
// ============================================

export interface DifficultyConfig {
  label: string;
  lines: string;
  traps: string;
  wordLimit: number;
  dataFilePages: number;
  speakerCount: number;
  listeningDuration: string;
}

export const INTEGRATED_SKILLS_DIFF_MAP: Record<string, DifficultyConfig> = {
  remedial: {
    label: '補底 (Level 1-2)',
    lines: '一段完整對話，14-20 行，2 位說話者，內容需包含充足的資訊細節（日期、數字、地點、人名等），每句對話至少 8-15 個英文單詞',
    traps: '無需刻意加入陷阱',
    wordLimit: 80,
    dataFilePages: 2,
    speakerCount: 2,
    listeningDuration: '2-3 分鐘',
  },
  core: {
    label: '核心 (Level 3)',
    lines: '一段完整對話，20-28 行，2-3 位說話者，含充足的情境背景和細節討論，每句對話至少 10-20 個英文單詞，含 1-2 個 distraction',
    traps: '必須包含 1 個 distraction (說了又改) + 1 個 synonym replacement',
    wordLimit: 120,
    dataFilePages: 4,
    speakerCount: 3,
    listeningDuration: '3-4 分鐘',
  },
  challenge: {
    label: '挑戰 (Level 4-5)',
    lines: '一段完整長對話或 2 段相關對話，28-40 行，2-3 位說話者，內容豐富包含背景介紹、討論、決定過程，每句對話至少 12-25 個英文單詞',
    traps: '必須包含 2+ 個陷阱：distraction + synonym + speaker attitude + numerical precision',
    wordLimit: 180,
    dataFilePages: 6,
    speakerCount: 3,
    listeningDuration: '4-5 分鐘',
  },
};

export interface TaskTypeConfig {
  name: string;
  nameZh: string;
  formatHint: string;
  /** DSE 出現頻率（1-5） */
  frequency: number;
  /** 必要格式元素 */
  requiredElements: string[];
}

export const INTEGRATED_SKILLS_TASK_TYPE_MAP: Record<string, TaskTypeConfig> = {
  'summary': {
    name: 'Summary',
    nameZh: '摘要寫作',
    formatHint: 'Write a concise summary. Use your own words — do NOT copy directly from the listening. Organize points logically.',
    frequency: 3,
    requiredElements: ['concise overview', 'logical grouping of points', 'own wording (no direct copy)'],
  },
  'email-reply': {
    name: 'Email Reply',
    nameZh: '電郵回覆',
    formatHint: 'Write a proper email reply. Include: subject line, appropriate salutation, body paragraphs addressing all points from the listening, polite closing. Use semi-formal to formal tone.',
    frequency: 5,
    requiredElements: ['subject line', 'salutation (Dear...)', 'body addressing all points', 'closing (Yours sincerely/faithfully)', 'signature with name + role'],
  },
  'short-article': {
    name: 'Short Article',
    nameZh: '短文撰寫',
    formatHint: 'Write a short article. Include: catchy headline, engaging opening, body paragraphs with key points from the listening, and a concluding remark. Use an appropriate tone for the target audience.',
    frequency: 5,
    requiredElements: ['catchy headline/title', 'engaging opening', 'body paragraphs (1 point per paragraph)', 'concluding remark'],
  },
  'report': {
    name: 'Report',
    nameZh: '報告撰寫',
    formatHint: 'Write a report. Include: title ("Report on..."), introduction/background, findings (use sub-headings), and recommendations. Use objective tone and passive voice where appropriate.',
    frequency: 4,
    requiredElements: ['title (Report on...)', 'introduction/background', 'findings with sub-headings', 'recommendations', 'objective tone'],
  },
  'speech': {
    name: 'Speech',
    nameZh: '演講辭',
    formatHint: 'Write a speech. Greeting line (Good morning Principal, teachers and fellow students), state your role, body with clear topic sentences (First... / Secondly... / Finally...), conclude with a call to action or thank you. Semi-formal tone with audience engagement.',
    frequency: 3,
    requiredElements: ['greeting line (audience hierarchy)', 'self-introduction / role statement', 'body with clear topic sentences', 'call to action / concluding message', 'semi-formal engaging tone'],
  },
  'proposal': {
    name: 'Proposal',
    nameZh: '建議書',
    formatHint: 'Write a proposal. Title ("Proposal for..."), background/current situation, objectives, proposed plan with timeline, budget considerations (if applicable), expected benefits, and conclusion. Formal, persuasive tone.',
    frequency: 3,
    requiredElements: ['title (Proposal for...)', 'background/current situation', 'objectives', 'proposed plan with timeline', 'expected benefits', 'formal persuasive tone'],
  },
  'notice': {
    name: 'Notice',
    nameZh: '通告',
    formatHint: 'Write a notice. Issuing authority centered at top, "Notice" centered below, date, body (concise: include time, venue, purpose, target audience), signature block with name and position. Formal, concise tone — no unnecessary elaboration.',
    frequency: 2,
    requiredElements: ['issuing authority header', 'NOTICE title (centered)', 'date of issue', 'body: time + venue + purpose + target audience', 'signature block (name + position)'],
  },
  'press-release': {
    name: 'Press Release',
    nameZh: '新聞稿',
    formatHint: 'Write a press release. Headline (catchy), dateline (date + location), lead paragraph (5W1H — who/what/when/where/why/how), body paragraphs with supporting details and quotes, boilerplate about the organization, media contact info. Formal, objective, newsworthy tone.',
    frequency: 2,
    requiredElements: ['catchy headline', 'dateline (date + location)', 'lead paragraph (5W1H)', 'body with supporting details', 'organization boilerplate', 'media contact'],
  },
  'letter-to-editor': {
    name: 'Letter to the Editor',
    nameZh: '讀者投稿',
    formatHint: 'Write a letter to the editor. Salutation "Dear Editor,", state your identity and purpose in the opening, respond to a previously published article/viewpoint, use rebuttal if disagreeing, provide supporting arguments with examples, close with "Yours faithfully," and your full name (and title if applicable). Semi-formal to formal tone.',
    frequency: 2,
    requiredElements: ['salutation (Dear Editor,)', 'identity + purpose statement', 'reference to previous article/viewpoint', 'arguments with examples', 'rebuttal (if disagreeing)', 'closing (Yours faithfully,) + full name'],
  },
};
