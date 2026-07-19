// Sprint 27: AI Writing Coach — all services
// RubricScorer, EssayReviewer, RevisionPlanner, VocabularyUpgrader, GrammarExplainer

import type {
  EssaySubmission, EssayReview, RubricScores, HKDSEScores, CEFRScores,
  GrammarIssue, VocabularySuggestion, CoherenceAnalysis,
  TaskFulfillment, OrganizationAnalysis, StyleAnalysis,
  RevisionPlan, PriorityAction, RevisionComparison, RevisionHistory, EssayVersion,
} from '../types';
import type { CEFRLevel } from '@/modules/knowledge-graph/types';
import {
  DSE_LEVEL_DESCRIPTORS, DSE_TEXT_TYPES, HKDSE_CEFR_ALIGNMENT,
} from '@/modules/curriculum/data/hkdse-enhanced';

// ============================================
// RubricScorer
// ============================================

const CHINGLISH_PATTERNS = [
  { pattern: /although.*but/i, fix: 'Remove "but" — "although" already implies contrast', fixZh: '刪除 but，Although 已包含轉折' },
  { pattern: /because.*so/i, fix: 'Remove "so" — "because" already implies cause', fixZh: '刪除 so，Because 已包含因果' },
  { pattern: /there have/i, fix: 'Use "there is/are" instead of "there have"', fixZh: '使用 There is/are 而非 There have' },
  { pattern: /according to me/i, fix: 'Use "in my opinion" instead of "according to me"', fixZh: '使用 In my opinion 而非 According to me' },
  { pattern: /very (delicious|beautiful|excellent|perfect|unique)/gi, fix: 'Remove "very" — this adjective is already absolute', fixZh: '刪除 very，此形容詞已是絕對級' },
  { pattern: /return back/i, fix: 'Remove "back" — "return" already means going back', fixZh: '刪除 back，Return 已包含回來的意思' },
  { pattern: /discuss about/i, fix: 'Remove "about" — "discuss" takes a direct object', fixZh: '刪除 about，Discuss 後直接跟受詞' },
  { pattern: /emphasize on/i, fix: 'Remove "on" — "emphasize" takes a direct object', fixZh: '刪除 on，Emphasize 後直接跟受詞' },
];

const GRAMMAR_RULES = [
  { type: 'subject-verb-agreement', rule: 'Subject and verb must agree in number', ruleZh: '主語和動詞必須在數量上一致' },
  { type: 'article-missing', rule: 'Article (a/an/the) required before singular countable nouns', ruleZh: '單數可數名詞前需要冠詞' },
  { type: 'tense-consistency', rule: 'Maintain consistent tense throughout the paragraph', ruleZh: '整段需保持時態一致' },
  { type: 'run-on-sentence', rule: 'Break long sentences into smaller ones using periods or conjunctions', ruleZh: '用句號或連接詞將長句分開' },
  { type: 'preposition-error', rule: 'Check preposition usage after verbs and adjectives', ruleZh: '檢查動詞和形容詞後的介詞用法' },
  { type: 'word-order', rule: 'English follows Subject-Verb-Object order', ruleZh: '英文遵循主語-動詞-受詞語序' },
];

// ============================================
// RubricScorer
// ============================================

