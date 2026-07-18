// Sprint 10: Word Levels — CEFR + HKDSE level mapping
import type { CEFRLevel, HKDSELevel } from '../types';

/** Map CEFR to HKDSE grade level */
export function cefrToHkdse(cefr: CEFRLevel): HKDSELevel {
  const map: Record<CEFRLevel, HKDSELevel> = {
    A1: 'S1', A2: 'S2',
    B1: 'S3', B2: 'S4',
    C1: 'S5', C2: 'S6',
  };
  return map[cefr];
}

/** Map HKDSE grade to expected CEFR level */
export function hkdseToCefr(grade: HKDSELevel): CEFRLevel {
  const map: Record<HKDSELevel, CEFRLevel> = {
    S1: 'A1', S2: 'A2',
    S3: 'B1', S4: 'B2',
    S5: 'C1', S6: 'C2',
  };
  return map[grade];
}

/** DSE target CEFR by grade */
export function getTargetCefr(grade: HKDSELevel): CEFRLevel {
  return hkdseToCefr(grade);
}

/** Get vocabulary size expectation by CEFR level */
export function getVocabSize(level: CEFRLevel): { receptive: number; productive: number } {
  const sizes: Record<CEFRLevel, { receptive: number; productive: number }> = {
    A1: { receptive: 1000, productive: 500 },
    A2: { receptive: 2000, productive: 1000 },
    B1: { receptive: 4000, productive: 2000 },
    B2: { receptive: 6000, productive: 3000 },
    C1: { receptive: 8000, productive: 4000 },
    C2: { receptive: 10000, productive: 5000 },
  };
  return sizes[level];
}

/** Check if a word is at or below the student's target level */
export function isAtLevel(cefr: CEFRLevel, targetCefr: CEFRLevel): boolean {
  const levels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  return levels.indexOf(cefr) <= levels.indexOf(targetCefr);
}

/** Determine if a word is above the student's current level (for differentiation) */
export function isAboveLevel(cefr: CEFRLevel, studentGrade: HKDSELevel): boolean {
  const target = hkdseToCefr(studentGrade);
  return !isAtLevel(cefr, target);
}

// ============================================
// Curated DSE vocabulary with CEFR levels
// ============================================

