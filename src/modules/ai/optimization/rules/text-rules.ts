// ============================================
// Sprint 108: Optimization Rules — Batch 3
// Wording, DuplicateChoice, Readability, WritingPrompt, VocabularySmoothing
// ============================================

import type { OptimizationRule, OptimizationCheck } from '../optimization-types';

const ok = (id: string): OptimizationCheck => ({ ruleId: id, passed: true, action: 'none', score: 1, priority: 'low', changes: [] });
const fix = (id: string, changes: string[], p: OptimizationCheck['priority'] = 'medium'): OptimizationCheck =>
  ({ ruleId: id, passed: false, action: 'repair', score: 0.5, priority: p, changes });
const norm = (id: string, changes: string[]): OptimizationCheck =>
  ({ ruleId: id, passed: false, action: 'normalize', score: 0.7, priority: 'low', changes });

const fields = ['prompt', 'question', 'questionText', 'readingContent', 'listeningContent', 'explanationZh', 'explanationEn'] as const;

// ═══ WordingOptimization ═══
export const wordingRule: OptimizationRule = {
  id: 'opt:wording', name: 'Wording Optimization', description: 'Normalizes awkward wording artifacts', priority: 'low',
  optimize(q) {
    const changes: string[] = [];
    const result = { ...q };
    for (const key of fields) {
      let val = String(result[key] || '');
      if (!val) continue;
      const orig = val;
      // Double spaces → single
      val = val.replace(/  +/g, ' ');
      // Double/triple punctuation
      val = val.replace(/\.{2,}/g, '.');
      val = val.replace(/\?{2,}/g, '?');
      val = val.replace(/!{2,}/g, '!');
      // Repeated words (e.g., "the the")
      val = val.replace(/\b(\w+)\s+\1\b/gi, '$1');
      // LLM artifacts
      val = val.replace(/\bNote:\s*/gi, '').replace(/\bPlease note that\b/gi, '');
      if (val !== orig) {
        (result as Record<string, unknown>)[key] = val;
        changes.push(`Cleaned wording in "${key}"`);
      }
    }
    return { question: changes.length > 0 ? result : q, check: changes.length > 0 ? norm(this.id, changes) : ok(this.id) };
  },
};

// ═══ DuplicateChoiceOptimization ═══
export const duplicateChoiceRule: OptimizationRule = {
  id: 'opt:duplicate-choices', name: 'Duplicate Choice Optimization', description: 'Removes or merges duplicate options', priority: 'high',
  optimize(q) {
    if (!Array.isArray(q.choices)) return { question: q, check: ok(this.id) };
    const seen = new Map<string, number>();
    const changes: string[] = [];
    const result: string[] = [];
    for (let i = 0; i < q.choices.length; i++) {
      const key = String(q.choices[i] || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (!key) continue;
      if (seen.has(key)) {
        changes.push(`Removed duplicate option ${String.fromCharCode(65 + i)} (same as ${String.fromCharCode(65 + seen.get(key)!)})`);
      } else {
        seen.set(key, i);
        result.push(String(q.choices[i] || '').trim());
      }
    }
    if (result.length < q.choices.length) {
      return { question: { ...q, choices: result }, check: fix(this.id, changes, 'high') };
    }
    return { question: q, check: ok(this.id) };
  },
};

// ═══ ReadabilityOptimization ═══
export const readabilityRule: OptimizationRule = {
  id: 'opt:readability', name: 'Readability Optimization', description: 'Improves paragraph spacing and line breaks', priority: 'low',
  optimize(q) {
    const changes: string[] = [];
    const result = { ...q };
    for (const key of ['readingContent', 'listeningContent'] as const) {
      const val = String(result[key] || '');
      if (!val) continue;
      let cleaned = val.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (cleaned !== val) {
        (result as Record<string, unknown>)[key] = cleaned;
        changes.push(`Normalized line breaks in "${key}"`);
      }
    }
    // Add paragraph breaks at sentence boundaries for long text
    for (const key of ['readingContent'] as const) {
      const val = String(result[key] || '');
      if (val.length > 300 && !val.includes('\n\n')) {
        const sentences = val.split(/(?<=[.!?])\s+/);
        if (sentences.length >= 6) {
          const mid = Math.floor(sentences.length / 2);
          const para1 = sentences.slice(0, mid).join(' ');
          const para2 = sentences.slice(mid).join(' ');
          (result as Record<string, unknown>)[key] = para1 + '\n\n' + para2;
          changes.push('Added paragraph break to long passage');
        }
      }
    }
    return { question: changes.length > 0 ? result : q, check: changes.length > 0 ? norm(this.id, changes) : ok(this.id) };
  },
};

// ═══ WritingPromptOptimization ═══
export const writingPromptRule: OptimizationRule = {
  id: 'opt:writing-prompt', name: 'Writing Prompt Optimization', description: 'Ensures writing prompts have required elements', priority: 'medium',
  optimize(q) {
    const prompt = String(q.prompt || q.question || q.questionText || '');
    if (!prompt || prompt.length < 30) return { question: q, check: ok(this.id) };
    const changes: string[] = [];
    const hasTask = /\b(write|describe|discuss|argue|explain|propose|suggest|compare|analyze|compose)\b/i.test(prompt);
    const hasAudience = /\b(you are|write a|as a|to your|for your|school|class|teacher|principal|editor)\b/i.test(prompt);
    const hasLength = /\b(words|word limit|about \d+ words|\d+[-–]\d+ words)\b/i.test(prompt);
    if (!hasTask) changes.push('Prompt missing clear writing task verb');
    if (!hasAudience) changes.push('Prompt missing audience/role specification');
    if (!hasLength) changes.push('Prompt missing word limit');
    return { question: q, check: changes.length > 0 ? fix(this.id, changes, 'medium') : ok(this.id) };
  },
};

// ═══ VocabularySmoothing ═══
const COMPLEX_WORDS: Record<string, string> = {
  'utilize': 'use', 'commence': 'start', 'terminate': 'end',
  'endeavor': 'try', 'pertaining to': 'about', 'in close proximity to': 'near',
  'prior to': 'before', 'subsequent to': 'after', 'aforementioned': 'mentioned',
  'disseminate': 'share', 'ameliorate': 'improve', 'cognizant': 'aware',
};

export const vocabularySmoothingRule: OptimizationRule = {
  id: 'opt:vocabulary-smoothing', name: 'Vocabulary Smoothing', description: 'Replaces unnecessarily complex words with simpler alternatives', priority: 'low',
  optimize(q) {
    const changes: string[] = [];
    const result = { ...q };
    for (const key of fields) {
      let val = String(result[key] || '');
      if (!val) continue;
      for (const [complex, simple] of Object.entries(COMPLEX_WORDS)) {
        if (val.toLowerCase().includes(complex)) {
          val = val.replace(new RegExp(complex, 'gi'), simple);
          changes.push(`Replaced "${complex}" → "${simple}" in "${key}"`);
        }
      }
      if (val !== String(result[key] || '')) {
        (result as Record<string, unknown>)[key] = val;
      }
    }
    return { question: changes.length > 0 ? result : q, check: changes.length > 0 ? norm(this.id, changes) : ok(this.id) };
  },
};