export function scoreRubric(essay: EssaySubmission): RubricScores {
  const content = essay.content;
  const wordCount = essay.wordCount;
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = content.split(/\s+/).filter(w => w.length > 0);
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));

  // HKDSE CLO Scoring (Content / Language / Organization, each 0-7, total 0-21)
  const contentScore = scoreContent(content, wordCount, essay.textType);
  const languageScore = scoreLanguage(content, sentences, words);
  const organizationScore = scoreOrganization(paragraphs, content);
  const hkdseTotal = contentScore + languageScore + organizationScore;

  let estimatedLevel: string;
  if (hkdseTotal >= 19) estimatedLevel = '5**';
  else if (hkdseTotal >= 17) estimatedLevel = '5*';
  else if (hkdseTotal >= 15) estimatedLevel = '5';
  else if (hkdseTotal >= 12) estimatedLevel = '4';
  else if (hkdseTotal >= 9) estimatedLevel = '3';
  else if (hkdseTotal >= 6) estimatedLevel = '2';
  else estimatedLevel = '1';

  const hkdse: HKDSEScores = {
    content: { score: contentScore, maxScore: 7, comments: contentScore >= 5 ? 'Good development of ideas' : 'Ideas need more development', commentsZh: contentScore >= 5 ? '觀點發展良好' : '觀點需要更多發展' },
    language: { score: languageScore, maxScore: 7, comments: languageScore >= 5 ? 'Good grammatical control' : 'Grammar needs improvement', commentsZh: languageScore >= 5 ? '文法控制良好' : '文法需要改善' },
    organization: { score: organizationScore, maxScore: 7, comments: organizationScore >= 5 ? 'Well-organized with clear structure' : 'Organization needs work', commentsZh: organizationScore >= 5 ? '結構清晰有條理' : '結構需要改善' },
    total: hkdseTotal, maxTotal: 21, estimatedLevel,
  };

  // CEFR estimation
  const cefrLevel = estimateCEFR(hkdseTotal, uniqueWords.size, sentences.length);

  return {
    hkdse,
    cefr: { overall: cefrLevel, subScores: { writing: cefrLevel } },
    overallBand: estimatedLevel,
  };
}

function scoreContent(text: string, wordCount: number, textType: string): number {
  let score = 4;
  if (wordCount >= 400) score++;
  if (wordCount >= 250) score += 0.5;
  if (text.split(/\n\n+/).length >= 4) score += 0.5;
  if (/for example|for instance|such as/i.test(text)) score += 0.5;
  if (/in conclusion|to sum up|in summary/i.test(text)) score += 0.5;
  return Math.min(7, Math.round(score));
}

function scoreLanguage(text: string, sentences: string[], words: string[]): number {
  let score = 3;
  const avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;
  if (avgWordsPerSentence > 10 && avgWordsPerSentence < 30) score++;
  const uniqueRatio = new Set(words.map(w => w.toLowerCase())).size / Math.max(words.length, 1);
  if (uniqueRatio > 0.5) score += 0.5;
  if (/furthermore|moreover|however|therefore|consequently/i.test(text)) score += 0.5;
  if (/although|despite|whereas|while|nevertheless/i.test(text)) score += 0.5;
  // Penalize chinglish
  let chinglishCount = 0;
  for (const cp of CHINGLISH_PATTERNS) {
    if (cp.pattern.test(text)) chinglishCount++;
  }
  score -= chinglishCount * 0.3;
  return Math.max(1, Math.min(7, Math.round(score)));
}

function scoreOrganization(paragraphs: string[], text: string): number {
  let score = 3;
  if (paragraphs.length >= 4) score++;
  if (paragraphs.length >= 5) score++;
  const firstPara = paragraphs[0]?.toLowerCase() || '';
  if (firstPara.includes('introduction') || /^(in|this|nowadays|in recent|the issue)/i.test(firstPara)) score += 0.5;
  const lastPara = paragraphs[paragraphs.length - 1]?.toLowerCase() || '';
  if (/in conclusion|to sum up|in summary|therefore|thus/i.test(lastPara)) score += 0.5;
  // Check for topic sentences
  let topicSentenceCount = 0;
  for (const p of paragraphs) {
    if (p.trim().split('.')[0].length > 20) topicSentenceCount++;
  }
  if (topicSentenceCount >= paragraphs.length * 0.7) score += 0.5;
  return Math.min(7, Math.round(score));
}

function estimateCEFR(totalScore: number, uniqueWords: number, sentenceCount: number): CEFRLevel {
  if (totalScore >= 18 && uniqueWords > 200 && sentenceCount > 20) return 'C1';
  if (totalScore >= 15 && uniqueWords > 150 && sentenceCount > 15) return 'B2';
  if (totalScore >= 10 && uniqueWords > 100 && sentenceCount > 10) return 'B1';
  if (totalScore >= 6 && uniqueWords > 60) return 'A2';
  return 'A1';
}

// ============================================
// EssayReviewer
// ============================================

