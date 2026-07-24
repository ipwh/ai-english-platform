// ============================================
// Sprint 105: Synonym, Semantic, Keyword Rules
// ============================================
import type { EvaluationRule, GradingPolicyConfig } from '../../evaluation-types';
import { areSynonyms } from '../accepted-answer';
import { computeSemanticScore, computeKeywordScore } from '../semantic-comparator';

export const synonymRule: EvaluationRule = {
  name: 'synonym',
  description: 'Checks match using synonym substitution',
  evaluate(student, reference, _config) {
    const sTokens = student.trim().toLowerCase().split(/\s+/);
    const rTokens = reference.trim().toLowerCase().split(/\s+/);
    if (rTokens.length === 0) return { ruleName: this.name, passed: false, score: 0 };
    let matches = 0;
    for (const st of sTokens) {
      for (const rt of rTokens) {
        if (areSynonyms(st, rt)) { matches++; break; }
      }
    }
    const score = matches / rTokens.length;
    return { ruleName: this.name, passed: score >= 0.5, score };
  },
};

export const semanticRule: EvaluationRule = {
  name: 'semantic',
  description: 'Computes semantic similarity using token overlap, bigrams, and character similarity',
  evaluate(student, reference, config) {
    const score = computeSemanticScore(
      student.trim().toLowerCase(),
      reference.trim().toLowerCase(),
    );
    return { ruleName: this.name, passed: score >= config.minSemanticScore, score };
  },
};

export const keywordRule: EvaluationRule = {
  name: 'keyword',
  description: 'Checks required keyword coverage — requires external keyword list',
  evaluate(_student, _reference, _config) {
    // Keyword scoring requires external keyword list — handled by EvaluationEngine
    return { ruleName: this.name, passed: true, score: 1, detail: 'evaluated by engine with keyword list' };
  },
};
