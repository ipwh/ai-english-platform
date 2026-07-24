// ============================================
// Sprint 113: Question Quality Rules (14 rules)
// Deterministic question quality validation.
// ============================================

import type { QuestionQualityRule, QualityCheck, QualityContext } from '../question-quality-types';

const ok = (id: string, qIdx = -1): QualityCheck =>
  ({ ruleId: id, passed: true, score: 1, questionIndex: qIdx, priority: 'low' });
const fail = (id: string, detail: string, p: QualityCheck['priority'] = 'medium', qIdx = -1): QualityCheck =>
  ({ ruleId: id, passed: false, score: 0, detail, questionIndex: qIdx, priority: p });
const warn = (id: string, detail: string, qIdx = -1): QualityCheck =>
  ({ ruleId: id, passed: false, score: 0.3, detail, questionIndex: qIdx, priority: 'low' });

function pt(s: unknown): string { return String(s ?? '').trim().toLowerCase(); }

// ═══ 1. DistractorPlausibilityRule ═══
const FORBIDDEN_DISTRACTORS = ['all of the above', 'none of the above', 'all the above', 'none the above',
  'a and b', 'a & b', 'both a and b', 'a, b and c', 'all choices', 'not applicable'];

export const distractorPlausibilityRule: QuestionQualityRule = {
  id: 'qq:distractor-plausibility', name: 'Distractor Plausibility', description: 'Rejects implausible distractors', priority: 'critical',
  check(questions, ctx) {
    return questions.map((q, i) => {
      if (!Array.isArray(q.choices)) return ok(this.id, i);
      const choices = q.choices as string[];
      const answer = pt(q.answer);

      for (let j = 0; j < choices.length; j++) {
        const c = pt(choices[j]);
        // Forbidden patterns
        for (const forbidden of FORBIDDEN_DISTRACTORS) {
          if (c === forbidden || c.includes(forbidden)) {
            return fail(this.id, `Choice ${String.fromCharCode(65 + j)} contains forbidden pattern: "${forbidden}"`, 'critical', i);
          }
        }
        // Too short
        if (c.length < 2 && choices.length > 2) {
          return fail(this.id, `Choice ${String.fromCharCode(65 + j)} is too short (${c.length} chars)`, 'high', i);
        }
        // Too long relative to others
        const avgLen = choices.reduce((s, ch) => s + pt(ch).length, 0) / choices.length;
        if (c.length > avgLen * 4 && c.length > 100) {
          return warn(this.id, `Choice ${String.fromCharCode(65 + j)} is ${Math.round(c.length / avgLen)}x longer than average`, i);
        }
      }
      return ok(this.id, i);
    });
  },
};

// ═══ 2. CorrectAnswerUniquenessRule ═══
export const correctAnswerUniquenessRule: QuestionQualityRule = {
  id: 'qq:answer-uniqueness', name: 'Correct Answer Uniqueness', description: 'Ensures exactly one correct answer', priority: 'critical',
  check(questions, ctx) {
    return questions.map((q, i) => {
      const answer = pt(q.answer);
      if (!answer) return fail(this.id, 'Missing correct answer', 'critical', i);

      if (Array.isArray(q.choices)) {
        const choices = (q.choices as string[]).map(c => pt(c));
        // Count how many choices match the answer
        const matches = choices.filter(c => c === answer || answer.startsWith(c) || c.startsWith(answer));
        if (matches.length > 1) {
          return fail(this.id, `Answer "${answer}" matches ${matches.length} choices (must be exactly 1)`, 'critical', i);
        }
        if (matches.length === 0) {
          return fail(this.id, `Answer "${answer}" does not match any choice`, 'critical', i);
        }
      }
      return ok(this.id, i);
    });
  },
};