export function reviewEssay(essay: EssaySubmission): EssayReview {
  const rubricScores = scoreRubric(essay);
  const grammarIssues = detectGrammarIssues(essay.content);
  const vocabularySuggestions = suggestVocabularyUpgrades(essay.content);
  const coherenceAnalysis = analyzeCoherence(essay.content);
  const taskFulfillment = assessTaskFulfillment(essay);
  const organization = analyzeOrganization(essay.content);
  const styleAnalysis = analyzeStyle(essay.content);
  const revisionPlan = createRevisionPlan(essay, rubricScores, grammarIssues, vocabularySuggestions);

  return {
    essayId: essay.essayId, reviewedAt: new Date().toISOString(),
    rubricScores, grammarIssues, vocabularySuggestions,
    coherenceAnalysis, taskFulfillment, organization, styleAnalysis,
    overallFeedback: `Overall: ${rubricScores.hkdse.estimatedLevel} (${rubricScores.hkdse.total}/21). ${grammarIssues.length} grammar issues found. ${vocabularySuggestions.length} vocabulary suggestions.`,
    overallFeedbackZh: `整體：${rubricScores.hkdse.estimatedLevel}（${rubricScores.hkdse.total}/21 分）。發現 ${grammarIssues.length} 個文法問題，${vocabularySuggestions.length} 個詞彙建議。`,
    revisionPlan, totalScore: rubricScores.hkdse.total, estimatedLevel: rubricScores.hkdse.estimatedLevel,
  };
}

// ============================================
// GrammarExplainer
// ============================================

function detectGrammarIssues(content: string): GrammarIssue[] {
  const issues: GrammarIssue[] = [];
  let id = 0;

  for (const cp of CHINGLISH_PATTERNS) {
    const match = content.match(cp.pattern);
    if (match) {
      issues.push({
        type: 'chinglish', description: cp.fix, descriptionZh: cp.fixZh,
        location: { start: match.index || 0, end: (match.index || 0) + match[0].length },
        original: match[0], correction: cp.fix.split(' — ')[0] || match[0],
        rule: 'Avoid direct Chinese-to-English translation patterns', ruleZh: '避免中式英文直譯',
        severity: 'major',
      });
    }
  }

  // Detect run-on sentences (>40 words without punctuation)
  const sentences = content.split(/[.!?]+/);
  for (const s of sentences) {
    if (s.trim().split(/\s+/).length > 40) {
      issues.push({
        type: 'run-on-sentence', description: 'Sentence too long — consider breaking it up', descriptionZh: '句子過長，建議拆分',
        location: { start: content.indexOf(s), end: content.indexOf(s) + s.length },
        original: s.slice(0, 50) + '...', correction: '[Break into shorter sentences]',
        rule: GRAMMAR_RULES.find(r => r.type === 'run-on-sentence')!.rule,
        ruleZh: GRAMMAR_RULES.find(r => r.type === 'run-on-sentence')!.ruleZh,
        severity: 'minor',
      });
    }
  }

  return issues;
}

export function getGrammarRules() {
  return GRAMMAR_RULES;
}

// ============================================
// VocabularyUpgrader
// ============================================

const VOCAB_UPGRADES: Array<{ pattern: RegExp; suggestion: string; type: VocabularySuggestion['type'] }> = [
  { pattern: /\bgood\b/gi, suggestion: 'beneficial / advantageous / excellent', type: 'variety' },
  { pattern: /\bbad\b/gi, suggestion: 'detrimental / harmful / adverse', type: 'variety' },
  { pattern: /\bbig\b/gi, suggestion: 'substantial / considerable / significant', type: 'precision' },
  { pattern: /\bsmall\b/gi, suggestion: 'minor / negligible / modest', type: 'precision' },
  { pattern: /\bimportant\b/gi, suggestion: 'crucial / essential / vital / paramount', type: 'variety' },
  { pattern: /\b(say|said)\b/gi, suggestion: 'state / assert / claim / argue', type: 'formality' },
  { pattern: /\b(get|got)\b/gi, suggestion: 'obtain / acquire / receive', type: 'formality' },
  { pattern: /\ba lot of\b/gi, suggestion: 'a significant amount of / numerous / considerable', type: 'precision' },
  { pattern: /\bthings\b/gi, suggestion: 'aspects / factors / elements / considerations', type: 'precision' },
  { pattern: /\bvery\s+(\w+)/gi, suggestion: 'extremely / highly / remarkably (or use stronger adjective)', type: 'variety' },
];

