// ============================================
// Sprint 108: Optimization Rules — Batch 2
// MCQBalance, Explanation, DifficultyRebalance, OptionNaturalness
// ============================================

import type { OptimizationRule, OptimizationCheck } from '../optimization-types';

const ok = (id: string): OptimizationCheck => ({ ruleId: id, passed: true, action: 'none', score: 1, priority: 'low', changes: [] });
const fix = (id: string, changes: string[], p: OptimizationCheck['priority'] = 'high'): OptimizationCheck =>
  ({ ruleId: id, passed: false, action: 'repair', score: 0.5, priority: p, changes });
const repl = (id: string, changes: string[]): OptimizationCheck =>
  ({ ruleId: id, passed: false, action: 'replace', score: 0.3, priority: 'medium', changes });

// ═══ MCQBalanceOptimization ═══
export const mcqBalanceRule: OptimizationRule = {
  id: 'opt:mcq-balance', name: 'MCQ Balance', description: 'Balances option length and position', priority: 'high',
  optimize(q) {
    if (q.type !== 'mc' && q.type !== 'mcq') return { question: q, check: ok(this.id) };
    const choices = (q.choices as string[]) || [];
    if (choices.length < 4) return { question: q, check: ok(this.id) };
    const changes: string[] = [];
    const lens = choices.map(c => (c || '').trim().length);
    const max = Math.max(...lens);
    const min = Math.min(...lens);
    if (max > min * 2.5) {
      changes.push(`Option lengths vary ${min}-${max} chars — may bias selection`);
    }
    // Check position distribution
    const answer = String(q.answer || '').toUpperCase();
    if (/^[A-D]$/.test(answer)) {
      const idx = answer.charCodeAt(0) - 65;
      if (idx === 0) changes.push('Correct answer is always position A');
    }
    return { question: q, check: changes.length > 0 ? fix(this.id, changes, 'medium') : ok(this.id) };
  },
};

// ═══ ExplanationOptimization ═══
export const explanationRule: OptimizationRule = {
  id: 'opt:explanation', name: 'Explanation Optimization', description: 'Improves explanation quality', priority: 'medium',
  optimize(q) {
    const changes: string[] = [];
    let modified = false;
    const result = { ...q };

    const zh = String(q.explanationZh || '').trim();
    const en = String(q.explanationEn || '').trim();

    if (!zh && en) {
      result.explanationZh = en;
      changes.push('Copied explanationEn → explanationZh');
      modified = true;
    } else if (zh && zh.length < 10) {
      result.explanationZh = zh + ' (This is the correct answer based on the provided information.)';
      changes.push('Expanded short explanationZh');
      modified = true;
    }

    if (!en && zh) {
      result.explanationEn = zh;
      changes.push('Copied explanationZh → explanationEn');
      modified = true;
    } else if (en && en.length < 10) {
      result.explanationEn = en + ' (This is the correct answer based on the provided information.)';
      changes.push('Expanded short explanationEn');
      modified = true;
    }

    // Remove boilerplate
    for (const key of ['explanationZh', 'explanationEn'] as const) {
      const val = String(result[key] || '');
      if (val === 'The correct answer is shown above.' || val === '正確答案如上所示。') {
        result[key] = '';
        changes.push(`Removed boilerplate ${key}`);
        modified = true;
      }
    }

    return { question: modified ? result : q, check: changes.length > 0 ? repl(this.id, changes) : ok(this.id) };
  },
};

// ═══ DifficultyRebalanceRule ═══
export const difficultyRebalanceRule: OptimizationRule = {
  id: 'opt:difficulty-rebalance', name: 'Difficulty Rebalance', description: 'Flags difficulty mismatches', priority: 'medium',
  optimize(q, assessmentScore) {
    // If assessment flagged difficulty issue, add metadata note
    if (assessmentScore !== undefined && assessmentScore < 60) {
      return {
        question: { ...q, _difficultyWarning: 'Assessment score below 60 — consider regeneration' },
        check: fix(this.id, ['Added difficulty warning metadata'], 'medium'),
      };
    }
    return { question: q, check: ok(this.id) };
  },
};

// ═══ OptionNaturalnessRule ═══
export const optionNaturalnessRule: OptimizationRule = {
  id: 'opt:option-naturalness', name: 'Option Naturalness', description: 'Normalizes option formatting', priority: 'low',
  optimize(q) {
    if (!Array.isArray(q.choices)) return { question: q, check: ok(this.id) };
    const changes: string[] = [];
    const result = [...q.choices.map((c: string) => {
      let cleaned = String(c || '').trim().replace(/\s+/g, ' ');
      // Remove leading bullets
      cleaned = cleaned.replace(/^[•\-\*]\s*/, '');
      // Ensure first letter capitalized
      if (cleaned.length > 0 && /^[a-z]/.test(cleaned)) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        changes.push('Capitalized option start');
      }
      return cleaned;
    })];

    const changed = result.some((c, i) => c !== String(q.choices?.[i] || ''));
    return {
      question: changed ? { ...q, choices: result } : q,
      check: changed ? fix(this.id, changes, 'low') : ok(this.id),
    };
  },
};
