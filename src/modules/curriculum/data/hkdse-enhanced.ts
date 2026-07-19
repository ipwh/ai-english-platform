// Sprint 26 Enhanced: HKDSE assessment specifications
// Source: HKEAA — HKDSE English Language Assessment Framework

import type { HKDSELevel, CEFRLevel } from '@/modules/knowledge-graph/types';
import type { SkillDimension } from '@/modules/profile/types';

// ============================================
// DSE Paper Weightings (HKEAA Official)
// ============================================

export const DSE_PAPER_WEIGHTINGS = {
  paper1: { name: 'Reading', nameZh: '閱讀', weight: 0.20, duration: 90, marks: '~50-60' },
  paper2: { name: 'Writing', nameZh: '寫作', weight: 0.25, duration: 120, marks: 'Part A: 20%, Part B: 80% (within paper)' },
  paper3: { name: 'Listening & Integrated Skills', nameZh: '聆聽及綜合能力', weight: 0.30, duration: 120, marks: 'Part A: ~15%, Part B: ~85% (within paper)' },
  paper4: { name: 'Speaking', nameZh: '說話', weight: 0.10, duration: 20, marks: 'Group Discussion + Individual Response' },
  sba: { name: 'School-based Assessment', nameZh: '校本評核', weight: 0.15, duration: 'S5-S6', marks: 'Part A + Part B' },
} as const;

export const DSE_TOTAL_WEIGHT = Object.values(DSE_PAPER_WEIGHTINGS).reduce((s, p) => s + p.weight, 0); // 1.0

// ============================================
// DSE Level Descriptors (HKEAA Official)
// Maps HKDSE Levels to descriptors
// ============================================

export interface DSELevelDescriptor {
  level: number;         // 1, 2, 3, 4, 5, 5*, 5**
  label: string;
  labelZh: string;
  ucasPoints: number;
  description: string;
  descriptionZh: string;
}

export const DSE_LEVEL_DESCRIPTORS: DSELevelDescriptor[] = [
  { level: 1, label: 'Level 1', labelZh: '第一級', ucasPoints: 0,
    description: 'Can understand and use simple English in familiar contexts. Shows basic knowledge of grammar and vocabulary but with frequent errors.',
    descriptionZh: '能在熟悉情境中理解及使用簡單英語。對文法及詞彙有基本認識，但常有錯誤。' },
  { level: 2, label: 'Level 2', labelZh: '第二級', ucasPoints: 0,
    description: 'Can communicate in straightforward situations. Uses basic grammar and vocabulary with some accuracy.',
    descriptionZh: '能在簡單情境中溝通。能大致準確使用基本文法及詞彙。' },
  { level: 3, label: 'Level 3', labelZh: '第三級', ucasPoints: 16,
    description: 'Can handle moderately complex communication. Shows good control of grammar and adequate vocabulary range.',
    descriptionZh: '能處理中等複雜程度的溝通。文法運用良好，詞彙範圍足夠。' },
  { level: 4, label: 'Level 4', labelZh: '第四級', ucasPoints: 32,
    description: 'Can communicate effectively in most situations. Demonstrates good grammatical control and appropriate vocabulary use.',
    descriptionZh: '能在大部分情境中有效溝通。文法控制良好，詞彙運用恰當。' },
  { level: 5, label: 'Level 5', labelZh: '第五級', ucasPoints: 48,
    description: 'Can communicate fluently and accurately. Shows sophisticated use of language with nuanced expression.',
    descriptionZh: '能流暢準確地溝通。語言運用成熟，表達細膩。' },
  { level: 6, label: 'Level 5*', labelZh: '第五*級', ucasPoints: 56,
    description: 'Can communicate with near-native fluency. Demonstrates excellent grammatical accuracy and extensive vocabulary.',
    descriptionZh: '溝通接近母語水平。文法極準確，詞彙豐富。' },
  { level: 7, label: 'Level 5**', labelZh: '第五**級', ucasPoints: 64,
    description: 'Can communicate at an exceptionally high level. Shows mastery of complex language use across all contexts.',
    descriptionZh: '溝通能力極高。在所有情境中均能熟練運用複雜語言。' },
];

// ============================================
// DSE Text Types (Paper 1 & Paper 2 requirements)
// ============================================

export interface DSETextType {
  type: string;
  typeZh: string;
  papers: string[];        // Which DSE papers test this
  commonFeatures: string[];
}

