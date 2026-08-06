// ============================================
// Shared skill labels — single source of truth
// Previously duplicated in LearningDecisionEngine (45 entries)
// and TeacherDecisionEngine (22 entries).
//
// Why: One place to update when adding a new skill.
// ============================================

const SKILL_LABELS_ZH: Record<string, string> = {
  // Grammar
  tenses: '時態',
  'subject-verb-agreement': '主謂一致',
  'passive-voice': '被動語態',
  conditionals: '條件句',
  'relative-clauses': '關係子句',
  connectors: '連接詞',
  articles: '冠詞',
  prepositions: '介詞',
  'modal-verbs': '情態動詞',
  'gerunds-infinitives': '動名詞與不定詞',
  'reported-speech': '轉述句',
  comparatives: '比較級',
  inversion: '倒裝句',
  'phrasal-verbs': '片語動詞',
  subjunctive: '虛擬語氣',
  // Writing
  'essay-structure': '文章結構',
  'argument-development': '論點發展',
  'coherence-cohesion': '連貫與銜接',
  'tone-register': '語調與語域',
  'letter-format': '書信格式',
  'report-format': '報告格式',
  'article-format': '文章格式',
  // Reading
  'skimming-scanning': '略讀與掃讀',
  inference: '推論',
  'vocabulary-in-context': '語境詞彙',
  'tone-analysis': '語氣分析',
  'summary-skills': '摘要技巧',
  // Generic
  grammar: '文法',
  vocabulary: '詞彙',
  writing: '寫作',
  reading: '閱讀',
  listening: '聆聽',
  speaking: '說話',
};

export function skillLabelZh(skill: string): string {
  return SKILL_LABELS_ZH[skill] ?? skill;
}
