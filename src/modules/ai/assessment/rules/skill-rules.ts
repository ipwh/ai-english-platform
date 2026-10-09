// ============================================
// Sprint 106: Assessment Rules — Batch 3
// Vocabulary Level, Grammar Quality, Writing Prompt Quality, Integrated Skills Quality
// ============================================

import type { AssessmentRule, AssessmentCheck } from '../assessment-types';

const norm = (s: unknown) => String(s || '').trim().toLowerCase();
function pass(id: string): AssessmentCheck { return { ruleId: id, passed: true, score: 1, priority: 'low', estimatedRepairCost: 0 }; }
function fail(id: string, msg: string, priority: AssessmentCheck['priority'] = 'high', cost = 50): AssessmentCheck {
  return { ruleId: id, passed: false, score: 0, message: msg, recommendation: msg, priority, estimatedRepairCost: cost };
}

// ═══ 10. Vocabulary Level ═══
const GRADE_VOCAB = {
  S1: { maxC1: 0, maxAvgWordLen: 5 },
  S2: { maxC1: 0, maxAvgWordLen: 5.5 },
  S3: { maxC1: 1, maxAvgWordLen: 6 },
  S4: { maxC1: 2, maxAvgWordLen: 6.5 },
  S5: { maxC1: 4, maxAvgWordLen: 7 },
  S6: { maxC1: 6, maxAvgWordLen: 7.5 },
};
const C1_WORDS = new Set(['ubiquitous', 'paradigm', 'dichotomy', 'ephemeral', 'pragmatic', 'synthesis', 'juxtaposition', 'unequivocal', 'quintessential', 'exacerbate', 'ameliorate', 'disseminate', 'extrapolate', 'perpetuate', 'scrutinize', 'cognizant', 'concomitant', 'ostensibly', 'disproportionate', 'multifaceted', 'unprecedented', 'indispensable', 'sophisticated', 'substantiate', 'corroborate', 'elucidate', 'articulate']);

export const vocabularyLevelRule: AssessmentRule = {
  id: 'assessment:vocabulary-level', name: 'Vocabulary Level', description: 'Vocabulary matches grade level', priority: 'medium',
  assess(q, ctx) {
    const grade = ctx?.targetLevel || 'S4';
    const text = [q.questionText, q.question, q.prompt, q.readingContent, q.listeningContent, ...(q.choices as string[] || [])].filter(Boolean).join(' ');
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const limits = GRADE_VOCAB[grade as keyof typeof GRADE_VOCAB] || GRADE_VOCAB.S4;
    const c1Count = words.filter(w => C1_WORDS.has(w)).length;
    if (c1Count > limits.maxC1) return fail(this.id, `${c1Count} C1-level words (max ${limits.maxC1} for ${grade})`, 'medium', 30);
    const avgLen = words.reduce((s, w) => s + w.length, 0) / Math.max(1, words.length);
    if (avgLen > limits.maxAvgWordLen) return fail(this.id, `Average word length ${avgLen.toFixed(1)} exceeds ${grade} limit`, 'low', 10);
    return pass(this.id);
  },
};

// ═══ 11. Grammar Quality ═══
const GRAMMAR_ISSUES: Array<[RegExp, string]> = [
  [/he\s+don't/i, "Subject-verb: 'he don't' → should be 'he doesn't'"],
  [/they\s+is\b/i, "Subject-verb: 'they is' → should be 'they are'"],
  [/more\s+\w+er\b/i, "Double comparative: 'more ...er'"],
  [/\ba\s+[aeiou]/i, "Article: 'a' before vowel sound"],
  [/\ban\s+[^aeiou]/i, "Article: 'an' before consonant sound"],
];

export const grammarQualityRule: AssessmentRule = {
  id: 'assessment:grammar-quality', name: 'Grammar Quality', description: 'Checks for common grammar issues', priority: 'medium',
  assess(q, _ctx) {
    const text = [q.questionText, q.question, q.prompt, ...(q.choices as string[] || [])].filter(Boolean).join(' ').toLowerCase();
    for (const [pattern, msg] of GRAMMAR_ISSUES) {
      if (pattern.test(text)) return fail(this.id, msg, 'medium', 40);
    }
    // Check tense consistency in options
    if (Array.isArray(q.choices) && q.choices.length >= 2) {
      const hasPast = q.choices.some((c: string) => /\b(was|were|had|did|went|took|made|came|saw|said|got)\b/.test(String(c || '')));
      const hasPresent = q.choices.some((c: string) => /\b(is|are|has|have|does|go|take|make|come|see|say|get)\b/.test(String(c || '')));
      if (hasPast && hasPresent) return fail(this.id, 'Options mix past and present tense', 'low', 10);
    }
    return pass(this.id);
  },
};

// ═══ 12. Writing Prompt Quality ═══
export const writingPromptQualityRule: AssessmentRule = {
  id: 'assessment:writing-prompt-quality', name: 'Writing Prompt Quality', description: 'Validates writing prompts are complete', priority: 'high',
  assess(q, _ctx) {
    const prompt = norm(q.prompt || q.question || q.questionText || '');
    if (!prompt) return pass(this.id); // not a writing prompt
    if (prompt.length < 30) return fail(this.id, 'Writing prompt is too short (<30 chars)', 'high', 60);
    // Check for essential elements
    const hasAudience = /\b(you are|write a|you have been|as a|in your|to your|for your)\b/i.test(prompt);
    const hasTask = /\b(write|describe|discuss|argue|explain|propose|suggest|compare|analyze)\b/i.test(prompt);
    const hasLength = /\b(words|word limit|about \d+ words)\b/i.test(prompt);
    if (!hasAudience) return fail(this.id, 'Prompt does not clearly define audience/role', 'medium', 30);
    if (!hasTask) return fail(this.id, 'Prompt does not specify a clear writing task', 'high', 50);
    if (!hasLength) return fail(this.id, 'Prompt does not specify word limit', 'low', 10);
    return pass(this.id);
  },
};

// ═══ 13. Integrated Skills Quality ═══
export const integratedSkillsQualityRule: AssessmentRule = {
  id: 'assessment:integrated-skills-quality', name: 'Integrated Skills Quality', description: 'Validates integrated skills tasks', priority: 'high',
  assess(q, ctx) {
    const hasListening = !!(ctx?.transcriptContent || q.listeningContent);
    const hasReading = !!(ctx?.passageContent || q.readingContent);
    const hasWriting = !!q.writingTask || !!q.writingPrompt;
    if (!hasListening && !hasReading) return pass(this.id); // not integrated skills
    if (!hasWriting) return fail(this.id, 'Integrated task missing writing component', 'high', 70);
    // Cross-reference consistency
    if (hasListening && hasReading) {
      const tWords = new Set(norm(ctx?.transcriptContent || q.listeningContent || '').split(/\s+/));
      const pWords = new Set(norm(ctx?.passageContent || q.readingContent || '').split(/\s+/));
      const shared = [...tWords].filter(w => pWords.has(w) && w.length > 4).length;
      if (shared === 0) return fail(this.id, 'Transcript and passage have no shared key terms — possible inconsistency', 'medium', 40);
    }
    return pass(this.id);
  },
};