// ═══ 3. OptionSimilarityRule ═══
export const optionSimilarityRule: QuestionQualityRule = {
  id: 'qq:option-similarity', name: 'Option Similarity', description: 'Rejects nearly identical options', priority: 'high',
  check(questions, ctx) {
    return questions.map((q, i) => {
      if (!Array.isArray(q.choices) || q.choices.length < 2) return ok(this.id, i);
      const choices = (q.choices as string[]).map(c => pt(c));

      for (let j = 0; j < choices.length; j++) {
        for (let k = j + 1; k < choices.length; k++) {
          const a = choices[j], b = choices[k];
          // Exact duplicate
          if (a === b) return fail(this.id, `Choices ${String.fromCharCode(65 + j)} and ${String.fromCharCode(65 + k)} are identical`, 'high', i);
          // Shared prefix > 70% of shorter
          const prefixLen = sharedPrefixLength(a, b);
          const minLen = Math.min(a.length, b.length);
          if (minLen > 5 && prefixLen / minLen > 0.7) {
            return warn(this.id, `Choices ${String.fromCharCode(65 + j)}/${String.fromCharCode(65 + k)} share ${Math.round(prefixLen / minLen * 100)}% prefix`, i);
          }
          // Jaccard similarity > 80%
          const jaccard = wordJaccard(a, b);
          if (jaccard > 0.85) {
            return fail(this.id, `Choices ${String.fromCharCode(65 + j)} and ${String.fromCharCode(65 + k)} are ${Math.round(jaccard * 100)}% similar`, 'high', i);
          }
        }
      }
      return ok(this.id, i);
    });
  },
};

function sharedPrefixLength(a: string, b: string): number {
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i;
}

