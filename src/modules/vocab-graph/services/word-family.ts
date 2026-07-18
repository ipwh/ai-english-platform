// Sprint 10: Word Family — morphological relationships
import type { WordFamily, WordFamilyMember } from '../types';

/** Common suffix patterns for word family derivation */
const SUFFIX_MAP: Record<string, { pos: string; relation: WordFamilyMember['relation'] }> = {
  tion: { pos: 'noun', relation: 'noun' }, sion: { pos: 'noun', relation: 'noun' },
  ment: { pos: 'noun', relation: 'noun' }, ness: { pos: 'noun', relation: 'noun' },
  ity: { pos: 'noun', relation: 'noun' }, ence: { pos: 'noun', relation: 'noun' },
  ance: { pos: 'noun', relation: 'noun' }, al: { pos: 'noun', relation: 'noun' },
  er: { pos: 'noun', relation: 'agent-noun' }, or: { pos: 'noun', relation: 'agent-noun' },
  ist: { pos: 'noun', relation: 'agent-noun' }, ian: { pos: 'noun', relation: 'agent-noun' },
  able: { pos: 'adjective', relation: 'adjective' }, ible: { pos: 'adjective', relation: 'adjective' },
  ful: { pos: 'adjective', relation: 'adjective' }, less: { pos: 'adjective', relation: 'opposite' },
  ous: { pos: 'adjective', relation: 'adjective' }, ive: { pos: 'adjective', relation: 'adjective' },
  al_adj: { pos: 'adjective', relation: 'adjective' },
  ly: { pos: 'adverb', relation: 'adverb' },
  ize: { pos: 'verb', relation: 'verb' }, ise: { pos: 'verb', relation: 'verb' },
  ify: { pos: 'verb', relation: 'verb' }, en: { pos: 'verb', relation: 'verb' },
  un: { pos: 'adjective', relation: 'negative-adjective' },
  in: { pos: 'adjective', relation: 'negative-adjective' },
  im: { pos: 'adjective', relation: 'negative-adjective' },
  ir: { pos: 'adjective', relation: 'negative-adjective' },
};

// ============================================
// Curated word families (DSE-relevant vocabulary)
// ============================================