export const DSE_TEXT_TYPES: DSETextType[] = [
  { type: 'Article / Feature Article', typeZh: '文章／專題文章', papers: ['Paper 1', 'Paper 2'],
    commonFeatures: ['Headline', 'Byline', 'Lead paragraph', 'Subheadings', 'Quotes'] },
  { type: 'Letter to the Editor', typeZh: '讀者來函', papers: ['Paper 2'],
    commonFeatures: ['Salutation', 'Statement of purpose', 'Arguments with evidence', 'Polite closing'] },
  { type: 'Editorial', typeZh: '社論', papers: ['Paper 1', 'Paper 2'],
    commonFeatures: ['Thesis statement', 'Persuasive language', 'Rhetorical devices', 'Call to action'] },
  { type: 'Report', typeZh: '報告', papers: ['Paper 2', 'Paper 3'],
    commonFeatures: ['Title', 'Introduction/Purpose', 'Findings', 'Recommendations', 'Formal tone'] },
  { type: 'Proposal', typeZh: '建議書', papers: ['Paper 2', 'Paper 3'],
    commonFeatures: ['Problem statement', 'Proposed solution', 'Justification', 'Budget/timeline'] },
  { type: 'Speech', typeZh: '演講辭', papers: ['Paper 2'],
    commonFeatures: ['Greeting', 'Rhetorical questions', 'Repetition', 'Memorable closing'] },
  { type: 'Argumentative Essay', typeZh: '議論文', papers: ['Paper 2'],
    commonFeatures: ['Thesis', 'Topic sentences', 'Counter-arguments', 'Evidence', 'Conclusion'] },
  { type: 'Discursive Essay', typeZh: '討論文', papers: ['Paper 2'],
    commonFeatures: ['Balanced view', 'Multiple perspectives', 'Evaluation', 'Personal stance (optional)'] },
  { type: 'Short Story / Narrative', typeZh: '短篇故事／敘述', papers: ['Paper 2'],
    commonFeatures: ['Plot', 'Characters', 'Setting', 'Dialogue', 'Climax'] },
  { type: 'Email / Memorandum', typeZh: '電郵／備忘錄', papers: ['Paper 2', 'Paper 3'],
    commonFeatures: ['Subject line', 'Concise paragraphs', 'Action items', 'Professional tone'] },
  { type: 'Leaflet / Brochure', typeZh: '單張／小冊子', papers: ['Paper 2'],
    commonFeatures: ['Headings', 'Bullet points', 'Visual layout', 'Persuasive language'] },
  { type: 'Blog Post', typeZh: '網誌文章', papers: ['Paper 2'],
    commonFeatures: ['Engaging title', 'Personal voice', 'Comments section', 'Links/references'] },
];

// ============================================
// DSE Paper 3 Integrated Skills — Task Types
// ============================================

export const DSE_PAPER3_TASK_TYPES = [
  { task: 'Summary', taskZh: '摘要', description: 'Condense listening content into key points' },
  { task: 'Email Reply', taskZh: '電郵回覆', description: 'Write a professional email based on listening data' },
  { task: 'Report', taskZh: '報告', description: 'Write a formal report synthesizing listening + data file' },
  { task: 'Letter', taskZh: '書信', description: 'Write a formal/informal letter based on context' },
  { task: 'Article', taskZh: '文章', description: 'Write a feature article for a specific audience' },
  { task: 'Speech', taskZh: '演講辭', description: 'Write a speech script for a given occasion' },
];

// ============================================
// DSE Common Topics (from past paper analysis)
// ============================================

export const DSE_COMMON_TOPICS = [
  { topic: 'Technology & Social Media', topicZh: '科技與社交媒體', papers: ['All'], frequency: 'Very High' },
  { topic: 'Environment & Sustainability', topicZh: '環境與可持續發展', papers: ['All'], frequency: 'High' },
  { topic: 'Education & Learning', topicZh: '教育與學習', papers: ['All'], frequency: 'High' },
  { topic: 'Health & Well-being', topicZh: '健康與福祉', papers: ['Paper 1', 'Paper 2'], frequency: 'High' },
  { topic: 'Work & Career', topicZh: '工作與職業', papers: ['Paper 2', 'Paper 3'], frequency: 'Medium' },
  { topic: 'Culture & Arts', topicZh: '文化與藝術', papers: ['Paper 1', 'Paper 2'], frequency: 'Medium' },
  { topic: 'Sports & Leisure', topicZh: '運動與休閒', papers: ['Paper 1', 'Paper 2'], frequency: 'Medium' },
  { topic: 'Social Issues', topicZh: '社會議題', papers: ['All'], frequency: 'High' },
  { topic: 'Travel & Tourism', topicZh: '旅遊與觀光', papers: ['Paper 2', 'Paper 3'], frequency: 'Medium' },
  { topic: 'Food & Nutrition', topicZh: '食物與營養', papers: ['Paper 1', 'Paper 2'], frequency: 'Low' },
];