function wordJaccard(a: string, b: string): number {
  const sa = new Set(a.split(/\s+/)), sb = new Set(b.split(/\s+/));
  const intersection = new Set([...sa].filter(w => sb.has(w)));
  const union = new Set([...sa, ...sb]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

// ═══ 4. DifficultyBalanceRule ═══
const TOO_EASY_WORDS = ['obvious', 'clearly', 'definitely', 'without doubt', 'certainly'];
const TOO_HARD_PATTERNS = [/\b(obfuscate|esoteric|abstruse|recondite|arcane)\b/i];

export const difficultyBalanceRule: QuestionQualityRule = {
  id: 'qq:difficulty-balance', name: 'Difficulty Balance', description: 'Rejects too-easy or too-hard questions', priority: 'high',
  check(questions, ctx) {
    return questions.map((q, i) => {
      const prompt = pt(q.prompt || q.question || q.questionText || '');
      const explanation = pt(q.explanationEn || '') + ' ' + pt(q.explanationZh || '');

      // Too easy: contains giveaway words
      for (const word of TOO_EASY_WORDS) {
        if (prompt.includes(word) || explanation.includes(word)) {
          return warn(this.id, `Question contains giveaway word: "${word}"`, i);
        }
      }

      // Too hard: obscure vocabulary
      for (const pattern of TOO_HARD_PATTERNS) {
        if (pattern.test(prompt)) {
          return warn(this.id, 'Question contains excessively obscure vocabulary', i);
        }
      }

      // Trivial answer detection: literally in the prompt
      if (Array.isArray(q.choices)) {
        const answer = pt(q.answer);
        for (const c of q.choices as string[]) {
          if (pt(c) === answer && prompt.includes(pt(c))) {
            return warn(this.id, `Answer "${answer}" appears verbatim in the question prompt`, i);
          }
        }
      }

      return ok(this.id, i);
    });
  },
};

// ═══ 5. QuestionClarityRule ═══
const DOUBLE_NEGATIVES = /\b(not\s+\w+ly\s+not|never\s+not|no\s+not|don't\s+not|doesn't\s+not|isn't\s+not|aren't\s+not|wasn't\s+not|weren't\s+not|haven't\s+no|hasn't\s+no)\b/i;
const AMBIGUOUS_PRONOUNS = /\b(it|this|that|these|those|they|them)\b.*\b(it|this|that|these|those|they|them)\b/i;
const MULTIPLE_QUESTIONS = /[?？].*[?？]/;

export const questionClarityRule: QuestionQualityRule = {
  id: 'qq:question-clarity', name: 'Question Clarity', description: 'Detects double negatives, ambiguity, multiple questions', priority: 'high',
  check(questions, ctx) {
    return questions.map((q, i) => {
      const prompt = pt(q.prompt || q.question || q.questionText || '');

      if (DOUBLE_NEGATIVES.test(prompt)) {
        return fail(this.id, 'Contains double negative', 'high', i);
      }
      if (MULTIPLE_QUESTIONS.test(prompt)) {
        return warn(this.id, 'Contains multiple question marks (compound question)', i);
      }

      // Missing question word
      if (prompt.length > 10 && !/[?？]/.test(prompt) && !/\b(what|which|who|whom|whose|when|where|why|how|is|are|does|do|did|can|could|will|would|shall|should|may|might|must)\b/i.test(prompt)) {
        return warn(this.id, 'Question stem lacks a clear question word', i);
      }

      return ok(this.id, i);
    });
  },
};

// ═══ 6. StemCompletenessRule ═══
export const stemCompletenessRule: QuestionQualityRule = {
  id: 'qq:stem-completeness', name: 'Stem Completeness', description: 'Question stem must be complete', priority: 'high',
  check(questions, ctx) {
    return questions.map((q, i) => {
      const prompt = (q.prompt || q.question || q.questionText || '').toString().trim();

      if (!prompt) return fail(this.id, 'Question stem is empty', 'critical', i);
      if (prompt.length < 10) return fail(this.id, `Question stem too short (${prompt.length} chars)`, 'high', i);
      if (/\.\.\.\s*$/.test(prompt) || /…\s*$/.test(prompt)) {
        return warn(this.id, 'Question stem ends with ellipsis (may be incomplete)', i);
      }
      if (/^(it|this|that|these|those|they|he|she)\b/i.test(prompt) && prompt.length < 30) {
        return warn(this.id, 'Question stem starts with pronoun, may lack context', i);
      }

      return ok(this.id, i);
    });
  },
};

// ═══ 7. ReadingEvidenceRule ═══
export const readingEvidenceRule: QuestionQualityRule = {
  id: 'qq:reading-evidence', name: 'Reading Evidence', description: 'Reading questions must reference passage', priority: 'high',
  check(questions, ctx) {
    const hasPassage = !!(ctx?.passageContent);
    return questions.map((q, i) => {
      if (!hasPassage) return ok(this.id, i);
      if (!q.answer) return ok(this.id, i);

      const explanation = pt(q.explanationEn || '') + ' ' + pt(q.explanationZh || '');
      const answer = pt(q.answer);

      // Check if answer or its evidence appears in passage
      const passage = pt(ctx.passageContent || '');
      if (answer.length > 2 && !passage.includes(answer)) {
        const answerWords = answer.split(/\s+/);
        const foundWords = answerWords.filter(w => passage.includes(w));
        if (foundWords.length < answerWords.length * 0.5) {
          return fail(this.id, `Answer "${answer}" not sufficiently supported by passage`, 'high', i);
        }
      }

      // Check for paragraph/sentence reference
      const hasRef = /\b(paragraph|line|sentence|passage|文中|段落|第\s*\d+|line\s*\d+)\b/i.test(explanation);
      if (!hasRef) {
        return warn(this.id, 'Reading question explanation lacks passage reference', i);
      }

      return ok(this.id, i);
    });
  },
};

// ═══ 8. ListeningEvidenceRule ═══
export const listeningEvidenceRule: QuestionQualityRule = {
  id: 'qq:listening-evidence', name: 'Listening Evidence', description: 'Listening questions must reference transcript', priority: 'high',
  check(questions, ctx) {
    const hasTranscript = !!(ctx?.transcriptContent);
    return questions.map((q, i) => {
      if (!hasTranscript || !q.answer) return ok(this.id, i);

      const explanation = pt(q.explanationEn || '') + ' ' + pt(q.explanationZh || '');
      const answer = pt(q.answer);

      const transcript = pt(ctx.transcriptContent || '');
      if (answer.length > 2 && !transcript.includes(answer)) {
        return warn(this.id, `Answer "${answer}" not found verbatim in transcript`, i);
      }

      const hasRef = /\b(transcript|speaker|recording|對話|錄音|said|mentioned|stated)\b/i.test(explanation);
      if (!hasRef) {
        return warn(this.id, 'Listening question explanation lacks transcript reference', i);
      }

      return ok(this.id, i);
    });
  },
};

// ═══ 9. WritingPromptQualityRule ═══
const WRITING_ELEMENTS = ['scenario', 'role', 'audience', 'purpose', 'tone', 'word count'];
const ELEMENT_PATTERNS: Record<string, RegExp> = {
  scenario: /\b(you are|imagine|suppose|situation|scenario|context)\b/i,
  role: /\b(as a|you are a|your role|acting as)\b/i,
  audience: /\b(to|for|audience|reader|recipient|addressed to)\b/i,
  purpose: /\b(to\s+\w+|purpose|goal|aim|objective|persuade|inform|describe|explain|argue|convince)\b/i,
  tone: /\b(tone|style|formal|informal|polite|persuasive|descriptive)\b/i,
  'word count': /\b(word|字|words|字數|limit|at least|minimum|maximum|\d+\s*(words|字))\b/i,
};

export const writingPromptQualityRule: QuestionQualityRule = {
  id: 'qq:writing-prompt-quality', name: 'Writing Prompt Quality', description: 'Ensures writing prompts have all required elements', priority: 'high',
  check(questions, ctx) {
    const isWriting = questions.some(q =>
      pt(q.type || q.questionType || '').includes('writing') ||
      pt(q.prompt || q.question || '').includes('write'),
    );
    if (!isWriting) return questions.map((q, i) => ok(this.id, i));

    return questions.map((q, i) => {
      const prompt = pt(q.prompt || q.question || q.questionText || '');
      if (!prompt) return ok(this.id, i);

      const missing: string[] = [];
      for (const element of WRITING_ELEMENTS) {
        if (!ELEMENT_PATTERNS[element].test(prompt)) {
          missing.push(element);
        }
      }

      if (missing.length >= 3) {
        return fail(this.id, `Writing prompt missing ${missing.length} elements: ${missing.join(', ')}`, 'high', i);
      }
      if (missing.length > 0) {
        return warn(this.id, `Writing prompt missing: ${missing.join(', ')}`, i);
      }
      return ok(this.id, i);
    });
  },
};

// ═══ 10. IntegratedSkillsAlignmentRule ═══
export const integratedSkillsAlignmentRule: QuestionQualityRule = {
  id: 'qq:integrated-skills', name: 'Integrated Skills Alignment', description: 'Reading/listening/writing must share scenario', priority: 'medium',
  check(questions, ctx) {
    const hasReading = questions.some(q => pt(q.type || '').includes('reading'));
    const hasListening = questions.some(q => pt(q.type || '').includes('listening'));
    const hasWriting = questions.some(q => pt(q.type || '').includes('writing'));

    // Only check if 2+ skills are present
    const activeSkills = [hasReading, hasListening, hasWriting].filter(Boolean).length;
    if (activeSkills < 2) return questions.map((q, i) => ok(this.id, i));

    // Collect key terms from prompts
    const keyTerms = new Set<string>();
    for (const q of questions) {
      const prompt = pt(q.prompt || q.question || q.questionText || '');
      const words = prompt.split(/\s+/).filter(w => w.length > 4);
      for (const w of words) keyTerms.add(w);
    }

    return questions.map((q, i) => {
      const prompt = pt(q.prompt || q.question || q.questionText || '');
      if (!prompt) return ok(this.id, i);

      const words = prompt.split(/\s+/).filter(w => w.length > 4);
      const sharedTerms = words.filter(w => keyTerms.has(w));
      if (activeSkills >= 3 && sharedTerms.length < 2) {
        return warn(this.id, `Integrated question may lack shared scenario terms`, i);
      }
      return ok(this.id, i);
    });
  },
};

// ═══ 11. VocabularyLevelRule ═══
const CEFR_WORD_LISTS: Record<string, { maxSyllables: number; maxRareWords: number }> = {
  'A1': { maxSyllables: 2, maxRareWords: 0 },
  'A2': { maxSyllables: 2, maxRareWords: 1 },
  'B1': { maxSyllables: 3, maxRareWords: 2 },
  'B2': { maxSyllables: 4, maxRareWords: 3 },
  'C1': { maxSyllables: 5, maxRareWords: 5 },
  'C2': { maxSyllables: 6, maxRareWords: 8 },
};

const RARE_WORD_PATTERNS = [
  /(obfuscate|ameliorate|perfunctory|magnanimous|pusillanimous|sycophant|obsequious|recalcitrant|intransigent|perfidious)/i,
  /(ephemeral|evanescent|phantasmagorical|infinitesimal|antediluvian|sesquipedalian|supercilious|grandiloquent)/i,
];

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 2) return 1;
  return (w.match(/[aeiouy]+/g) || []).length || 1;
}

