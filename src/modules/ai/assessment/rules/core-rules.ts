// ============================================
// Sprint 106: Assessment Rules — Batch 1
// MCQ Quality, Distractor Quality, Answer Uniqueness, Difficulty Alignment
// ============================================

import type { AssessmentRule, AssessmentCheck, AssessmentContext } from '../assessment-types';

// ═══ Helpers ═══
const norm = (s: unknown) => String(s || '').trim().toLowerCase();
const isMC = (q: Record<string, unknown>) => norm(q.type) === 'mc' || norm(q.type) === 'mcq';

function pass(id: string): AssessmentCheck { return { ruleId: id, passed: true, score: 1, priority: 'low', estimatedRepairCost: 0 }; }
function fail(id: string, msg: string, priority: AssessmentCheck['priority'] = 'high', cost = 50): AssessmentCheck {
  return { ruleId: id, passed: false, score: 0, message: msg, recommendation: msg, priority, estimatedRepairCost: cost };
}

// ═══ 1. MCQ Quality ═══
export const mcqQualityRule: AssessmentRule = {
  id: 'assessment:mcq-quality', name: 'MCQ Quality', description: 'Validates MC question structure', priority: 'critical',
  assess(q, _ctx) {
    if (!isMC(q)) return pass(this.id);
    const choices = (q.choices as string[]) || [];
    const answer = norm(q.answer);
    if (choices.length !== 4) return fail(this.id, `Expected 4 options, got ${choices.length}`, 'critical');
    if (!answer) return fail(this.id, 'Answer is missing', 'critical');
    const idx = answer.toUpperCase().charCodeAt(0) - 65;
    if (idx < 0 || idx >= 4) return fail(this.id, `Answer "${answer}" is not A-D`, 'critical');
    if (!choices[idx]?.trim()) return fail(this.id, `Option ${answer} is empty`, 'critical');
    // Check for banned patterns
    const banned = ['all of the above', 'none of the above', 'both a and', 'a and b'];
    for (const c of choices) {
      if (banned.some(b => norm(c).includes(b))) return fail(this.id, `Banned pattern "${c}" found`, 'high');
    }
    return pass(this.id);
  },
};

// ═══ 2. Distractor Quality ═══
export const distractorQualityRule: AssessmentRule = {
  id: 'assessment:distractor-quality', name: 'Distractor Quality', description: 'Checks distractors are plausible', priority: 'high',
  assess(q, _ctx) {
    if (!isMC(q)) return pass(this.id);
    const choices = (q.choices as string[]) || [];
    const lengths = choices.map(c => (c || '').trim().length);
    const avg = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
    // Check for very short distractors
    for (let i = 0; i < choices.length; i++) {
      if (lengths[i] < 3) return fail(this.id, `Option ${String.fromCharCode(65 + i)} is very short (${lengths[i]} chars)`, 'medium', 20);
      if (lengths[i] < avg * 0.3) return fail(this.id, `Option ${String.fromCharCode(65 + i)} is much shorter than average`, 'low', 10);
    }
    // Check for duplicate meanings
    const normalized = choices.map(c => norm(c).replace(/\s+/g, ' '));
    const unique = new Set(normalized);
    if (unique.size < choices.length) return fail(this.id, `${choices.length - unique.size} duplicate option(s)`, 'high', 60);
    return pass(this.id);
  },
};

// ═══ 3. Answer Uniqueness ═══
export const answerUniquenessRule: AssessmentRule = {
  id: 'assessment:answer-uniqueness', name: 'Answer Uniqueness', description: 'Only one option should be correct', priority: 'critical',
  assess(q, _ctx) {
    if (!isMC(q)) return pass(this.id);
    const choices = (q.choices as string[]) || [];
    const answer = norm(q.answer);
    const idx = answer.toUpperCase().charCodeAt(0) - 65;
    if (idx < 0 || idx >= 4) return pass(this.id); // covered by mcq-quality
    const correct = norm(choices[idx]);
    // Check if any other option is identical to the correct one
    for (let i = 0; i < choices.length; i++) {
      if (i !== idx && norm(choices[i]) === correct) {
        return fail(this.id, `Options ${String.fromCharCode(65 + idx)} and ${String.fromCharCode(65 + i)} are identical`, 'critical', 80);
      }
    }
    return pass(this.id);
  },
};

// ═══ 4. Difficulty Alignment ═══
const C1_WORDS = new Set(['ubiquitous', 'paradigm', 'dichotomy', 'ephemeral', 'pragmatic', 'synthesis', 'juxtaposition', 'unequivocal', 'quintessential', 'exacerbate', 'ameliorate', 'disseminate', 'extrapolate', 'juxtapose', 'perpetuate', 'scrutinize', 'cognizant', 'concomitant', 'unequivocally', 'ostensibly', 'purportedly', 'disproportionate', 'multifaceted', 'unprecedented', 'indispensable', 'sophisticated', 'substantiate', 'corroborate', 'elucidate', 'articulate']);
const A1_WORDS = new Set(['the', 'is', 'are', 'was', 'were', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'will', 'would', 'go', 'come', 'see', 'look', 'make', 'take', 'give', 'get', 'put', 'say', 'tell', 'big', 'small', 'good', 'bad', 'new', 'old', 'man', 'woman', 'child', 'people', 'time', 'year', 'day', 'school', 'book', 'water', 'food', 'house', 'car', 'city']);

export const difficultyAlignmentRule: AssessmentRule = {
  id: 'assessment:difficulty-alignment', name: 'Difficulty Alignment', description: 'Vocabulary matches target level', priority: 'medium',
  assess(q, ctx) {
    const level = ctx?.targetLevel || '';
    const text = [q.questionText, q.question, q.prompt, q.readingContent, ...(q.choices as string[] || [])].filter(Boolean).join(' ');
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (level === 'remedial' || level === 'A1' || level === 'A2') {
      const advanced = words.filter(w => C1_WORDS.has(w));
      if (advanced.length > 0) return fail(this.id, `Remedial content has ${advanced.length} C1 words: ${advanced.slice(0, 3).join(', ')}`, 'medium', 40);
    }
    if (level === 'challenge' || level === 'C1' || level === 'C2') {
      if (words.length > 10) {
        const basic = words.filter(w => A1_WORDS.has(w)).length;
        const ratio = basic / words.length;
        if (ratio > 0.8) return fail(this.id, `Challenge content is ${Math.round(ratio * 100)}% A1 vocabulary`, 'medium', 30);
      }
    }
    return pass(this.id);
  },
};