// ============================================
// HKDSE ↔ CEFR Alignment (EDB Official)
// ============================================

export const HKDSE_CEFR_ALIGNMENT: Record<number, CEFRLevel> = {
  1: 'A2',
  2: 'A2',
  3: 'B1',
  4: 'B1',
  5: 'B2',   // HKDSE Level 5 = CEFR B2
  6: 'B2',   // HKDSE Level 5* = CEFR B2
  7: 'C1',   // HKDSE Level 5** = CEFR C1
};

// ============================================
// CEFR ↔ HKDSE Skill-Level Expectations
// ============================================

export interface SkillExpectation {
  gradeLevel: HKDSELevel;
  targetCEFR: CEFRLevel;
  targetHKDSE: number;
  expectedSkills: Partial<Record<SkillDimension, { targetAccuracy: number; targetMastery: number }>>;
}

export const GRADE_EXPECTATIONS: SkillExpectation[] = [
  { gradeLevel: 'S1', targetCEFR: 'A2', targetHKDSE: 1,
    expectedSkills: { grammar: { targetAccuracy: 0.60, targetMastery: 55 }, vocabulary: { targetAccuracy: 0.55, targetMastery: 50 }, reading: { targetAccuracy: 0.55, targetMastery: 50 } },
  },
  { gradeLevel: 'S2', targetCEFR: 'A2', targetHKDSE: 1,
    expectedSkills: { grammar: { targetAccuracy: 0.65, targetMastery: 60 }, vocabulary: { targetAccuracy: 0.60, targetMastery: 55 }, reading: { targetAccuracy: 0.60, targetMastery: 55 }, writing: { targetAccuracy: 0.55, targetMastery: 50 } },
  },
  { gradeLevel: 'S3', targetCEFR: 'B1', targetHKDSE: 2,
    expectedSkills: { grammar: { targetAccuracy: 0.70, targetMastery: 65 }, vocabulary: { targetAccuracy: 0.65, targetMastery: 60 }, reading: { targetAccuracy: 0.65, targetMastery: 60 }, writing: { targetAccuracy: 0.60, targetMastery: 55 }, listening: { targetAccuracy: 0.60, targetMastery: 55 } },
  },
  { gradeLevel: 'S4', targetCEFR: 'B1', targetHKDSE: 3,
    expectedSkills: { grammar: { targetAccuracy: 0.75, targetMastery: 70 }, vocabulary: { targetAccuracy: 0.70, targetMastery: 65 }, reading: { targetAccuracy: 0.70, targetMastery: 65 }, writing: { targetAccuracy: 0.65, targetMastery: 60 }, listening: { targetAccuracy: 0.65, targetMastery: 60 }, speaking: { targetAccuracy: 0.60, targetMastery: 55 } },
  },
  { gradeLevel: 'S5', targetCEFR: 'B2', targetHKDSE: 4,
    expectedSkills: { grammar: { targetAccuracy: 0.80, targetMastery: 75 }, vocabulary: { targetAccuracy: 0.75, targetMastery: 70 }, reading: { targetAccuracy: 0.75, targetMastery: 70 }, writing: { targetAccuracy: 0.70, targetMastery: 65 }, listening: { targetAccuracy: 0.70, targetMastery: 65 }, speaking: { targetAccuracy: 0.65, targetMastery: 60 } },
  },
  { gradeLevel: 'S6', targetCEFR: 'B2', targetHKDSE: 5,
    expectedSkills: { grammar: { targetAccuracy: 0.85, targetMastery: 80 }, vocabulary: { targetAccuracy: 0.80, targetMastery: 75 }, reading: { targetAccuracy: 0.80, targetMastery: 75 }, writing: { targetAccuracy: 0.75, targetMastery: 70 }, listening: { targetAccuracy: 0.75, targetMastery: 70 }, speaking: { targetAccuracy: 0.70, targetMastery: 65 } },
  },
];
