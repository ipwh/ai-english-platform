// ============================================
// Sprint 103: DifficultyConsistencyRule
// Validates vocabulary difficulty and sentence complexity match requested level.
// Detects: B1 request producing C2 vocabulary, primary level producing university grammar.
// Category: heuristic
// ============================================

import { BaseQualityRule } from '../../quality-rule';
import type { RuleCheckResult } from '../../quality-types';

interface HasDifficulty {
  difficulty?: string;
  gradeLevel?: string;
  questionText?: string;
  question?: string;
  prompt?: string;
  readingContent?: string;
  listeningContent?: string;
  choices?: string[];
}

// Approximate CEFR word lists (frequent words only)
const A1_A2_WORDS = new Set([
  'the', 'is', 'are', 'was', 'were', 'have', 'has', 'had', 'do', 'does', 'did',
  'can', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'could',
  'go', 'come', 'see', 'look', 'make', 'take', 'give', 'get', 'put', 'say', 'tell',
  'ask', 'know', 'think', 'want', 'like', 'love', 'need', 'use', 'find', 'help',
  'big', 'small', 'good', 'bad', 'new', 'old', 'high', 'low', 'long', 'short',
  'man', 'woman', 'child', 'people', 'time', 'year', 'day', 'week', 'school',
  'book', 'water', 'food', 'house', 'car', 'city', 'country', 'world',
]);

const C1_C2_WORDS = new Set([
  'ubiquitous', 'paradigm', 'dichotomy', 'ephemeral', 'pragmatic', 'synthesis',
  'juxtaposition', 'unequivocal', 'quintessential', 'exacerbate', 'ameliorate',
  'disseminate', 'extrapolate', 'juxtapose', 'perpetuate', 'scrutinize',
  'cognizant', 'concomitant', 'unequivocally', 'ostensibly', 'purportedly',
  'disproportionate', 'multifaceted', 'unprecedented', 'indispensable',
  'sophisticated', 'substantiate', 'corroborate', 'elucidate', 'articulate',
]);

const COMPLEX_STRUCTURES = [
  /\bnot only.*but also\b/i,
  /\bhad (it|they|he|she|we|I|you) (not|been)\b/i,   // Inversion
  /\b(were|had|should) (it|they|he|she|we|I|you) to\b/i,
  /\bno sooner.*than\b/i,
  /\bscarcely.*when\b/i,
  /\bhardly.*when\b/i,
  /\b(?:inasmuch as|notwithstanding|heretofore|whereas|thereby)\b/i,
];

export class DifficultyConsistencyRule extends BaseQualityRule<HasDifficulty> {
  readonly id = 'content:difficulty-consistency';
  readonly name = 'Difficulty Level Consistency';
  readonly description = 'Validates vocabulary and sentence complexity match requested level';
  readonly priority = 'medium' as const;
  readonly supportedTypes = ['GeneratedQuestion'];
  readonly category = 'heuristic' as const;
  readonly dimension = 'pedagogy' as const;

  validate(input: HasDifficulty): RuleCheckResult {
    const warnings: string[] = [];

    const difficulty = (input.difficulty || '').toLowerCase();
    const gradeLevel = input.gradeLevel || '';
    if (!difficulty && !gradeLevel) return this.pass(); // no level specified

    // Build all text to analyze
    const texts = [
      input.questionText, input.question, input.prompt,
      input.readingContent, input.listeningContent,
      ...(input.choices || []),
    ].filter(Boolean).join(' ');

    if (!texts.trim()) return this.pass();

    const words = texts.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    // Check for advanced vocabulary in remedial content
    if (difficulty === 'remedial' || gradeLevel.startsWith('S1') || gradeLevel.startsWith('S2')) {
      const advancedWords = words.filter(w => C1_C2_WORDS.has(w));
      if (advancedWords.length > 0) {
        warnings.push(`Remedial/S1-S2 content contains ${advancedWords.length} C1-C2 level words: ${advancedWords.slice(0, 5).join(', ')}`);
      }

      // Check sentence complexity
      const sentences = texts.split(/[.!?]+/).filter(s => s.trim());
      const avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;
      if (avgWordsPerSentence > 15) {
        warnings.push(`Remedial content has high average sentence length (${Math.round(avgWordsPerSentence)} words/sentence) — expected <15`);
      }

      // Check for complex structures
      for (const pattern of COMPLEX_STRUCTURES) {
        if (pattern.test(texts)) {
          warnings.push('Remedial content contains complex grammatical structure — may be too advanced');
          break;
        }
      }
    }

    // Check for basic vocabulary in challenge content
    if (difficulty === 'challenge' || gradeLevel.startsWith('S5') || gradeLevel.startsWith('S6')) {
      const totalContentWords = new Set(words.filter(w => w.length > 3));
      const basicRatio = [...totalContentWords].filter(w => A1_A2_WORDS.has(w)).length / Math.max(1, totalContentWords.size);
      if (basicRatio > 0.7 && words.length > 20) {
        warnings.push(`Challenge content is ${Math.round(basicRatio * 100)}% A1-A2 vocabulary — may be too easy`);
      }

      const sentences = texts.split(/[.!?]+/).filter(s => s.trim());
      const avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;
      if (avgWordsPerSentence < 8) {
        warnings.push(`Challenge content has low sentence complexity (${Math.round(avgWordsPerSentence)} words/sentence)`);
      }
    }

    if (warnings.length > 0) {
      return { passed: true, failures: [], warnings };
    }
    return this.pass();
  }
}