export const vocabularyLevelRule: QuestionQualityRule = {
  id: 'qq:vocabulary-level', name: 'Vocabulary Level', description: 'Vocabulary must match CEFR/DSE level', priority: 'medium',
  check(questions, ctx) {
    const level = ctx?.targetCEFR || 'B1';
    const limits = CEFR_WORD_LISTS[level] || CEFR_WORD_LISTS['B1'];

    return questions.map((q, i) => {
      const prompt = pt(q.prompt || q.question || q.questionText || '');
      if (!prompt) return ok(this.id, i);

      const words = prompt.split(/\s+/);
      let rareCount = 0;
      let highSyllableCount = 0;

      for (const word of words) {
        if (countSyllables(word) > limits.maxSyllables) highSyllableCount++;
        for (const pattern of RARE_WORD_PATTERNS) {
          if (pattern.test(word)) rareCount++;
        }
      }

      if (rareCount > limits.maxRareWords) {
        return fail(this.id, `Too many rare words for ${level} level (${rareCount} > ${limits.maxRareWords})`, 'medium', i);
      }
      if (highSyllableCount > words.length * 0.3) {
        return warn(this.id, `${Math.round(highSyllableCount / words.length * 100)}% of words exceed ${level} syllable limit`, i);
      }

      return ok(this.id, i);
    });
  },
};

