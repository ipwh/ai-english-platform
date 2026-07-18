// Sprint 10: Vocabulary Graph — main aggregator
import type { VocabularyGraphEntry, WordNode, HKDSELevel } from '../types';
import { getWordFamily } from './word-family';
import { getWordRelations } from './word-relations';
import { getWordLevel, getWordsForGrade, estimateWordLevel } from './word-levels';

/** Get the full vocabulary graph for a word */
export function getVocabularyGraph(word: string): VocabularyGraphEntry | null {
  const level = getWordLevel(word) ?? estimateWordLevel(word);

  const node: WordNode = {
    word: word.toLowerCase(),
    partOfSpeech: 'unknown',
    cefr: level.cefr,
    hkdse: level.hkdse,
    frequencyRank: 0,
  };

  const family = getWordFamily(word);
  const relations = getWordRelations(word) ?? {
    synonyms: [], antonyms: [], collocations: [], relatedExpressions: [],
  };

  return { word: node, family, relations };
}

/** Get vocabulary recommendations for a student based on their grade level */
export function getVocabRecommendations(
  grade: HKDSELevel,
  knownWords: string[],
  count = 10
): WordNode[] {
  const allWords = getWordsForGrade(grade);
  const known = new Set(knownWords.map(w => w.toLowerCase()));
  const unknown = allWords.filter(w => !known.has(w));

  return unknown.slice(0, count).map(word => {
    const level = getWordLevel(word)!;
    return { word, partOfSpeech: 'unknown', cefr: level.cefr, hkdse: level.hkdse, frequencyRank: 0 };
  });
}

export function getAdvancementVocab(currentGrade: HKDSELevel, count = 5): WordNode[] {
  const grades: HKDSELevel[] = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
  const idx = grades.indexOf(currentGrade);
  if (idx >= grades.length - 1) return [];
  const nextGrade = grades[idx + 1];
  const words = getWordsForGrade(nextGrade);
  return words.slice(0, count).map(word => {
    const level = getWordLevel(word)!;
    return { word, partOfSpeech: 'unknown', cefr: level.cefr, hkdse: level.hkdse, frequencyRank: 0 };
  });
}
