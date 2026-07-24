// ============================================
// Sprint 105: Evaluation Rules — Batch 1
// Punctuation, Whitespace, Article, Plural, Tense, Spelling
// ============================================
import type { EvaluationRule, GradingPolicyConfig } from '../../evaluation-types';

export const punctuationRule: EvaluationRule = {
  name: 'punctuation',
  description: 'Checks match after removing punctuation',
  evaluate(student, reference, config) {
    if (!config.ignorePunctuation) return { ruleName: this.name, passed: false, score: 0 };
    const s = student.trim().toLowerCase().replace(/[.,!?;:'"()\[\]{}<>\/\\|~`@#$%^&*+=_-]/g, '');
    const r = reference.trim().toLowerCase().replace(/[.,!?;:'"()\[\]{}<>\/\\|~`@#$%^&*+=_-]/g, '');
    const passed = s === r;
    return { ruleName: this.name, passed, score: passed ? 1 : 0.5 };
  },
};

export const whitespaceRule: EvaluationRule = {
  name: 'whitespace',
  description: 'Checks match after normalizing whitespace',
  evaluate(student, reference, _config) {
    const s = student.trim().toLowerCase().replace(/\s+/g, ' ');
    const r = reference.trim().toLowerCase().replace(/\s+/g, ' ');
    const passed = s === r;
    return { ruleName: this.name, passed, score: passed ? 1 : 0.5 };
  },
};

export const articleRule: EvaluationRule = {
  name: 'article',
  description: 'Checks match ignoring article errors (a/an/the)',
  evaluate(student, reference, config) {
    if (!config.allowArticleErrors) return { ruleName: this.name, passed: false, score: 0 };
    const strip = (t: string) => t.toLowerCase().split(/\s+/).filter(w => !['a','an','the'].includes(w)).join(' ');
    const passed = strip(student) === strip(reference);
    return { ruleName: this.name, passed, score: passed ? 1 : 0.5 };
  },
};

export const pluralRule: EvaluationRule = {
  name: 'plural',
  description: 'Checks match ignoring singular/plural when meaning unchanged',
  evaluate(student, reference, config) {
    if (!config.allowNumberVariation) return { ruleName: this.name, passed: false, score: 0 };
    // Simple heuristic: if only difference is trailing 's', treat as equivalent
    const s = student.trim().toLowerCase();
    const r = reference.trim().toLowerCase();
    if (s === r) return { ruleName: this.name, passed: true, score: 1 };
    if (s + 's' === r || r + 's' === s || s.replace(/s$/, '') === r.replace(/s$/, '')) {
      return { ruleName: this.name, passed: true, score: 0.7 };
    }
    // Plural forms: child/children, man/men, etc.
    const irregulars: Array<[string, string]> = [
      ['child', 'children'], ['man', 'men'], ['woman', 'women'],
      ['person', 'people'], ['mouse', 'mice'], ['tooth', 'teeth'],
      ['foot', 'feet'], ['goose', 'geese'], ['leaf', 'leaves'],
    ];
    for (const [sing, plur] of irregulars) {
      if ((s === sing && r === plur) || (s === plur && r === sing)) {
        return { ruleName: this.name, passed: true, score: 0.7 };
      }
    }
    return { ruleName: this.name, passed: false, score: 0 };
  },
};

export const tenseRule: EvaluationRule = {
  name: 'tense',
  description: 'Checks match ignoring tense variations',
  evaluate(student, reference, config) {
    if (!config.allowTenseVariation) return { ruleName: this.name, passed: false, score: 0 };
    // Normalize common verb forms: remove -ing/-ed/-s suffixes for comparison
    const normalize = (t: string) => t.toLowerCase().replace(/\b(\w+)(ing|ed|s|es)\b/g, '$1');
    const passed = normalize(student) === normalize(reference);
    return { ruleName: this.name, passed, score: passed ? 0.5 : 0 };
  },
};

export const spellingRule: EvaluationRule = {
  name: 'spelling',
  description: 'Checks match with allowed spelling tolerance',
  evaluate(student, reference, config) {
    const maxDist = Math.floor(Math.max(student.length, reference.length) * config.maxSpellingDistance);
    if (maxDist === 0) return { ruleName: this.name, passed: false, score: 0 };
    const s = student.trim().toLowerCase();
    const r = reference.trim().toLowerCase();
    const dist = levenshteinDist(s, r);
    const passed = dist <= maxDist;
    return { ruleName: this.name, passed, score: passed ? 1 - (dist / Math.max(s.length, r.length)) : 0 };
  },
};

function levenshteinDist(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1] + (a[i-1]===b[j-1]?0:1));
  return dp[m][n];
}