// ═══ 12. GrammarComplexityRule ═══
const COMPLEX_GRAMMAR = [
  /(had\s+been\s+\w+ing)/i,        // past perfect continuous
  /(will\s+have\s+been\s+\w+ing)/i, // future perfect continuous
  /(were\s+\w+\s+to\s+have)/i,      // subjunctive perfect
  /(should\s+\w+\s+have\s+\w+ed)/i, // should have + past participle subjunctive
];

export const grammarComplexityRule: QuestionQualityRule = {
  id: 'qq:grammar-complexity', name: 'Grammar Complexity', description: 'Grammar complexity must match level', priority: 'low',
  check(questions, ctx) {
    const level = ctx?.targetCEFR || 'B1';
    if (['C1', 'C2'].includes(level)) return questions.map((q, i) => ok(this.id, i));

    return questions.map((q, i) => {
      const text = pt(q.prompt || q.question || q.questionText || '') + ' ' +
        pt(q.explanationEn || '') + ' ' + pt(q.explanationZh || '');

      for (const pattern of COMPLEX_GRAMMAR) {
        if (pattern.test(text)) {
          return warn(this.id, `Grammar too complex for ${level} level`, i);
        }
      }
      return ok(this.id, i);
    });
  },
};

// ═══ 13. QuestionVarietyRule ═══
const QUESTION_TEMPLATES = [
  /\bwhat\b/i, /\bwhich\b/i, /\bwho\b/i, /\bwhen\b/i, /\bwhere\b/i, /\bwhy\b/i, /\bhow\b/i,
  /\b(is|are|was|were|do|does|did|can|could|will|would|has|have|had)\b.*\?/i,
];

