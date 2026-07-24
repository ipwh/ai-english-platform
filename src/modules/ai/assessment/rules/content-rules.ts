// ============================================
// Sprint 106: Assessment Rules — Batch 2
// Question Clarity, Option Balance, Passage Alignment, Listening Alignment, Reference Quality
// ============================================

import type { AssessmentRule, AssessmentCheck, AssessmentContext } from '../assessment-types';

const norm = (s: unknown) => String(s || '').trim().toLowerCase();
function pass(id: string): AssessmentCheck { return { ruleId: id, passed: true, score: 1, priority: 'low', estimatedRepairCost: 0 }; }
function fail(id: string, msg: string, priority: AssessmentCheck['priority'] = 'high', cost = 50): AssessmentCheck {
  return { ruleId: id, passed: false, score: 0, message: msg, recommendation: msg, priority, estimatedRepairCost: cost };
}

// ═══ 5. Question Clarity ═══
const DOUBLE_NEGATIVES = [/\bdon't have no\b/i, /\bcan't not\b/i, /\bnot unlike\b/i, /\bnot incorrect\b/i, /\bnot without\b/i];
const AMBIGUOUS_PRONOUNS = [/\bit\b.*\bit\b.*\bit\b/i]; // too many "it" references

export const questionClarityRule: AssessmentRule = {
  id: 'assessment:question-clarity', name: 'Question Clarity', description: 'Detects unclear wording', priority: 'medium',
  assess(q, _ctx) {
    const text = norm(q.questionText || q.question || q.prompt || '');
    if (!text) return fail(this.id, 'Question text is empty', 'high', 80);
    if (text.length > 500) return fail(this.id, `Question is very long (${text.length} chars)`, 'low', 10);
    for (const dn of DOUBLE_NEGATIVES) {
      if (dn.test(text)) return fail(this.id, 'Question contains double negative — may confuse students', 'medium', 60);
    }
    for (const ap of AMBIGUOUS_PRONOUNS) {
      if (ap.test(text)) return fail(this.id, 'Question has many "it" references — may be ambiguous', 'low', 20);
    }
    // Check for multiple questions in one
    if ((text.match(/\?/g) || []).length > 1) return fail(this.id, 'Prompt contains multiple questions', 'low', 10);
    return pass(this.id);
  },
};

// ═══ 6. Option Balance ═══
export const optionBalanceRule: AssessmentRule = {
  id: 'assessment:option-balance', name: 'Option Balance', description: 'Options should be similar in length and structure', priority: 'low',
  assess(q, _ctx) {
    const choices = (q.choices as string[]) || [];
    if (choices.length < 2) return pass(this.id);
    const lengths = choices.map(c => (c || '').trim().length);
    const max = Math.max(...lengths);
    const min = Math.min(...lengths);
    if (min === 0) return fail(this.id, 'Some options are empty', 'high', 80);
    if (max > min * 3) return fail(this.id, `Option lengths vary widely (${min}-${max} chars)`, 'low', 10);
    // Check grammar consistency: all should be same part of speech roughly
    const startsWithVerb = choices.filter(c => /^(to |is |are |was |were |has |have |had |will |would |can |could |may |might |should )/.test((c || '').trim().toLowerCase())).length;
    if (startsWithVerb > 1 && startsWithVerb < choices.length) return fail(this.id, 'Options have inconsistent grammar structure', 'low', 10);
    return pass(this.id);
  },
};

// ═══ 7. Passage Alignment ═══
export const passageAlignmentRule: AssessmentRule = {
  id: 'assessment:passage-alignment', name: 'Passage Alignment', description: 'Answer is supported by passage', priority: 'critical',
  assess(q, ctx) {
    const passage = ctx?.passageContent || norm(q.readingContent);
    if (!passage) return pass(this.id); // not a reading question
    const answer = norm(q.answer);
    if (!answer || answer === '') return pass(this.id);
    // For MC: check correct choice
    if (/^[a-d]$/.test(answer) && Array.isArray(q.choices)) {
      const idx = answer.charCodeAt(0) - 97;
      const correct = norm(q.choices[idx]);
      const terms = correct.split(/\s+/).filter(w => w.length > 3);
      const missing = terms.filter(t => !passage.includes(t));
      if (missing.length === terms.length && terms.length > 1) {
        return fail(this.id, `Correct answer "${correct.slice(0, 40)}" has no terms in passage`, 'critical', 100);
      }
    }
    return pass(this.id);
  },
};

// ═══ 8. Listening Alignment ═══
export const listeningAlignmentRule: AssessmentRule = {
  id: 'assessment:listening-alignment', name: 'Listening Alignment', description: 'Answer exists in transcript', priority: 'critical',
  assess(q, ctx) {
    const transcript = ctx?.transcriptContent || norm(q.listeningContent);
    if (!transcript) return pass(this.id);
    const answer = norm(q.answer);
    if (!answer) return pass(this.id);
    if (/^[a-d]$/.test(answer) && Array.isArray(q.choices)) {
      const idx = answer.charCodeAt(0) - 97;
      const correct = norm(q.choices[idx]);
      if (!transcript.includes(correct)) {
        const words = correct.split(' ');
        const tail = words.slice(-2).join(' ');
        if (!transcript.includes(tail)) return fail(this.id, `Answer "${correct.slice(0, 40)}" not found in transcript`, 'critical', 100);
      }
    }
    return pass(this.id);
  },
};

// ═══ 9. Reference Quality ═══
export const referenceQualityRule: AssessmentRule = {
  id: 'assessment:reference-quality', name: 'Reference Quality', description: 'Validates paragraph/line/speaker references', priority: 'medium',
  assess(q, ctx) {
    const text = norm(q.questionText || q.question || q.prompt || '');
    const passage = ctx?.passageContent || norm(q.readingContent);
    const transcript = ctx?.transcriptContent || norm(q.listeningContent);
    // Check paragraph references
    const paraRefs = text.match(/paragraph\s+(\d+)/gi);
    if (paraRefs && passage) {
      const paraCount = (passage.match(/\n\n+/g) || []).length + 1;
      for (const ref of paraRefs) {
        const num = parseInt(ref.match(/\d+/)![0], 10);
        if (num > paraCount + 1) return fail(this.id, `Paragraph reference ${num} exceeds count (${paraCount})`, 'high', 60);
      }
    }
    // Check line references
    const lineRefs = text.match(/lines?\s+(\d+)/gi);
    if (lineRefs && passage) {
      const maxLine = passage.split('\n').length;
      for (const ref of lineRefs) {
        const num = parseInt(ref.match(/\d+/)![0], 10);
        if (num > maxLine + 5) return fail(this.id, `Line reference ${num} exceeds passage lines (~${maxLine})`, 'medium', 30);
      }
    }
    // Check speaker references
    const speakerRefs = text.match(/speaker\s+[a-c]/gi);
    if (speakerRefs && transcript) {
      for (const ref of speakerRefs) {
        if (!transcript.toLowerCase().includes(ref.toLowerCase())) {
          return fail(this.id, `Speaker reference "${ref}" not found in transcript`, 'medium', 40);
        }
      }
    }
    return pass(this.id);
  },
};
