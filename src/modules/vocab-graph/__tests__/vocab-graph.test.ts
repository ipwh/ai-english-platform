// Sprint 10: Vocabulary Graph Tests
import { describe, it, expect } from 'vitest';
import { getWordFamily, getAllRootWords, findDerivative, areSameFamily } from '../services/word-family';
import { getWordRelations, getCollocations, getSynonyms } from '../services/word-relations';
import { getWordLevel, cefrToHkdse, hkdseToCefr, getVocabSize, isAtLevel, getWordsByTopic, getWordsForGrade } from '../services/word-levels';
import { getVocabularyGraph, getVocabRecommendations } from '../services/vocab-graph';

// ============================================
// Word Family Tests
// ============================================

describe('WordFamily', () => {
  it('should return word family for a root word', () => {
    const family = getWordFamily('economy');
    expect(family).not.toBeNull();
    expect(family!.root).toBe('economy');
    expect(family!.members.length).toBe(7);
    expect(family!.members.map(m => m.word)).toContain('economic');
    expect(family!.members.map(m => m.word)).toContain('economist');
  });

  it('should return word family for a derivative', () => {
    const family = getWordFamily('economic');
    expect(family).not.toBeNull();
    expect(family!.root).toBe('economy');
  });

  it('should return null for unknown word', () => {
    expect(getWordFamily('xyznotaword')).toBeNull();
  });

  it('should find derivative by part of speech', () => {
    expect(findDerivative('economy', 'adjective')).toBe('economic');
    expect(findDerivative('communicate', 'noun')).toBe('communication');
  });

  it('should check same family', () => {
    expect(areSameFamily('economy', 'economist')).toBe(true);
    expect(areSameFamily('economy', 'environment')).toBe(false);
  });

  it('should have all root words', () => {
    const roots = getAllRootWords();
    expect(roots).toContain('economy');
    expect(roots).toContain('environment');
    expect(roots.length).toBeGreaterThanOrEqual(10);
  });
});

// ============================================
// Word Relations Tests
// ============================================

describe('WordRelations', () => {
  it('should return synonyms', () => {
    const syns = getSynonyms('important');
    expect(syns).toContain('crucial');
    expect(syns).toContain('vital');
    expect(syns.length).toBeGreaterThan(3);
  });

  it('should return collocations', () => {
    const cols = getCollocations('important');
    expect(cols.length).toBeGreaterThan(0);
    expect(cols[0].pattern).toContain('important');
    expect(cols[0].exampleZh).toBeTruthy();
  });

  it('should return full relations', () => {
    const rels = getWordRelations('good');
    expect(rels).not.toBeNull();
    expect(rels!.synonyms).toContain('beneficial');
    expect(rels!.antonyms).toContain('harmful');
  });

  it('should return null for unknown word', () => {
    expect(getWordRelations('xyznotaword')).toBeNull();
  });
});

// ============================================
// Word Levels Tests
// ============================================

describe('WordLevels', () => {
  it('should convert CEFR to HKDSE', () => {
    expect(cefrToHkdse('A1')).toBe('S1');
    expect(cefrToHkdse('B1')).toBe('S3');
    expect(cefrToHkdse('C2')).toBe('S6');
  });

  it('should convert HKDSE to CEFR', () => {
    expect(hkdseToCefr('S1')).toBe('A1');
    expect(hkdseToCefr('S4')).toBe('B2');
  });

  it('should return vocab size by level', () => {
    const a1 = getVocabSize('A1');
    expect(a1.receptive).toBe(1000);
    const c2 = getVocabSize('C2');
    expect(c2.receptive).toBe(10000);
    expect(c2.productive).toBe(5000);
  });

  it('should check level appropriateness', () => {
    expect(isAtLevel('A2', 'B1')).toBe(true);
    expect(isAtLevel('B2', 'B1')).toBe(false);
  });

  it('should get words by topic', () => {
    const env = getWordsByTopic('environment');
    expect(env).toContain('pollution');
    expect(env).toContain('sustainable');
  });

  it('should get words for grade level', () => {
    const s2 = getWordsForGrade('S2');
    expect(s2).toContain('environment');
    expect(s2).toContain('technology');
    const s5 = getWordsForGrade('S5');
    expect(s5).toContain('paramount');
    expect(s5).toContain('exacerbate');
  });

  it('should return level for known words', () => {
    expect(getWordLevel('paramount')?.cefr).toBe('C1');
    expect(getWordLevel('environment')?.hkdse).toBe('S2');
  });
});

// ============================================
// Vocab Graph Tests
// ============================================

describe('VocabGraph', () => {
  it('should return full graph for a word', () => {
    const graph = getVocabularyGraph('important');
    expect(graph).not.toBeNull();
    expect(graph!.relations.synonyms).toContain('crucial');
    expect(graph!.word.cefr).toBeTruthy();
  });

  it('should return graph with heuristic level for unknown word', () => {
    const graph = getVocabularyGraph('xyznotaword');
    expect(graph).not.toBeNull();
    expect(graph!.word.cefr).toBeTruthy(); // heuristic fallback
  });

  it('should recommend vocabulary for grade', () => {
    const recs = getVocabRecommendations('S4', ['environment', 'pollution'], 5);
    expect(recs.length).toBeLessThanOrEqual(5);
    expect(recs.every(r => r.word !== 'environment')).toBe(true);
    expect(recs.every(r => r.word !== 'pollution')).toBe(true);
  });
});
