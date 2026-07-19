// Sprint 36: Writing Coach 2.0 — pure formula (no DB, no LLM)
import type {
  WritingDimensions, BandPrediction, DSEBand,
  RevisionChecklistItem, NextPracticeSuggestion,
  WeakSentenceExample, PersonalizedSuggestion,
} from '../types';

// ============================================
// Dimension Scoring Heuristics
// ============================================

// Transition words for coherence
const TRANSITIONS = [
  'however', 'therefore', 'moreover', 'furthermore', 'consequently',
  'nevertheless', 'meanwhile', 'subsequently', 'additionally', 'in addition',
  'on the other hand', 'in contrast', 'as a result', 'for instance',
  'for example', 'in conclusion', 'to sum up', 'firstly', 'secondly', 'finally',
];

// Cohesive devices for cohesion
const COHESIVE_DEVICES = [
  'this', 'these', 'that', 'those', 'it', 'they', 'them',
  'the former', 'the latter', 'such', 'one', 'ones',
];

// Academic vocabulary indicators
const ACADEMIC_WORDS = [
  'significant', 'therefore', 'consequently', 'furthermore', 'however',
  'nevertheless', 'despite', 'although', 'whereas', 'regarding',
  'concerning', 'particularly', 'specifically', 'generally', 'ultimately',
  'demonstrate', 'indicate', 'suggest', 'establish', 'analyze',
];

// Complex sentence starters
const COMPLEX_STARTERS = [
  'although', 'because', 'since', 'while', 'whereas', 'unless',
  'if', 'when', 'after', 'before', 'despite', 'in spite of',
  'not only', 'whether', 'so that', 'in order to',
];

/**
 * Score grammar quality (0-10).
 * Penalizes: very short sentences, excessive punctuation, common errors.
 */
