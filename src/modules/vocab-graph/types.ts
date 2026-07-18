// Sprint 10: Vocabulary Graph — types

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type HKDSELevel = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

export interface WordNode {
  word: string;
  partOfSpeech: string;
  cefr: CEFRLevel;
  hkdse: HKDSELevel;
  /** Frequency rank (1 = most common) */
  frequencyRank: number;
}

export interface WordFamily {
  root: string;
  members: WordFamilyMember[];
}

export interface WordFamilyMember {
  word: string;
  partOfSpeech: string;
  /** Morphological relationship to root */
  relation: 'root' | 'noun' | 'verb' | 'adjective' | 'adverb' | 'agent-noun' | 'negative-adjective' | 'opposite';
  cefr: CEFRLevel;
}

export interface WordRelations {
  synonyms: string[];
  antonyms: string[];
  collocations: Collocation[];
  relatedExpressions: string[];
}

export interface Collocation {
  pattern: string;
  example: string;
  exampleZh: string;
}

export interface VocabularyGraphEntry {
  word: WordNode;
  family: WordFamily | null;
  relations: WordRelations;
}