function suggestVocabularyUpgrades(content: string): VocabularySuggestion[] {
  const suggestions: VocabularySuggestion[] = [];
  for (const vu of VOCAB_UPGRADES) {
    const match = content.match(vu.pattern);
    if (match) {
      suggestions.push({
        original: match[0], suggestion: vu.suggestion,
        reason: `"${match[0]}" can be upgraded for more precise/varied expression`, reasonZh: `「${match[0]}」可升級為更精準/多變的表達`,
        type: vu.type, impact: vu.type === 'formality' ? 'high' : 'medium',
      });
    }
  }
  return suggestions.slice(0, 8);
}

export function getVocabUpgrades() {
  return VOCAB_UPGRADES;
}

// ============================================
// Coherence, Task Fulfillment, Organization, Style
// ============================================

function analyzeCoherence(content: string): CoherenceAnalysis {
  const transitions = content.match(/\b(furthermore|moreover|however|therefore|consequently|in addition|on the other hand|nevertheless|meanwhile|similarly)\b/gi) || [];
  return {
    score: Math.min(10, transitions.length * 2 + 3),
    strengths: transitions.length >= 3 ? ['Good use of transition words'] : [],
    weaknesses: transitions.length < 3 ? ['Add more transition words for better flow'] : [],
    transitionUsage: { count: transitions.length, variety: new Set(transitions.map(t => t.toLowerCase())).size, appropriateness: 7 },
    paragraphFlow: transitions.length >= 5 ? 'Smooth' : transitions.length >= 3 ? 'Adequate' : 'Needs improvement',
  };
}

function assessTaskFulfillment(essay: EssaySubmission): TaskFulfillment {
  const wordCountOk = essay.wordCount >= 150;
  const textTypeMatch = DSE_TEXT_TYPES.some(t => t.type.toLowerCase().includes(essay.textType.toLowerCase()));
  return {
    score: (wordCountOk ? 5 : 2) + (textTypeMatch ? 3 : 1),
    addressedAllParts: wordCountOk,
    wordCountAdequate: wordCountOk,
    textTypeAppropriate: textTypeMatch,
    toneAppropriate: true,
    comments: wordCountOk ? 'Adequate length' : 'Essay may be too short',
    commentsZh: wordCountOk ? '篇幅適中' : '文章可能過短',
  };
}

function analyzeOrganization(content: string): OrganizationAnalysis {
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
  const avgLen = paragraphs.length > 0 ? paragraphs.reduce((s, p) => s + p.split(/\s+/).length, 0) / paragraphs.length : 0;
  return {
    score: Math.min(10, paragraphs.length * 2 + (avgLen > 50 ? 2 : 0)),
    hasClearIntroduction: paragraphs.length > 0 && paragraphs[0].split(/\s+/).length > 20,
    hasClearConclusion: paragraphs.length > 0 && paragraphs[paragraphs.length - 1].split(/\s+/).length > 20,
    paragraphCount: paragraphs.length, averageParagraphLength: Math.round(avgLen),
    logicalFlow: paragraphs.length >= 4 ? 'Well-structured' : 'Needs more paragraphs',
    suggestions: paragraphs.length < 4 ? ['Consider adding more paragraphs for better structure'] : [],
    suggestionsZh: paragraphs.length < 4 ? ['建議增加段落以改善結構'] : [],
  };
}

function analyzeStyle(content: string): StyleAnalysis {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = content.split(/\s+/).filter(w => w.length > 0);
  const simple = sentences.filter(s => s.split(/\s+/).length < 15).length;
  const compound = sentences.filter(s => /,?\s+(and|but|or|so)\s+/i.test(s)).length;
  const complex = sentences.filter(s => /\b(although|because|while|whereas|if|when|which|who|that)\b/i.test(s)).length;
  const uniqueRatio = new Set(words.map(w => w.toLowerCase())).size / Math.max(words.length, 1);

  return {
    score: Math.min(10, Math.round(uniqueRatio * 10 + (complex > 2 ? 2 : 0))),
    register: /nevertheless|furthermore|consequently/i.test(content) ? 'Formal' : 'Semi-formal',
    tone: /I\s+(think|believe|feel)/i.test(content) ? 'Personal' : 'Balanced',
    sentenceVariety: { simple: simple || 1, compound: compound || 1, complex: complex || 1 },
    vocabularyRichness: Math.round(uniqueRatio * 10) / 10,
    suggestions: uniqueRatio < 0.4 ? ['Use more varied vocabulary'] : [],
    suggestionsZh: uniqueRatio < 0.4 ? ['使用更多樣化的詞彙'] : [],
  };
}