const DSE_VOCAB: Record<string, { cefr: CEFRLevel; hkdse: HKDSELevel; topic: string }> = {
  // === S1-S2 (A1-A2) ===
  environment: { cefr: 'A2', hkdse: 'S2', topic: 'environment' },
  pollution: { cefr: 'A2', hkdse: 'S2', topic: 'environment' },
  recycle: { cefr: 'A2', hkdse: 'S2', topic: 'environment' },
  technology: { cefr: 'A2', hkdse: 'S2', topic: 'technology' },
  computer: { cefr: 'A1', hkdse: 'S1', topic: 'technology' },
  internet: { cefr: 'A1', hkdse: 'S1', topic: 'technology' },
  education: { cefr: 'A2', hkdse: 'S2', topic: 'education' },
  student: { cefr: 'A1', hkdse: 'S1', topic: 'education' },
  teacher: { cefr: 'A1', hkdse: 'S1', topic: 'education' },
  homework: { cefr: 'A1', hkdse: 'S1', topic: 'education' },
  health: { cefr: 'A2', hkdse: 'S2', topic: 'health' },
  exercise: { cefr: 'A1', hkdse: 'S1', topic: 'health' },
  diet: { cefr: 'A2', hkdse: 'S2', topic: 'health' },
  government: { cefr: 'A2', hkdse: 'S2', topic: 'society' },
  society: { cefr: 'A2', hkdse: 'S2', topic: 'society' },
  community: { cefr: 'A2', hkdse: 'S2', topic: 'society' },
  culture: { cefr: 'A2', hkdse: 'S2', topic: 'culture' },
  tradition: { cefr: 'A2', hkdse: 'S2', topic: 'culture' },
  festival: { cefr: 'A2', hkdse: 'S2', topic: 'culture' },
  career: { cefr: 'A2', hkdse: 'S2', topic: 'career' },
  job: { cefr: 'A1', hkdse: 'S1', topic: 'career' },
  interview: { cefr: 'A2', hkdse: 'S2', topic: 'career' },

  // === S3-S4 (B1-B2) ===
  sustainable: { cefr: 'B1', hkdse: 'S3', topic: 'environment' },
  conservation: { cefr: 'B1', hkdse: 'S3', topic: 'environment' },
  innovation: { cefr: 'B1', hkdse: 'S3', topic: 'technology' },
  digital: { cefr: 'B1', hkdse: 'S3', topic: 'technology' },
  curriculum: { cefr: 'B1', hkdse: 'S3', topic: 'education' },
  academic: { cefr: 'B1', hkdse: 'S3', topic: 'education' },
  scholarship: { cefr: 'B1', hkdse: 'S3', topic: 'education' },
  psychological: { cefr: 'B1', hkdse: 'S3', topic: 'health' },
  nutrition: { cefr: 'B1', hkdse: 'S3', topic: 'health' },
  legislation: { cefr: 'B1', hkdse: 'S3', topic: 'society' },
  demographic: { cefr: 'B1', hkdse: 'S3', topic: 'society' },
  globalization: { cefr: 'B1', hkdse: 'S3', topic: 'culture' },
  diversity: { cefr: 'B1', hkdse: 'S3', topic: 'culture' },
  profession: { cefr: 'B1', hkdse: 'S3', topic: 'career' },
  qualification: { cefr: 'B1', hkdse: 'S3', topic: 'career' },
  inevitable: { cefr: 'B2', hkdse: 'S4', topic: 'general' },
  phenomenon: { cefr: 'B2', hkdse: 'S4', topic: 'general' },
  consequence: { cefr: 'B2', hkdse: 'S4', topic: 'general' },

  // === S5-S6 (C1-C2) ===
  paramount: { cefr: 'C1', hkdse: 'S5', topic: 'general' },
  indispensable: { cefr: 'C1', hkdse: 'S5', topic: 'general' },
  exacerbate: { cefr: 'C1', hkdse: 'S5', topic: 'general' },
  mitigate: { cefr: 'C1', hkdse: 'S5', topic: 'general' },
  proliferation: { cefr: 'C1', hkdse: 'S5', topic: 'general' },
  ubiquitous: { cefr: 'C1', hkdse: 'S5', topic: 'general' },
  discourse: { cefr: 'C2', hkdse: 'S6', topic: 'general' },
  paradigm: { cefr: 'C2', hkdse: 'S6', topic: 'general' },
};

/** Get CEFR level for a word (curated list only) */
export function getWordLevel(word: string): { cefr: CEFRLevel; hkdse: HKDSELevel } | null {
  const lower = word.toLowerCase();
  return DSE_VOCAB[lower] ? { cefr: DSE_VOCAB[lower].cefr, hkdse: DSE_VOCAB[lower].hkdse } : null;
}

/** Heuristic CEFR estimate based on word length (fallback) */
export function estimateWordLevel(word: string): { cefr: CEFRLevel; hkdse: HKDSELevel } {
  const lower = word.toLowerCase();
  const known = DSE_VOCAB[lower];
  if (known) return { cefr: known.cefr, hkdse: known.hkdse };
  if (lower.length <= 5) return { cefr: 'A1', hkdse: 'S1' };
  if (lower.length <= 7) return { cefr: 'A2', hkdse: 'S2' };
  if (lower.length <= 9) return { cefr: 'B1', hkdse: 'S3' };
  if (lower.length <= 11) return { cefr: 'B2', hkdse: 'S4' };
  return { cefr: 'C1', hkdse: 'S5' };
}

/** Get words by topic */
export function getWordsByTopic(topic: string): string[] {
  return Object.entries(DSE_VOCAB)
    .filter(([, v]) => v.topic === topic)
    .map(([word]) => word);
}

/** Get words appropriate for a grade level */
export function getWordsForGrade(grade: HKDSELevel): string[] {
  const grades: HKDSELevel[] = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
  const maxIdx = grades.indexOf(grade);
  return Object.entries(DSE_VOCAB)
    .filter(([, v]) => grades.indexOf(v.hkdse) <= maxIdx)
    .map(([word]) => word);
}
