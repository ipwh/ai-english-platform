// ============================================
// Integrated Skills 配置 — Paper 3 難度 + 題型對照表
// 提取自 ai-service.ts 的 generateIntegratedSkills() 函式
// ============================================

export interface DifficultyConfig {
  label: string;
  lines: string;
  traps: string;
  wordLimit: number;
}

export const INTEGRATED_SKILLS_DIFF_MAP: Record<string, DifficultyConfig> = {
  remedial: {
    label: '補底 (Level 1-2)',
    lines: '一段短對話，8-12 行，2 位說話者',
    traps: '無需刻意加入陷阱',
    wordLimit: 80,
  },
  core: {
    label: '核心 (Level 3)',
    lines: '一段中等對話，12-18 行，2-3 位說話者，含 1-2 個 distraction',
    traps: '必須包含 1 個 distraction (說了又改) + 1 個 synonym replacement',
    wordLimit: 120,
  },
  challenge: {
    label: '挑戰 (Level 4-5)',
    lines: '一段長對話或 2 段相關對話，18-30 行，2-3 位說話者',
    traps: '必須包含 2+ 個陷阱：distraction + synonym + speaker attitude + numerical precision',
    wordLimit: 180,
  },
};

export interface TaskTypeConfig {
  name: string;
  nameZh: string;
  formatHint: string;
}

export const INTEGRATED_SKILLS_TASK_TYPE_MAP: Record<string, TaskTypeConfig> = {
  'summary': {
    name: 'Summary',
    nameZh: '摘要寫作',
    formatHint: 'Write a concise summary. Use your own words — do NOT copy directly from the listening. Organize points logically.',
  },
  'email-reply': {
    name: 'Email Reply',
    nameZh: '電郵回覆',
    formatHint: 'Write a proper email reply. Include: subject line, appropriate salutation, body paragraphs addressing all points from the listening, polite closing. Use semi-formal to formal tone.',
  },
  'short-article': {
    name: 'Short Article',
    nameZh: '短文撰寫',
    formatHint: 'Write a short article. Include: catchy headline, engaging opening, body paragraphs with key points from the listening, and a concluding remark. Use an appropriate tone for the target audience.',
  },
  'report': {
    name: 'Report',
    nameZh: '報告撰寫',
    formatHint: 'Write a report. Include: title ("Report on..."), introduction/background, findings (use sub-headings), and recommendations. Use objective tone and passive voice where appropriate.',
  },
};