// ============================================
// RevisionPlanner
// ============================================

function createRevisionPlan(
  essay: EssaySubmission, rubric: RubricScores, grammar: GrammarIssue[], vocab: VocabularySuggestion[],
): RevisionPlan {
  const actions: PriorityAction[] = [];
  let order = 1;

  if (rubric.hkdse.language.score < 5) {
    actions.push({ order: order++, category: 'grammar', action: 'Review and fix grammar errors', actionZh: '檢查並修正文法錯誤', expectedImprovement: '+1-2 language score', effort: 'medium' });
  }
  if (vocab.length > 3) {
    actions.push({ order: order++, category: 'vocabulary', action: 'Upgrade vocabulary for precision and variety', actionZh: '升級詞彙以提高精準度及多樣性', expectedImprovement: '+0.5-1 content score', effort: 'medium' });
  }
  if (rubric.hkdse.organization.score < 5) {
    actions.push({ order: order++, category: 'organization', action: 'Improve paragraph structure and flow', actionZh: '改善段落結構及流暢度', expectedImprovement: '+1 organization score', effort: 'low' });
  }
  if (rubric.hkdse.content.score < 5) {
    actions.push({ order: order++, category: 'content', action: 'Add more examples and develop arguments', actionZh: '增加例子並發展論點', expectedImprovement: '+1-2 content score', effort: 'high' });
  }

  return {
    essayId: essay.essayId,
    priorityActions: actions,
    estimatedTimeMinutes: actions.length * 15,
    focusAreas: actions.map(a => a.category),
    focusAreasZh: actions.map(a => a.actionZh),
    nextSteps: actions.map(a => a.action),
    nextStepsZh: actions.map(a => a.actionZh),
  };
}

// ============================================
// Revision Comparison
// ============================================

export function compareRevisions(original: EssaySubmission, revised: EssaySubmission): RevisionComparison {
  const origReview = reviewEssay(original);
  const revReview = reviewEssay(revised);

  const origWords = original.content.split(/\s+/);
  const revWords = revised.content.split(/\s+/);
  const improvements: RevisionComparison['improvements'] = [];

  if (revReview.grammarIssues.length < origReview.grammarIssues.length) {
    improvements.push({ category: 'Grammar', before: `${origReview.grammarIssues.length} issues`, after: `${revReview.grammarIssues.length} issues`, impact: `Reduced by ${origReview.grammarIssues.length - revReview.grammarIssues.length}` });
  }
  if (revReview.totalScore > origReview.totalScore) {
    improvements.push({ category: 'Overall Score', before: `${origReview.totalScore}/21`, after: `${revReview.totalScore}/21`, impact: `+${revReview.totalScore - origReview.totalScore}` });
  }

  return {
    originalId: original.essayId, revisedId: revised.essayId,
    improvements,
    scoreChange: { before: origReview.totalScore, after: revReview.totalScore, difference: revReview.totalScore - origReview.totalScore },
    wordCountChange: { before: original.wordCount, after: revised.wordCount },
  };
}

// ============================================
// Revision History Store
// ============================================

const revisionStore = new Map<string, RevisionHistory>();

export function saveRevision(essayId: string, version: EssayVersion): void {
  if (!revisionStore.has(essayId)) {
    revisionStore.set(essayId, { essayId, versions: [] });
  }
  revisionStore.get(essayId)!.versions.push(version);
}

export function getRevisionHistory(essayId: string): RevisionHistory | undefined {
  return revisionStore.get(essayId);
}

export function getLatestVersion(essayId: string): EssayVersion | undefined {
  const history = revisionStore.get(essayId);
  return history?.versions[history.versions.length - 1];
}
