// Sprint 10: Word Relations — synonyms, antonyms, collocations
import type { WordRelations, Collocation } from '../types';

// ============================================
// Curated DSE-relevant word relations
// ============================================

const RELATIONS_DB: Record<string, WordRelations> = {
  important: {
    synonyms: ['crucial', 'vital', 'essential', 'significant', 'paramount', 'indispensable'],
    antonyms: ['unimportant', 'trivial', 'insignificant', 'minor', 'negligible'],
    collocations: [
      { pattern: 'vitally important', example: 'Education is vitally important for social mobility.', exampleZh: '教育對社會流動至關重要。' },
      { pattern: 'play an important role', example: 'Technology plays an important role in modern education.', exampleZh: '科技在現代教育中扮演重要角色。' },
      { pattern: 'of paramount importance', example: 'Environmental protection is of paramount importance.', exampleZh: '環境保護至為重要。' },
    ],
    relatedExpressions: ['of great significance', 'a key factor', 'a major concern'],
  },
  good: {
    synonyms: ['beneficial', 'advantageous', 'favourable', 'positive', 'worthwhile'],
    antonyms: ['bad', 'harmful', 'detrimental', 'adverse', 'unfavourable'],
    collocations: [
      { pattern: 'do good', example: 'Volunteering does good for the community.', exampleZh: '義工服務對社區有益。' },
      { pattern: 'for the good of', example: 'We must act for the good of future generations.', exampleZh: '我們必須為後代的福祉而行動。' },
    ],
    relatedExpressions: ['bring about positive change', 'yield beneficial results'],
  },
  problem: {
    synonyms: ['issue', 'challenge', 'concern', 'difficulty', 'obstacle', 'dilemma'],
    antonyms: ['solution', 'answer', 'resolution'],
    collocations: [
      { pattern: 'pose a problem', example: 'Cyberbullying poses a serious problem for teenagers.', exampleZh: '網絡欺凌對青少年構成嚴重問題。' },
      { pattern: 'address/tackle a problem', example: 'The government must tackle the housing problem.', exampleZh: '政府必須解決房屋問題。' },
      { pattern: 'a pressing problem', example: 'Climate change is a pressing global problem.', exampleZh: '氣候變化是一個迫切的全球問題。' },
    ],
    relatedExpressions: ['a matter of concern', 'give rise to issues'],
  },
  increase: {
    synonyms: ['rise', 'grow', 'surge', 'escalate', 'soar', 'climb', 'mount'],
    antonyms: ['decrease', 'decline', 'drop', 'fall', 'plummet', 'dwindle'],
    collocations: [
      { pattern: 'a sharp/significant increase', example: 'There has been a sharp increase in online learning.', exampleZh: '網上學習出現了急劇增長。' },
      { pattern: 'on the increase', example: 'Environmental awareness is on the increase.', exampleZh: '環保意識正在上升。' },
    ],
    relatedExpressions: ['an upward trend', 'a steady rise'],
  },
  government: {
    synonyms: ['authorities', 'administration', 'the state', 'policymakers'],
    antonyms: [],
    collocations: [
      { pattern: 'the government should', example: 'The government should allocate more resources to education.', exampleZh: '政府應分配更多資源給教育。' },
      { pattern: 'government policy', example: 'Government policy on renewable energy has been effective.', exampleZh: '政府的可再生能源政策已見成效。' },
      { pattern: 'call on the government to', example: 'Citizens call on the government to take immediate action.', exampleZh: '市民呼籲政府立即採取行動。' },
    ],
    relatedExpressions: ['public sector', 'state intervention'],
  },
  environment: {
    synonyms: ['surroundings', 'ecosystem', 'nature', 'the natural world'],
    antonyms: [],
    collocations: [
      { pattern: 'protect the environment', example: 'We must protect the environment for future generations.', exampleZh: '我們必須為後代保護環境。' },
      { pattern: 'environmentally friendly', example: 'We should adopt environmentally friendly practices.', exampleZh: '我們應採用環保的做法。' },
      { pattern: 'environmental degradation', example: 'Industrialization has led to environmental degradation.', exampleZh: '工業化導致了環境惡化。' },
    ],
    relatedExpressions: ['go green', 'sustainable development', 'eco-friendly'],
  },
  technology: {
    synonyms: ['innovation', 'digital tools', 'technological advances', 'IT'],
    antonyms: [],
    collocations: [
      { pattern: 'advances in technology', example: 'Advances in technology have transformed education.', exampleZh: '科技進步改變了教育。' },
      { pattern: 'cutting-edge technology', example: 'The school uses cutting-edge technology in classrooms.', exampleZh: '學校在課室使用尖端科技。' },
      { pattern: 'technology plays a role', example: 'Technology plays a pivotal role in modern society.', exampleZh: '科技在現代社會中扮演關鍵角色。' },
    ],
    relatedExpressions: ['the digital age', 'tech-savvy', 'state-of-the-art'],
  },
  education: {
    synonyms: ['schooling', 'learning', 'teaching', 'instruction', 'academic study'],
    antonyms: [],
    collocations: [
      { pattern: 'quality education', example: 'Every child deserves access to quality education.', exampleZh: '每個孩子都應該獲得優質教育。' },
      { pattern: 'higher education', example: 'Higher education broadens career opportunities.', exampleZh: '高等教育擴闊就業機會。' },
      { pattern: 'the education system', example: 'The education system needs comprehensive reform.', exampleZh: '教育制度需要全面改革。' },
    ],
    relatedExpressions: ['lifelong learning', 'academic pursuits'],
  },
  health: {
    synonyms: ['well-being', 'fitness', 'physical condition', 'wellness'],
    antonyms: ['illness', 'disease', 'sickness'],
    collocations: [
      { pattern: 'mental health', example: 'Mental health awareness has increased significantly.', exampleZh: '精神健康意識已顯著提高。' },
      { pattern: 'public health', example: 'Public health campaigns promote healthy lifestyles.', exampleZh: '公共衛生宣傳推廣健康生活。' },
      { pattern: 'pose a health risk', example: 'Air pollution poses a serious health risk.', exampleZh: '空氣污染構成嚴重的健康風險。' },
    ],
    relatedExpressions: ['health-conscious', 'a healthy lifestyle'],
  },
};

/** Get word relations (synonyms, antonyms, collocations) */
export function getWordRelations(word: string): WordRelations | null {
  const lower = word.toLowerCase();
  return RELATIONS_DB[lower] ?? null;
}

/** Find collocations for a word */
export function getCollocations(word: string): Collocation[] {
  return RELATIONS_DB[word.toLowerCase()]?.collocations ?? [];
}

/** Get synonyms for a word */
export function getSynonyms(word: string): string[] {
  return RELATIONS_DB[word.toLowerCase()]?.synonyms ?? [];
}

/** Get all words with relation data */
export function getAllRelationWords(): string[] {
  return Object.keys(RELATIONS_DB);
}