const WORD_FAMILIES: WordFamily[] = [
  {
    root: 'economy',
    members: [
      { word: 'economy', partOfSpeech: 'noun', relation: 'root', cefr: 'B1' },
      { word: 'economic', partOfSpeech: 'adjective', relation: 'adjective', cefr: 'B1' },
      { word: 'economical', partOfSpeech: 'adjective', relation: 'adjective', cefr: 'B2' },
      { word: 'economics', partOfSpeech: 'noun', relation: 'noun', cefr: 'B2' },
      { word: 'economist', partOfSpeech: 'noun', relation: 'agent-noun', cefr: 'B2' },
      { word: 'economize', partOfSpeech: 'verb', relation: 'verb', cefr: 'C1' },
      { word: 'uneconomical', partOfSpeech: 'adjective', relation: 'negative-adjective', cefr: 'C1' },
    ],
  },
  {
    root: 'environment',
    members: [
      { word: 'environment', partOfSpeech: 'noun', relation: 'root', cefr: 'B1' },
      { word: 'environmental', partOfSpeech: 'adjective', relation: 'adjective', cefr: 'B1' },
      { word: 'environmentally', partOfSpeech: 'adverb', relation: 'adverb', cefr: 'B2' },
      { word: 'environmentalist', partOfSpeech: 'noun', relation: 'agent-noun', cefr: 'B2' },
    ],
  },
  {
    root: 'technology',
    members: [
      { word: 'technology', partOfSpeech: 'noun', relation: 'root', cefr: 'A2' },
      { word: 'technological', partOfSpeech: 'adjective', relation: 'adjective', cefr: 'B1' },
      { word: 'technologically', partOfSpeech: 'adverb', relation: 'adverb', cefr: 'B2' },
      { word: 'technologist', partOfSpeech: 'noun', relation: 'agent-noun', cefr: 'C1' },
      { word: 'tech', partOfSpeech: 'noun', relation: 'noun', cefr: 'A2' },
    ],
  },
  {
    root: 'communicate',
    members: [
      { word: 'communicate', partOfSpeech: 'verb', relation: 'root', cefr: 'A2' },
      { word: 'communication', partOfSpeech: 'noun', relation: 'noun', cefr: 'A2' },
      { word: 'communicative', partOfSpeech: 'adjective', relation: 'adjective', cefr: 'B1' },
      { word: 'communicator', partOfSpeech: 'noun', relation: 'agent-noun', cefr: 'B2' },
      { word: 'miscommunication', partOfSpeech: 'noun', relation: 'opposite', cefr: 'B2' },
    ],
  },
  {
    root: 'develop',
    members: [
      { word: 'develop', partOfSpeech: 'verb', relation: 'root', cefr: 'A2' },
      { word: 'development', partOfSpeech: 'noun', relation: 'noun', cefr: 'A2' },
      { word: 'developer', partOfSpeech: 'noun', relation: 'agent-noun', cefr: 'B1' },
      { word: 'developing', partOfSpeech: 'adjective', relation: 'adjective', cefr: 'B1' },
      { word: 'developed', partOfSpeech: 'adjective', relation: 'adjective', cefr: 'B1' },
      { word: 'undeveloped', partOfSpeech: 'adjective', relation: 'negative-adjective', cefr: 'B2' },
    ],
  },
  {
    root: 'compete',
    members: [
      { word: 'compete', partOfSpeech: 'verb', relation: 'root', cefr: 'A2' },
      { word: 'competition', partOfSpeech: 'noun', relation: 'noun', cefr: 'A2' },
      { word: 'competitive', partOfSpeech: 'adjective', relation: 'adjective', cefr: 'B1' },
      { word: 'competitor', partOfSpeech: 'noun', relation: 'agent-noun', cefr: 'B1' },
      { word: 'competitiveness', partOfSpeech: 'noun', relation: 'noun', cefr: 'B2' },
    ],
  },
  {
    root: 'success',
    members: [
      { word: 'success', partOfSpeech: 'noun', relation: 'root', cefr: 'A2' },
      { word: 'succeed', partOfSpeech: 'verb', relation: 'verb', cefr: 'A2' },
      { word: 'successful', partOfSpeech: 'adjective', relation: 'adjective', cefr: 'A2' },
      { word: 'successfully', partOfSpeech: 'adverb', relation: 'adverb', cefr: 'B1' },
      { word: 'unsuccessful', partOfSpeech: 'adjective', relation: 'negative-adjective', cefr: 'B1' },
    ],
  },
  {
    root: 'benefit',
    members: [
      { word: 'benefit', partOfSpeech: 'noun', relation: 'root', cefr: 'A2' },
      { word: 'benefit', partOfSpeech: 'verb', relation: 'verb', cefr: 'A2' },
      { word: 'beneficial', partOfSpeech: 'adjective', relation: 'adjective', cefr: 'B1' },
      { word: 'beneficiary', partOfSpeech: 'noun', relation: 'agent-noun', cefr: 'B2' },
    ],
  },
  {
    root: 'create',
    members: [
      { word: 'create', partOfSpeech: 'verb', relation: 'root', cefr: 'A1' },
      { word: 'creation', partOfSpeech: 'noun', relation: 'noun', cefr: 'A2' },
      { word: 'creative', partOfSpeech: 'adjective', relation: 'adjective', cefr: 'A2' },
      { word: 'creativity', partOfSpeech: 'noun', relation: 'noun', cefr: 'B1' },
      { word: 'creator', partOfSpeech: 'noun', relation: 'agent-noun', cefr: 'B1' },
      { word: 'creatively', partOfSpeech: 'adverb', relation: 'adverb', cefr: 'B2' },
    ],
  },
  {
    root: 'global',
    members: [
      { word: 'globe', partOfSpeech: 'noun', relation: 'root', cefr: 'A2' },
      { word: 'global', partOfSpeech: 'adjective', relation: 'adjective', cefr: 'A2' },
      { word: 'globalization', partOfSpeech: 'noun', relation: 'noun', cefr: 'B1' },
      { word: 'globally', partOfSpeech: 'adverb', relation: 'adverb', cefr: 'B2' },
    ],
  },
];

// ============================================
// Lookup functions
// ============================================

/** Get the word family for a given base word */
export function getWordFamily(word: string): WordFamily | null {
  const lower = word.toLowerCase();
  // First check if the word is a root
  const direct = WORD_FAMILIES.find(f => f.root === lower);
  if (direct) return direct;
  // Then check if it's a member of any family
  for (const family of WORD_FAMILIES) {
    if (family.members.some(m => m.word === lower)) return family;
  }
  return null;
}

/** Get all root words */
export function getAllRootWords(): string[] {
  return WORD_FAMILIES.map(f => f.root);
}

/** Find morphologically related word (e.g., noun form of a verb) */
export function findDerivative(word: string, targetPos: string): string | null {
  const family = getWordFamily(word);
  if (!family) return null;
  const member = family.members.find(m => m.partOfSpeech === targetPos);
  return member?.word ?? null;
}

/** Check if two words belong to the same family */
export function areSameFamily(word1: string, word2: string): boolean {
  const f1 = getWordFamily(word1);
  const f2 = getWordFamily(word2);
  return f1 !== null && f1 === f2;
}