export function scoreGrammar(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return 0;

  let score = 8; // Start high

  // Penalize very short sentences (potential fragments)
  const fragments = sentences.filter(s => s.split(/\s+/).length < 4);
  score -= Math.min(fragments.length * 0.5, 3);

  // Penalize sentences ending without punctuation
  const noPunct = sentences.filter(s => !/[.!?]$/.test(s.trim()));
  score -= Math.min(noPunct.length * 0.5, 2);

  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * Score vocabulary richness (0-10).
 * Based on unique words ratio, academic word usage, word length.
 */
export function scoreVocabulary(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return 0;

  // Type-token ratio (unique / total)
  const unique = new Set(words);
  const ttr = unique.size / words.length;

  // Academic word count
  const academicCount = words.filter(w => ACADEMIC_WORDS.includes(w)).length;
  const academicRatio = academicCount / words.length;

  // Average word length
  const avgLen = words.reduce((s, w) => s + w.length, 0) / words.length;

  let score = ttr * 4 + academicRatio * 30 + Math.min(avgLen / 2, 3);
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * Score sentence variety (0-10).
 * Combines: complex sentence starters, length variance, punctuation variety.
 */
export function scoreSentenceVariety(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return 0;

  // Complex sentence starter ratio
  const complexCount = sentences.filter(s => {
    const lower = s.trim().toLowerCase();
    return COMPLEX_STARTERS.some(cs => lower.startsWith(cs));
  }).length;
  const complexRatio = complexCount / sentences.length;

  // Sentence length variance
  const lengths = sentences.map(s => s.split(/\s+/).length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((s, l) => s + (l - avgLen) ** 2, 0) / lengths.length;
  const normalizedVariance = Math.min(variance / 100, 1);

  // Punctuation variety (comma, semicolon, colon, dash)
  const hasSemicolon = text.includes(';');
  const hasColon = text.includes(':');
  const hasDash = text.includes('—') || text.includes(' - ');
  const punctScore = (hasSemicolon ? 1 : 0) + (hasColon ? 1 : 0) + (hasDash ? 0.5 : 0);

  let score = complexRatio * 4 + normalizedVariance * 3 + punctScore;
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * Score coherence (0-10).
 * Based on transition word usage and logical flow indicators.
 */
export function scoreCoherence(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) return 3;

  const lower = text.toLowerCase();

  // Count transitions
  const transitionCount = TRANSITIONS.filter(t => lower.includes(t)).length;

  // Transition density
  const transitionDensity = transitionCount / sentences.length;

  // Has intro/conclusion signal
  const hasIntroSignal = /^(first|firstly|to begin|in today|nowadays|in recent)/im.test(text);
  const hasConclSignal = /(in conclusion|to sum up|to conclude|in summary|finally|overall)/im.test(lower);

  let score = transitionDensity * 15 + (hasIntroSignal ? 1.5 : 0) + (hasConclSignal ? 1.5 : 0) + 2;
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * Score cohesion (0-10).
 * Based on cohesive device usage (pronouns, determiners linking sentences).
 */
export function scoreCohesion(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  if (words.length === 0) return 0;

  const cohesiveCount = words.filter(w => {
    const clean = w.replace(/[^a-z]/g, '');
    return COHESIVE_DEVICES.includes(clean);
  }).length;

  const cohesionDensity = cohesiveCount / words.length;

  let score = cohesionDensity * 50 + 3;
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * Score organization (0-10).
 * Based on paragraph structure, clear intro/body/conclusion.
 */
export function scoreOrganization(text: string): number {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  let score = 3; // Base

  // Number of paragraphs
  if (paragraphs.length >= 3) score += 2;
  else if (paragraphs.length === 2) score += 1;

  // Average paragraph length (20-100 words is good)
  const wordCounts = paragraphs.map(p => p.split(/\s+/).length);
  const goodLengths = wordCounts.filter(w => w >= 20 && w <= 150);
  score += Math.min(goodLengths.length, 2);

  // First paragraph has intro characteristics
  const firstPara = paragraphs[0]?.toLowerCase() ?? '';
  if (/^(in|this|nowadays|today|recently|the issue|many people|it is|there)/i.test(firstPara)) {
    score += 1;
  }

  // Last paragraph has conclusion characteristics
  const lastPara = paragraphs[paragraphs.length - 1]?.toLowerCase() ?? '';
  if (/(in conclusion|to sum|to conclude|in summary|overall|finally|therefore|thus|hence)/i.test(lastPara)) {
    score += 1;
  }

  return Math.max(0, Math.min(10, score));
}

/**
 * Score task response (0-10).
 * Based on word count, addressing prompt, text type markers.
 */
export function scoreTaskResponse(text: string, metadata?: { wordLimit?: number; textType?: string }): number {
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

  let score = 5; // Base

  // Word count adequacy
  const target = metadata?.wordLimit ?? 300;
  const ratio = wordCount / target;
  if (ratio >= 0.9 && ratio <= 1.1) score += 3;
  else if (ratio >= 0.7) score += 1;

  // Text type markers
  const lower = text.toLowerCase();
  const textType = metadata?.textType?.toLowerCase() ?? '';
  if (textType.includes('letter') && /dear|yours|sincerely/i.test(text)) score += 1;
  if (textType.includes('speech') && /good (morning|afternoon|evening)|thank you/i.test(text)) score += 1;
  if (textType.includes('report') && /introduction|findings|recommendation/i.test(text)) score += 1;
  if (textType.includes('argument') && /however|on the other hand|in my opinion|i believe/i.test(text)) score += 1;

  return Math.max(0, Math.min(10, score));
}

/**
 * Score tone/register (0-10).
 * Based on formality markers, contractions, personal pronouns.
 */
export function scoreTone(text: string): number {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);

  let score = 6; // Start mid

  // Contractions (informal)
  const contractionCount = words.filter(w => /n't$|'s$|'ll$|'re$|'ve$|'d$/.test(w)).length;
  score -= Math.min(contractionCount * 0.3, 2);

  // Overuse of "I" (can be too informal for academic)
  const iCount = words.filter(w => w === 'i').length;
  const iRatio = iCount / words.length;
  if (iRatio > 0.08) score -= 2;
  else if (iRatio > 0.04) score -= 1;

  // Formal vocabulary indicators
  const formalCount = words.filter(w => ACADEMIC_WORDS.includes(w)).length;
  score += Math.min(formalCount * 0.3, 2);

  // No slang/exclamation
  if (text.includes('!')) score -= 1;
  const slangWords = ['awesome', 'cool', 'stuff', 'guys', 'gonna', 'wanna', 'kinda'];
  const slangCount = words.filter(w => slangWords.includes(w)).length;
  score -= Math.min(slangCount * 1, 2);

  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

// ============================================
// Band Prediction
// ============================================

const BAND_THRESHOLDS: Array<{ band: DSEBand; minScore: number }> = [
  { band: '5**', minScore: 90 },
  { band: '5*', minScore: 82 },
  { band: '5', minScore: 74 },
  { band: '4', minScore: 62 },
  { band: '3', minScore: 48 },
  { band: '2', minScore: 34 },
  { band: '1', minScore: 20 },
  { band: 'U', minScore: 0 },
];

const DIMENSION_WEIGHTS: Record<keyof WritingDimensions, number> = {
  grammar: 0.15,
  vocabulary: 0.15,
  sentenceVariety: 0.10,
  coherence: 0.12,
  cohesion: 0.10,
  organization: 0.12,
  taskResponse: 0.18,
  tone: 0.08,
};

/**
 * Predict DSE band from dimension scores.
 */
export function predictBand(dimensions: WritingDimensions): BandPrediction {
  let weightedTotal = 0;
  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS) as Array<[keyof WritingDimensions, number]>) {
    weightedTotal += dimensions[dim] * weight * 10; // Scale 0-10 to 0-100
  }

  const band = BAND_THRESHOLDS.find(t => weightedTotal >= t.minScore);
  const predictedBand = band?.band ?? 'U';

  let benchmarkComparison: string;
  if (weightedTotal >= 74) benchmarkComparison = '達到 Level 5 水平，達到大學入學要求';
  else if (weightedTotal >= 48) benchmarkComparison = '達到 Level 3 水平，符合 DSE 及格標準';
  else if (weightedTotal >= 34) benchmarkComparison = 'Level 2 水平，需要加強練習以達到及格標準';
  else benchmarkComparison = '低於及格標準，需要重點加強基本功';

  return {
    predictedBand,
    confidence: Math.min(weightedTotal / 100, 0.95),
    breakdown: dimensions,
    weightedTotal: Math.round(weightedTotal * 10) / 10,
    benchmarkComparison,
  };
}

// ============================================
// Revision Checklist Generator
// ============================================

/**
 * Generate prioritized revision checklist from dimension scores.
 */
export function generateRevisionChecklist(dimensions: WritingDimensions, text: string): RevisionChecklistItem[] {
  const items: RevisionChecklistItem[] = [];
  const dims: Array<{ dim: keyof WritingDimensions; score: number; labelZh: string }> = [
    { dim: 'grammar', score: dimensions.grammar, labelZh: '文法' },
    { dim: 'vocabulary', score: dimensions.vocabulary, labelZh: '詞彙' },
    { dim: 'sentenceVariety', score: dimensions.sentenceVariety, labelZh: '句式變化' },
    { dim: 'coherence', score: dimensions.coherence, labelZh: '連貫性' },
    { dim: 'cohesion', score: dimensions.cohesion, labelZh: '銜接性' },
    { dim: 'organization', score: dimensions.organization, labelZh: '結構組織' },
    { dim: 'taskResponse', score: dimensions.taskResponse, labelZh: '任務回應' },
    { dim: 'tone', score: dimensions.tone, labelZh: '語氣語域' },
  ];

  for (const { dim, score, labelZh } of dims) {
    if (score >= 7) continue; // Skip strong dimensions

    const priority = score < 4 ? 'high' : score < 6 ? 'medium' : 'low';

    items.push({
      dimension: dim,
      priority,
      task: `Improve ${dim}: current score ${score}/10`,
      taskZh: `加強${labelZh}：目前得分 ${score}/10`,
    });
  }

  return items.sort((a, b) => {
    const order = { high: 3, medium: 2, low: 1 };
    return order[b.priority] - order[a.priority];
  });
}

// ============================================
// Next Practice Generator
// ============================================

/**
 * Generate next practice suggestions based on weakest dimensions.
 */
export function generateNextPractice(dimensions: WritingDimensions): NextPracticeSuggestion[] {
  const suggestions: NextPracticeSuggestion[] = [];
  const entries = Object.entries(dimensions) as Array<[keyof WritingDimensions, number]>;
  const weakest = entries.sort(([, a], [, b]) => a - b).slice(0, 3);

  for (const [dim, score] of weakest) {
    suggestions.push({
      focusArea: dim,
      focusAreaZh: dimensionLabelZh(dim),
      reason: `目前得分 ${score}/10，為最弱項目`,
      exerciseType: dim === 'grammar' ? 'grammar-drill'
        : dim === 'vocabulary' ? 'vocab-practice'
        : dim === 'sentenceVariety' ? 'sentence-writing'
        : dim === 'organization' ? 'paragraph-writing'
        : 'essay-writing',
      estimatedSessions: score < 4 ? 5 : score < 6 ? 3 : 1,
    });
  }

  return suggestions;
}

// ============================================
// Weak Sentence Extractor
// ============================================

/**
 * Extract weak sentences from text.
 */
export function extractWeakSentences(text: string): WeakSentenceExample[] {
  const sentences = splitSentences(text);
  const weak: WeakSentenceExample[] = [];

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    const lower = sentence.toLowerCase();

    // Very short sentences (possible fragments)
    if (words.length < 4 && words.length > 0) {
      weak.push({
        sentence: sentence.trim(),
        issue: 'Sentence fragment — too short',
        issueZh: '句子碎片 — 過短',
        suggestion: 'Expand this into a complete sentence with subject and verb',
        suggestionZh: '擴展為完整句子，包含主語和動詞',
      });
      continue;
    }

    // Chinglish patterns
    if (/(although|because).*,.*(but|so)/i.test(sentence)) {
      weak.push({
        sentence: sentence.trim(),
        issue: 'Chinglish pattern: although...but or because...so',
        issueZh: '中式英文：although...but 或 because...so',
        suggestion: 'Remove "but" after "Although" or "so" after "Because"',
        suggestionZh: '去掉 Although 後的 but，或 Because 後的 so',
      });
    }

    // Very long sentences
    if (words.length > 50) {
      weak.push({
        sentence: sentence.trim(),
        issue: 'Run-on sentence — too long',
        issueZh: '超長句 — 建議拆分',
        suggestion: 'Break this into 2-3 shorter sentences for clarity',
        suggestionZh: '拆分為 2-3 個較短的句子以提高清晰度',
      });
    }
  }

  return weak;
}

// ============================================
// Personalized Suggestions
// ============================================

/**
 * Generate personalized improvement suggestions.
 */
export function generatePersonalizedSuggestions(dimensions: WritingDimensions): PersonalizedSuggestion[] {
  const suggestions: PersonalizedSuggestion[] = [];

  if (dimensions.grammar < 6) {
    suggestions.push({
      category: 'grammar',
      title: 'Grammar Foundation',
      titleZh: '文法基礎',
      detail: `Grammar score ${dimensions.grammar}/10. Focus on sentence structure and tense consistency.`,
      detailZh: `文法得分 ${dimensions.grammar}/10。專注於句子結構和時態一致性。`,
    });
  }

  if (dimensions.vocabulary < 6) {
    suggestions.push({
      category: 'vocabulary',
      title: 'Vocabulary Expansion',
      titleZh: '詞彙擴展',
      detail: `Vocabulary score ${dimensions.vocabulary}/10. Use more academic and precise words.`,
      detailZh: `詞彙得分 ${dimensions.vocabulary}/10。使用更多學術性和精確的詞彙。`,
    });
  }

  if (dimensions.coherence < 6) {
    suggestions.push({
      category: 'structure',
      title: 'Coherence Improvement',
      titleZh: '提升連貫性',
      detail: 'Add transition words (however, therefore, furthermore) between ideas.',
      detailZh: '在觀點之間加入過渡詞（however, therefore, furthermore）。',
    });
  }

  if (dimensions.organization < 6) {
    suggestions.push({
      category: 'structure',
      title: 'Essay Structure',
      titleZh: '文章結構',
      detail: 'Ensure clear introduction, body paragraphs, and conclusion.',
      detailZh: '確保有清晰的引言、主體段落和結論。',
    });
  }

  return suggestions;
}

// ============================================
// Helpers
// ============================================

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function dimensionLabelZh(dim: keyof WritingDimensions): string {
  const labels: Record<keyof WritingDimensions, string> = {
    grammar: '文法',
    vocabulary: '詞彙',
    sentenceVariety: '句式變化',
    coherence: '連貫性',
    cohesion: '銜接性',
    organization: '結構組織',
    taskResponse: '任務回應',
    tone: '語氣語域',
  };
  return labels[dim];
}
