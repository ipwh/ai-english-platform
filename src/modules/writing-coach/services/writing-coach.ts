// Sprint 27: AI Writing Coach — all services
// RubricScorer, EssayReviewer, RevisionPlanner, VocabularyUpgrader, GrammarExplainer

import type {
  EssaySubmission, EssayReview, RubricScores, HKDSEScores,
  GrammarIssue, VocabularySuggestion, CoherenceAnalysis,
  TaskFulfillment, OrganizationAnalysis, StyleAnalysis,
  RevisionPlan, PriorityAction, RevisionComparison, RevisionHistory, EssayVersion,
} from '../types';
import type { CEFRLevel } from '@/modules/knowledge-graph/types';
import { DSE_TEXT_TYPES } from '@/modules/curriculum/data/hkdse-enhanced';

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

function scoreContent(text: string, wordCount: number, _textType: string): number {
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

function scoreOrganization(paragraphs: string[], _text: string): number {
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

// ============================================
// Sprint 47: Rule-based Format Validation
// 程式化格式檢查，補足 AI 評分盲點
// ============================================

import type {
  FormatValidationResult, FormatCheck, FormatIssue,
  LetterFormatValidation, SpeechFormatValidation,
  ProposalFormatValidation, ArticleFormatValidation,
  ReportFormatValidation, PEELValidationResult, ConnectorAnalysis,
} from '../types';

const CONNECTOR_LIBRARY = {
  addition: ['furthermore', 'moreover', 'in addition', 'additionally', 'what is more', 'also', 'besides', 'not only'],
  contrast: ['however', 'nevertheless', 'nonetheless', 'on the contrary', 'in contrast', 'conversely', 'while', 'whereas', 'although', 'despite', 'yet'],
  cause: ['therefore', 'consequently', 'thus', 'hence', 'as a result', 'for this reason', 'owing to', 'due to'],
  example: ['for instance', 'for example', 'to illustrate', 'a case in point is', 'such as', 'take'],
  conclusion: ['in conclusion', 'to sum up', 'in summary', 'ultimately', 'overall', 'to conclude', 'all in all'],
  concession: ['admittedly', 'granted', 'it is true that', 'while it may be', 'even though', 'of course'],
};

/**
 * Validates letter format (formal and informal)
 */
export function validateLetterFormat(content: string, isFormal: boolean): LetterFormatValidation {
  const checks: FormatCheck[] = [];
  const issues: FormatIssue[] = [];

  // Sender address check (formal only)
  const hasSenderAddress = isFormal ? /^\s*\d+[,\s]+\w+/m.test(content.split('\n')[0] || '') : true;
  checks.push({ element: 'Sender Address', elementZh: '寄件人地址', description: 'Address at top of letter', passed: hasSenderAddress, found: hasSenderAddress });
  if (!hasSenderAddress && isFormal) {
    issues.push({ element: 'Sender Address', elementZh: '寄件人地址', severity: 'major', problem: 'Missing sender address at top of formal letter', problemZh: '正式書信頂部缺少寄件人地址', fix: 'Add your address at the top-right of the letter', fixZh: '在書信右上角加上你的地址' });
  }

  // Date check
  const hasDate = /\b(\d{1,2}(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec),?\s+\d{4}|\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/i.test(content);
  checks.push({ element: 'Date', elementZh: '日期', description: 'Date in the letter', passed: hasDate, found: hasDate });

  // Salutation
  const salutationMatch = content.match(/dear\s+(mr\.?|ms\.?|mrs\.?|miss|dr\.?|prof\.?|sir\/madam|sir|madam|editor|principal)\s+\w*/i);
  const hasSalutation = /dear\s+/i.test(content);
  let salutationType: LetterFormatValidation['salutationType'] = 'unknown';
  if (salutationMatch) {
    const sal = salutationMatch[0].toLowerCase();
    if (sal.includes('sir') || sal.includes('madam') || sal.includes('editor') || sal.includes('principal')) {
      salutationType = 'unnamed';
    } else {
      salutationType = 'named';
    }
  }
  checks.push({ element: 'Salutation', elementZh: '稱呼', description: 'Dear [Name/Title],', passed: hasSalutation, found: hasSalutation, details: salutationMatch?.[0] });

  // Closing
  const hasYoursSincerely = /yours\s+sincerely/i.test(content);
  const hasYoursFaithfully = /yours\s+faithfully/i.test(content);
  const hasClosing = hasYoursSincerely || hasYoursFaithfully || /(best\s+wishes|best\s+regards|love|take\s+care|cheers|warm\s+regards)/i.test(content);
  let closingType: LetterFormatValidation['closingType'] = 'missing';
  if (hasYoursSincerely) closingType = 'sincerely';
  else if (hasYoursFaithfully) closingType = 'faithfully';
  else if (hasClosing) closingType = 'other';

  // Salutation-closing match
  let salutationClosingMatch = true;
  if (isFormal) {
    if (salutationType === 'named' && closingType === 'faithfully') {
      salutationClosingMatch = false;
      issues.push({ element: 'Salutation-Closing Match', elementZh: '稱呼結尾配對', severity: 'critical', problem: `Dear [Name] should end with "Yours sincerely", not "Yours faithfully"`, problemZh: '知道對方名字應使用 Yours sincerely，而非 Yours faithfully', fix: 'Change to "Yours sincerely,"', fixZh: '改為 Yours sincerely,' });
    }
    if (salutationType === 'unnamed' && closingType === 'sincerely') {
      salutationClosingMatch = false;
      issues.push({ element: 'Salutation-Closing Match', elementZh: '稱呼結尾配對', severity: 'critical', problem: `Dear Sir/Madam should end with "Yours faithfully", not "Yours sincerely"`, problemZh: '不知道對方名字應使用 Yours faithfully，而非 Yours sincerely', fix: 'Change to "Yours faithfully,"', fixZh: '改為 Yours faithfully,' });
    }
  }
  checks.push({ element: 'Closing', elementZh: '結尾敬語', description: 'Yours sincerely / Yours faithfully / Best wishes', passed: hasClosing, found: hasClosing, details: closingType });

  // Contractions check (formal letters)
  const contractionMatches = content.match(/\b(don't|can't|won't|i'm|you're|we're|they're|it's|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|shouldn't|couldn't|wouldn't)\b/gi);
  const usesContractions = (contractionMatches?.length || 0) > 0;
  const contractionCount = contractionMatches?.length || 0;
  checks.push({ element: 'No Contractions', elementZh: '無縮寫', description: 'Formal letters should not use contractions', passed: !usesContractions, found: !usesContractions });
  if (usesContractions && isFormal) {
    issues.push({ element: 'Contractions', elementZh: '縮寫', severity: 'major', problem: `Found ${contractionCount} contraction(s): ${contractionMatches?.join(', ')}`, problemZh: `發現 ${contractionCount} 個縮寫：${contractionMatches?.join(', ')}`, fix: 'Expand all contractions: don\'t→do not, can\'t→cannot, I\'m→I am', fixZh: '展開所有縮寫：don\'t→do not, can\'t→cannot, I\'m→I am' });
  }

  const totalChecks = checks.length;
  const passedChecks = checks.filter(c => c.passed).length;
  const score = Math.round((passedChecks / totalChecks) * 100);

  return {
    textType: isFormal ? 'letter-formal' : 'letter-informal',
    textTypeZh: isFormal ? '正式書信' : '非正式書信',
    overallValid: issues.filter(i => i.severity === 'critical').length === 0,
    score, checks, issues,
    summary: `${passedChecks}/${totalChecks} format elements correct`,
    summaryZh: `${passedChecks}/${totalChecks} 項格式元素正確`,
    hasSenderAddress,
    hasDate,
    hasRecipientAddress: false,
    hasSalutation,
    salutationType,
    closingType,
    salutationClosingMatch,
    usesContractions,
    contractionCount,
  };
}

/**
 * Validates speech format
 */
export function validateSpeechFormat(content: string): SpeechFormatValidation {
  const lower = content.toLowerCase();
  const checks: FormatCheck[] = [];
  const issues: FormatIssue[] = [];

  // Greeting
  const hasGreeting = /(good\s+(morning|afternoon|evening)|hello|hi|welcome)\s+/i.test(content) || /(fellow\s+(students|classmates|teachers)|ladies\s+and\s+gentlemen|everyone|everybody|all)/i.test(content);
  checks.push({ element: 'Greeting', elementZh: '開場問候', description: 'Good morning/afternoon, fellow students/teachers/everyone', passed: hasGreeting, found: hasGreeting });
  if (!hasGreeting) {
    issues.push({ element: 'Greeting', elementZh: '開場問候', severity: 'critical', problem: 'Speech is missing an opening greeting', problemZh: '演講辭缺少開場問候', fix: 'Start with "Good morning, fellow students and teachers" or similar', fixZh: '以「早安，各位同學和老師」或類似問候開場' });
  }

  // Audience engagement
  const rhetoricalQuestions = (content.match(/\?\s*$/gm) || []).length;
  const hasAudienceAddress = /(as\s+you\s+(all\s+)?know|you\s+may\s+(have|be)|raise\s+your\s+hand|we\s+all|ladies\s+and\s+gentlemen)/i.test(lower);
  checks.push({ element: 'Audience Engagement', elementZh: '聽眾互動', description: 'Rhetorical questions, "you", "we", "fellow..."', passed: rhetoricalQuestions >= 1 || hasAudienceAddress, found: rhetoricalQuestions >= 1 || hasAudienceAddress });

  // Call to action
  const hasCallToAction = /(let\s+us|we\s+must|it\s+is\s+time|I\s+urge|I\s+encourage|together|act\s+now|make\s+a\s+difference|join\s+(us|me))/i.test(lower);
  checks.push({ element: 'Call to Action', elementZh: '行動呼籲', description: '"Let us...", "We must...", "The time to act is now!"', passed: hasCallToAction, found: hasCallToAction });

  // Thank you
  const hasThankYou = /(thank\s+you|thanks\s+for\s+(your\s+)?(attention|listening|time))/i.test(lower);
  checks.push({ element: 'Thank You', elementZh: '致謝', description: '"Thank you for your attention" or similar', passed: hasThankYou, found: hasThankYou });
  if (!hasThankYou) {
    issues.push({ element: 'Thank You', elementZh: '致謝', severity: 'major', problem: 'Speech is missing a closing thank-you', problemZh: '演講辭缺少結尾致謝', fix: 'End with "Thank you for your attention" or similar', fixZh: '以「謝謝各位」或類似致謝結尾' });
  }

  const passedChecks = checks.filter(c => c.passed).length;
  const score = Math.round((passedChecks / checks.length) * 100);

  return {
    textType: 'speech', textTypeZh: '演講辭',
    overallValid: issues.filter(i => i.severity === 'critical').length === 0,
    score, checks, issues,
    summary: `${passedChecks}/${checks.length} format elements correct`,
    summaryZh: `${passedChecks}/${checks.length} 項格式元素正確`,
    hasGreeting,
    greetingIncludesAudience: hasAudienceAddress,
    greetingOrderCorrect: true,
    hasSelfIntroduction: /(i\s+am|my\s+name\s+is|i'm)/i.test(lower),
    hasCallToAction,
    hasThankYou,
    audienceEngagementCount: rhetoricalQuestions,
  };
}

/**
 * Validates proposal format
 */
export function validateProposalFormat(content: string): ProposalFormatValidation {
  const lower = content.toLowerCase();
  const checks: FormatCheck[] = [];
  const issues: FormatIssue[] = [];

  const hasTitle = /(proposal|plan|initiative|project|program(me)?)\s*(for|to|:)/i.test(content) || /^(a|the)\s+\w+\s+(proposal|plan|project)/im.test(content);
  checks.push({ element: 'Title', elementZh: '標題', description: '"A Proposal for..." or similar', passed: hasTitle, found: hasTitle });

  const subHeadings = content.match(/^[A-Z][A-Za-z\s]{2,40}$/gm) || [];
  const hasSubHeadings = subHeadings.length >= 2;
  checks.push({ element: 'Sub-headings', elementZh: '副標題', description: 'Clear sub-headings for each section', passed: hasSubHeadings, found: hasSubHeadings, details: `${subHeadings.length} sub-headings found` });

  const hasObjectives = /(objective|aim|goal|target)/i.test(lower);
  checks.push({ element: 'Objectives', elementZh: '目標', description: 'Clear objectives section', passed: hasObjectives, found: hasObjectives });

  const hasTimeline = /(timeline|schedule|week|month|day|date|duration|period|from.*to)/i.test(lower);
  checks.push({ element: 'Timeline', elementZh: '時間表', description: 'Timeline or schedule mentioned', passed: hasTimeline, found: hasTimeline });

  const hasBudget = /(budget|cost|expense|fund|hkd|hk\$|\$\d|estimated.*cost)/i.test(lower);
  checks.push({ element: 'Budget', elementZh: '預算', description: 'Budget or cost estimate', passed: hasBudget, found: hasBudget });

  const hasOutcomes = /(expected\s+outcome|benefit|result|impact|will\s+(lead|result|improve|increase|reduce|help))/i.test(lower);
  checks.push({ element: 'Expected Outcomes', elementZh: '預期成果', description: 'Expected outcomes/benefits', passed: hasOutcomes, found: hasOutcomes });

  const hasConclusion = /(conclusion|in\s+summary|to\s+sum\s+up|i\s+believe\s+this|i\s+look\s+forward)/i.test(lower);
  checks.push({ element: 'Conclusion', elementZh: '結論', description: 'Conclusion with call for approval', passed: hasConclusion, found: hasConclusion });

  const passedChecks = checks.filter(c => c.passed).length;
  const score = Math.round((passedChecks / checks.length) * 100);

  return {
    textType: 'proposal', textTypeZh: '計劃書',
    overallValid: passedChecks >= 5,
    score, checks, issues,
    summary: `${passedChecks}/${checks.length} format elements correct`,
    summaryZh: `${passedChecks}/${checks.length} 項格式元素正確`,
    hasTitle, hasSubHeadings, subHeadingCount: subHeadings.length,
    hasObjectives, hasTimeline, hasBudget, hasExpectedOutcomes: hasOutcomes, hasConclusion,
  };
}

/**
 * Validates article format
 */
export function validateArticleFormat(content: string): ArticleFormatValidation {
  const checks: FormatCheck[] = [];
  const issues: FormatIssue[] = [];
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);

  // Headline
  const firstLine = lines[0]?.trim() || '';
  const hasHeadline = firstLine.length > 0 && firstLine.length < 150 && !/^dear\s/i.test(firstLine);
  const headlineIsCatchy = /[?!]$/.test(firstLine) || /:.+/.test(firstLine) || /^(is|are|can|do|does|what|why|how|should|will|the)\b/i.test(firstLine);
  checks.push({ element: 'Headline', elementZh: '標題', description: 'Catchy article headline', passed: hasHeadline, found: hasHeadline, details: hasHeadline ? firstLine.slice(0, 60) : undefined });
  if (!hasHeadline) {
    issues.push({ element: 'Headline', elementZh: '標題', severity: 'critical', problem: 'Article is missing a headline/title', problemZh: '文章缺少標題', fix: 'Add a catchy headline, e.g. "Is Social Media Destroying Our Society?"', fixZh: '加上吸引的標題，例如「社交媒體正在摧毀我們的社會嗎？」' });
  }

  // Lead paragraph
  const hasLead = paragraphs.length >= 2 && paragraphs[0].split(/\s+/).length < 80;
  checks.push({ element: 'Lead Paragraph', elementZh: '導言段落', description: 'Short engaging lead paragraph', passed: hasLead, found: hasLead });

  // Paragraph length
  const avgParagraphLen = paragraphs.reduce((s, p) => s + p.split(/\s+/).length, 0) / Math.max(paragraphs.length, 1);
  const paragraphLengthGood = avgParagraphLen < 120;
  checks.push({ element: 'Paragraph Length', elementZh: '段落長度', description: 'Paragraphs should not be too long', passed: paragraphLengthGood, found: paragraphLengthGood, details: `Avg: ${Math.round(avgParagraphLen)} words/paragraph` });

  const passedChecks = checks.filter(c => c.passed).length;
  const score = Math.round((passedChecks / checks.length) * 100);

  return {
    textType: 'article', textTypeZh: '文章',
    overallValid: hasHeadline,
    score, checks, issues,
    summary: `${passedChecks}/${checks.length} format elements correct`,
    summaryZh: `${passedChecks}/${checks.length} 項格式元素正確`,
    hasHeadline, headlineIsCatchy, hasByline: false, hasLeadParagraph: hasLead,
    averageParagraphLength: Math.round(avgParagraphLen), paragraphLengthGood,
  };
}

/**
 * Validates report format
 */
export function validateReportFormat(content: string): ReportFormatValidation {
  const lower = content.toLowerCase();
  const checks: FormatCheck[] = [];
  const issues: FormatIssue[] = [];

  const hasTitle = /(report|survey|study|investigation|analysis)\s*(on|of|into|:)/i.test(content);
  checks.push({ element: 'Title', elementZh: '標題', description: '"Report on..." or similar', passed: hasTitle, found: hasTitle });

  const subHeadings = content.match(/^[A-Z][A-Za-z\s]{2,40}$/gm) || [];
  const hasSubHeadings = subHeadings.length >= 2;
  checks.push({ element: 'Sub-headings', elementZh: '副標題', description: 'Report sub-headings (Findings, Recommendations, etc.)', passed: hasSubHeadings, found: hasSubHeadings });

  const hasIntro = /(introduction|background|purpose|aim|this\s+report)/i.test(lower);
  checks.push({ element: 'Introduction', elementZh: '引言', description: 'Introduction/background section', passed: hasIntro, found: hasIntro });

  const hasFindings = /(finding|result|data|survey|respondent|observation)/i.test(lower);
  checks.push({ element: 'Findings', elementZh: '調查結果', description: 'Findings/results section', passed: hasFindings, found: hasFindings });

  const hasRecommendations = /(recommend|suggest|propose|should|could|it\s+is\s+(recommended|suggested|advised))/i.test(lower);
  checks.push({ element: 'Recommendations', elementZh: '建議', description: 'Recommendations section', passed: hasRecommendations, found: hasRecommendations });

  const firstPersonMatches = content.match(/\b(i\s+|we\s+|my\s+|our\s+)/gi) || [];
  const firstPersonCount = firstPersonMatches.length;
  const usesObjectiveTone = firstPersonCount <= 3;
  checks.push({ element: 'Objective Tone', elementZh: '客觀語氣', description: 'Minimal use of first person (I, we)', passed: usesObjectiveTone, found: usesObjectiveTone, details: `${firstPersonCount} first-person references` });
  if (!usesObjectiveTone) {
    issues.push({ element: 'Objective Tone', elementZh: '客觀語氣', severity: 'major', problem: `Found ${firstPersonCount} first-person references. Reports should be objective.`, problemZh: `發現 ${firstPersonCount} 處第一人稱。報告應保持客觀。`, fix: 'Use passive voice: "It was found that..." instead of "I found that..."', fixZh: '使用被動語態：以 "It was found that..." 取代 "I found that..."' });
  }

  const passedChecks = checks.filter(c => c.passed).length;
  const score = Math.round((passedChecks / checks.length) * 100);

  return {
    textType: 'report', textTypeZh: '報告',
    overallValid: passedChecks >= 4,
    score, checks, issues,
    summary: `${passedChecks}/${checks.length} format elements correct`,
    summaryZh: `${passedChecks}/${checks.length} 項格式元素正確`,
    hasTitle, hasSubHeadings, hasIntroduction: hasIntro,
    hasFindings, hasRecommendations, usesObjectiveTone, firstPersonCount,
  };
}

/**
 * Main format validation dispatcher
 */
export function validateFormat(content: string, textType: string): FormatValidationResult | LetterFormatValidation | SpeechFormatValidation | ProposalFormatValidation | ArticleFormatValidation | ReportFormatValidation {
  switch (textType) {
    case 'letter-formal':
      return validateLetterFormat(content, true);
    case 'letter-informal':
      return validateLetterFormat(content, false);
    case 'speech':
      return validateSpeechFormat(content);
    case 'proposal':
      return validateProposalFormat(content);
    case 'article':
      return validateArticleFormat(content);
    case 'report':
      return validateReportFormat(content);
    default:
      // Generic validation for other text types
      const checks: FormatCheck[] = [];
      const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
      const hasParagraphs = paragraphs.length >= 2;
      checks.push({ element: 'Paragraphs', elementZh: '段落', description: 'Has multiple paragraphs', passed: hasParagraphs, found: hasParagraphs });
      const passedChecks = checks.filter(c => c.passed).length;
      return {
        textType, textTypeZh: textType,
        overallValid: hasParagraphs,
        score: hasParagraphs ? 100 : 50,
        checks, issues: [],
        summary: `${passedChecks}/${checks.length} elements correct`,
        summaryZh: `${passedChecks}/${checks.length} 項元素正確`,
      };
  }
}

/**
 * Analyzes PEEL structure in each paragraph
 */
export function analyzePEEL(content: string): PEELValidationResult[] {
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
  return paragraphs.map((para, idx) => {
    const sentences = para.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const lower = para.toLowerCase();
    const firstSentence = sentences[0]?.toLowerCase() || '';

    const hasPoint = firstSentence.length > 15;
    const hasExplain = sentences.length >= 2;
    const hasExample = /(for\s+(example|instance)|such\s+as|to\s+illustrate|e\.g\.|according\s+to|\d+%|survey|study|research|statistics|data)/i.test(lower);
    const hasLink = /(this\s+(shows|demonstrates|indicates|suggests|means|proves|highlights|illustrates)|therefore|thus|as\s+a\s+result|consequently|in\s+this\s+way|clearly,?|evidently)/i.test(lower);
    const peelScore = [hasPoint, hasExplain, hasExample, hasLink].filter(Boolean).length;

    let analysisZh = '';
    if (peelScore === 4) analysisZh = '完美的 PEEL 結構！';
    else if (peelScore >= 3) analysisZh = 'PEEL 結構良好，';
    else analysisZh = 'PEEL 結構不完整，';
    if (!hasPoint && idx > 0) analysisZh += '缺少清晰的主題句。';
    if (!hasExample && idx > 0) analysisZh += '缺少具體例子。';
    if (!hasLink && idx > 0) analysisZh += '缺少回連主題的連結句。';

    return {
      paragraphIndex: idx,
      hasPoint, hasExplain, hasExample, hasLink,
      peelScore,
      analysis: `PEEL Score: ${peelScore}/4`,
      analysisZh: analysisZh || '段落結構待改善',
    };
  });
}

/**
 * Analyzes connector diversity in the essay
 */
export function analyzeConnectors(content: string): ConnectorAnalysis {
  const lower = content.toLowerCase();
  const categories: ConnectorAnalysis['categories'] = {
    addition: [], contrast: [], cause: [], example: [], conclusion: [], concession: [],
  };

  for (const [cat, connectors] of Object.entries(CONNECTOR_LIBRARY)) {
    for (const conn of connectors) {
      const regex = new RegExp(`\\b${conn.replace(/\s+/g, '\\s+')}\\b`, 'gi');
      if (regex.test(lower)) {
        categories[cat as keyof typeof categories].push(conn);
      }
    }
  }

  const totalConnectors = Object.values(categories).reduce((s, arr) => s + arr.length, 0);
  const allUsed = Object.values(categories).flat();
  const uniqueConnectors = new Set(allUsed).size;
  const diversityScore = Math.min(100, Math.round((uniqueConnectors / Math.max(allUsed.length, 1)) * 100));

  // Detect overused connectors
  const overusedConnectors: string[] = [];
  for (const conn of allUsed) {
    const count = (lower.match(new RegExp(`\\b${conn.replace(/\s+/g, '\\s+')}\\b`, 'gi')) || []).length;
    if (count >= 4) overusedConnectors.push(`${conn} (×${count})`);
  }

  const suggestions: string[] = [];
  const suggestionsZh: string[] = [];
  if (categories.contrast.length === 0) {
    suggestions.push('Add contrast connectors: However, Nevertheless, On the contrary');
    suggestionsZh.push('加入對比連接詞：However, Nevertheless, On the contrary');
  }
  if (categories.cause.length === 0) {
    suggestions.push('Add cause-effect connectors: Therefore, Consequently, As a result');
    suggestionsZh.push('加入因果連接詞：Therefore, Consequently, As a result');
  }
  if (diversityScore < 50) {
    suggestions.push(`Connector diversity is low (${uniqueConnectors} unique types). Vary your connectors.`);
    suggestionsZh.push(`連接詞多樣性偏低（僅 ${uniqueConnectors} 種），建議變化使用。`);
  }

  return {
    totalConnectors, uniqueConnectors, diversityScore,
    categories, overusedConnectors, suggestions, suggestionsZh,
  };
}

// ============================================
// Sprint 47: Show, Don't Tell 訓練 + 時間管理
// ============================================

/** Show Don't Tell 範例對照庫 */
export const SHOW_DONT_TELL_EXAMPLES: Array<{
  emotion: string;
  emotionZh: string;
  tell: string;
  show: string;
  showZh: string;
}> = [
  {
    emotion: 'nervous', emotionZh: '緊張',
    tell: 'He was very nervous.',
    show: 'His palms were sweaty, his heart raced, and he couldn\'t stop tapping his foot.',
    showZh: '他的手掌出汗，心跳加速，不停地跺腳。',
  },
  {
    emotion: 'angry', emotionZh: '憤怒',
    tell: 'She was angry.',
    show: 'Her jaw tightened and her voice dropped to a dangerous whisper.',
    showZh: '她的下巴緊繃，聲音降到危險的低語。',
  },
  {
    emotion: 'happy', emotionZh: '開心',
    tell: 'They were very happy.',
    show: 'Their faces lit up with wide grins, and they couldn\'t stop laughing — the kind of laughter that makes your stomach hurt.',
    showZh: '他們的臉上綻放出燦爛的笑容，笑得停不下來——那種笑到肚子痛的笑。',
  },
  {
    emotion: 'tired', emotionZh: '疲倦',
    tell: 'I was extremely tired.',
    show: 'My eyelids felt like they weighed a ton. Every step was a battle, and my thoughts moved through a fog.',
    showZh: '我的眼皮重如千斤。每一步都是一場戰鬥，思緒像是在迷霧中移動。',
  },
  {
    emotion: 'scared', emotionZh: '害怕',
    tell: 'He was scared of the dark.',
    show: 'His breath caught in his throat. Every creak of the floorboards sent a chill down his spine, and he pulled the blanket up to his chin.',
    showZh: '他的呼吸卡在喉嚨。地板每一下吱吱作響都讓他脊背發涼，他把毯子拉到下巴。',
  },
  {
    emotion: 'excited', emotionZh: '興奮',
    tell: 'She was excited about the trip.',
    show: 'She had packed and unpacked her suitcase three times already. Her eyes sparkled every time someone mentioned the destination, and she kept counting down the days on her calendar.',
    showZh: '她已經把行李箱打包又拆開三次。每次有人提到目的地，她的眼睛就閃閃發光，她不停地在日曆上倒數日子。',
  },
  {
    emotion: 'disappointed', emotionZh: '失望',
    tell: 'He was disappointed with the result.',
    show: 'His shoulders slumped. He stared at the paper for a long moment, then quietly folded it and put it in his pocket without saying a word.',
    showZh: '他的肩膀垂了下來。他盯著那張紙看了很久，然後靜靜地把它摺好放進口袋，一言不發。',
  },
  {
    emotion: 'proud', emotionZh: '自豪',
    tell: 'She felt proud of her achievement.',
    show: 'A small smile tugged at the corner of her lips. She stood a little taller, and when she called her mother, her voice cracked — not from sadness, but from the sheer weight of the moment.',
    showZh: '一抹微笑在她嘴角揚起。她站得更直了些，當她打電話給媽媽時，聲音哽咽了——不是因為悲傷，而是因為這一刻的份量。',
  },
];

/**
 * 檢測學生文章中是否有 "tell" 式的句子，並建議 "show" 改寫
 */
export function suggestShowDontTell(content: string): Array<{
  original: string;
  issue: string;
  issueZh: string;
  suggestion: string;
  suggestionZh: string;
  technique: string;
  techniqueZh: string;
}> {
  const suggestions: Array<{
    original: string;
    issue: string;
    issueZh: string;
    suggestion: string;
    suggestionZh: string;
    technique: string;
    techniqueZh: string;
  }> = [];

  // Pattern 1: "was/were very [emotion]"
  const veryEmotionPattern = /\b(was|were|felt|feel|feeling)\s+(very|really|so|extremely)\s+(\w+(ed|ing|y))\b/gi;
  let match: RegExpExecArray | null;
  while ((match = veryEmotionPattern.exec(content)) !== null) {
    const fullMatch = match[0];
    const emotion = match[3].toLowerCase().replace(/(ed|ing)$/, '');
    const example = SHOW_DONT_TELL_EXAMPLES.find(e => e.emotion === emotion);
    suggestions.push({
      original: fullMatch,
      issue: `Telling instead of showing: "${fullMatch}"`,
      issueZh: `直接陳述情感而非描寫：「${fullMatch}」`,
      suggestion: example ? example.show : 'Describe physical sensations, actions, and sensory details instead of naming the emotion directly.',
      suggestionZh: example ? example.showZh : '用身體感受、動作和感官細節來代替直接說出情感。',
      technique: 'Show, Don\'t Tell',
      techniqueZh: 'Show, Don\'t Tell（展示，而非陳述）',
    });
  }

  // Pattern 2: "[subject] was [adjective]" (simple telling)
  const wasAdjPattern = /\b(he|she|it|they|i)\s+(was|were|felt)\s+(\w+)\b/gi;
  let match2: RegExpExecArray | null;
  while ((match2 = wasAdjPattern.exec(content)) !== null) {
    const m = match2; // capture to avoid null narrowing in closures
    const adj = m[3].toLowerCase();
    if (['good', 'bad', 'sad', 'happy', 'angry', 'tired', 'scared', 'nervous', 'excited', 'bored'].includes(adj)) {
      if (!suggestions.some(s => s.original === m[0])) {
        const example = SHOW_DONT_TELL_EXAMPLES.find(e => e.emotion === adj);
        suggestions.push({
          original: m[0],
          issue: `Telling instead of showing: "${m[0]}"`,
          issueZh: `直接陳述狀態而非描寫：「${m[0]}」`,
          suggestion: example ? example.show : 'Show this through actions, body language, and sensory details.',
          suggestionZh: example ? example.showZh : '通過動作、肢體語言和感官細節來展示。',
          technique: 'Show, Don\'t Tell',
          techniqueZh: 'Show, Don\'t Tell（展示，而非陳述）',
        });
      }
    }
  }

  return suggestions;
}

// ============================================
// 時間管理常數與建議
// ============================================

export const DSE_TIME_MANAGEMENT = {
  partA: {
    label: 'Part A — Guided Writing',
    labelZh: 'Part A — 短實用文',
    wordTarget: 200,
    brainstorm: { minutes: 5, description: 'Analyze the prompt. Circle keywords. Identify audience, purpose, and required content points.', descriptionZh: '審題：圈出關鍵詞，確定受眾、目的和內容要點。' },
    writing: { minutes: 30, description: 'Write your response. Keep to ~200 words. Check format requirements.', descriptionZh: '寫作：約 200 字。注意格式要求。' },
    proofread: { minutes: 5, description: 'Check: grammar, spelling, format (salutation, closing, headings). Did you answer ALL requirements?', descriptionZh: '校對：檢查文法、拼寫、格式（稱呼、結尾、標題）。是否回應了所有要求？' },
    total: 40,
  },
  partB: {
    label: 'Part B — Extended Writing',
    labelZh: 'Part B — 長作文',
    wordTarget: 400,
    brainstorm: { minutes: 5, description: 'Choose the BEST question for you. Plan your arguments. Outline PEEL structure.', descriptionZh: '選題：選最有把握的題目。構思論點，規劃 PEEL 結構。' },
    writing: { minutes: 70, description: 'Write ~400 words. Follow your outline. Use varied sentence structures and vocabulary.', descriptionZh: '寫作：約 400 字。按大綱寫作，使用多變句式和詞彙。' },
    proofread: { minutes: 5, description: 'Final check: grammar, spelling, word count, paragraph breaks. Is the conclusion memorable?', descriptionZh: '最後校對：文法、拼寫、字數、分段。結論是否令人印象深刻？' },
    total: 80,
  },
  overall: {
    totalMinutes: 120,
    totalMinutesZh: '120 分鐘（2 小時）',
  },
} as const;

export interface TimePlan {
  phase: string;
  phaseZh: string;
  minutes: number;
  description: string;
  descriptionZh: string;
}

/**
 * 生成個人化時間分配計劃
 */
export function generateTimePlan(isPartA: boolean): TimePlan[] {
  const config = isPartA ? DSE_TIME_MANAGEMENT.partA : DSE_TIME_MANAGEMENT.partB;
  return [
    {
      phase: '1. Brainstorm & Plan', phaseZh: '1. 構思與規劃',
      minutes: config.brainstorm.minutes,
      description: config.brainstorm.description,
      descriptionZh: config.brainstorm.descriptionZh,
    },
    {
      phase: '2. Writing', phaseZh: '2. 寫作',
      minutes: config.writing.minutes,
      description: config.writing.description,
      descriptionZh: config.writing.descriptionZh,
    },
    {
      phase: '3. Proofread & Review', phaseZh: '3. 校對與檢查',
      minutes: config.proofread.minutes,
      description: config.proofread.description,
      descriptionZh: config.proofread.descriptionZh,
    },
  ];
}

/**
 * 檢查學生是否在合理時間內完成寫作（基於字數估算）
 */
export function estimateWritingTime(wordCount: number, isPartA: boolean): {
  estimatedMinutes: number;
  isOnTrack: boolean;
  suggestion: string;
  suggestionZh: string;
} {
  const targetMinutes = isPartA ? 30 : 70;
  const wordsPerMinute = 13; // DSE average writing speed

  const estimatedMinutes = Math.round(wordCount / wordsPerMinute);
  const isOnTrack = estimatedMinutes <= targetMinutes;

  return {
    estimatedMinutes,
    isOnTrack,
    suggestion: isOnTrack
      ? `Good pace! You have time to proofread.`
      : `You may need ${estimatedMinutes - targetMinutes} more minutes. Consider writing more concisely or speeding up.`,
    suggestionZh: isOnTrack
      ? `節奏良好！你有時間校對。`
      : `你可能需要額外 ${estimatedMinutes - targetMinutes} 分鐘。考慮寫得更精簡或加快速度。`,
  };
}