function detectTemplate(prompt: string): string {
  const p = pt(prompt);
  if (/\bwhich of the following\b/i.test(p)) return 'which-of-following';
  if (/\bwhat is\b/i.test(p)) return 'what-is';
  if (/\b(defines?|means?|refers to)\b/i.test(p) && /\?/.test(p)) return 'definition';
  if (/\b(true|false)\b/i.test(p)) return 'true-false';
  if (/\b(not|except|least)\b/i.test(p)) return 'negative';
  if (/\b(according to|based on|in the)\b/i.test(p)) return 'reference';
  if (/\b(how|why)\b/i.test(p)) return 'how-why';
  return 'other';
}

export const questionVarietyRule: QuestionQualityRule = {
  id: 'qq:question-variety', name: 'Question Variety', description: 'Prevents repeated question templates', priority: 'medium',
  check(questions, ctx) {
    const templates: string[] = [];
    return questions.map((q, i) => {
      const prompt = pt(q.prompt || q.question || q.questionText || '');
      if (!prompt) return ok(this.id, i);

      const tpl = detectTemplate(prompt);
      templates.push(tpl);

      // Check consecutive same template (3+)
      if (i >= 2 && templates[i] === templates[i - 1] && templates[i] === templates[i - 2]) {
        return warn(this.id, `Template "${tpl}" repeated 3+ times consecutively`, i);
      }
      return ok(this.id, i);
    });
  },
};

// ═══ 14. AnswerDistributionRule ═══
export const answerDistributionRule: QuestionQualityRule = {
  id: 'qq:answer-distribution', name: 'Answer Distribution', description: 'Tracks and warns on skewed answer distribution', priority: 'low',
  check(questions, ctx) {
    const history = ctx?.answerHistory || [];
    const allAnswers = [...history];

    return questions.map((q, i) => {
      if (!q.answer) return ok(this.id, i);
      const ans = pt(q.answer);
      allAnswers.push(ans);

      // Only check if we have enough data
      if (allAnswers.length < 4) return ok(this.id, i);

      // Count distribution of single-letter answers (A/B/C/D)
      const letterAnswers = allAnswers.filter(a => /^[a-d]$/.test(a));
      if (letterAnswers.length >= 4) {
        const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
        for (const a of letterAnswers) counts[a] = (counts[a] || 0) + 1;
        const maxCount = Math.max(...Object.values(counts));
        const minCount = Math.min(...Object.values(counts));

        // Skewed: one answer dominates (>50%)
        if (maxCount / letterAnswers.length > 0.5 && letterAnswers.length >= 6) {
          const dominant = Object.entries(counts).find(([, v]) => v === maxCount);
          return warn(this.id, `Answer "${dominant![0].toUpperCase()}" appears ${maxCount}/${letterAnswers.length} times (${Math.round(maxCount / letterAnswers.length * 100)}%)`, i);
        }
      }

      return ok(this.id, i);
    });
  },
};

// ═══ Rule Pack ═══
export const allQuestionQualityRules: QuestionQualityRule[] = [
  distractorPlausibilityRule,
  correctAnswerUniquenessRule,
  optionSimilarityRule,
  difficultyBalanceRule,
  questionClarityRule,
  stemCompletenessRule,
  readingEvidenceRule,
  listeningEvidenceRule,
  writingPromptQualityRule,
  integratedSkillsAlignmentRule,
  vocabularyLevelRule,
  grammarComplexityRule,
  questionVarietyRule,
  answerDistributionRule,
];
