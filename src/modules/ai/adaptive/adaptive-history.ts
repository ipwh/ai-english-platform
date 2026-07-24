// ============================================
// Sprint 114: Performance History
// Tracks all student answers for adaptive analysis.
// ============================================

import type { PerformanceRecord, SkillDomain } from './adaptive-types';

const history: PerformanceRecord[] = [];
const MAX_RECORDS = 2000;

export function recordPerformance(record: PerformanceRecord): void {
  history.push(record);
  if (history.length > MAX_RECORDS) history.splice(0, history.length - MAX_RECORDS);
}

export function getPerformanceHistory(limit?: number): PerformanceRecord[] {
  const result = [...history].reverse();
  return limit ? result.slice(0, limit) : result;
}

export function getRecentRecords(count: number): PerformanceRecord[] {
  return history.slice(-count);
}

export function getRecordsByDomain(domain: SkillDomain): PerformanceRecord[] {
  return history.filter(r => r.domain === domain);
}

export function getRecentAccuracy(domain?: SkillDomain, windowSize = 20): number {
  const records = domain
    ? history.filter(r => r.domain === domain).slice(-windowSize)
    : history.slice(-windowSize);
  if (records.length === 0) return 0.5;
  return records.filter(r => r.correct).length / records.length;
}

export function getIncorrectByDomain(domain: SkillDomain, limit = 20): PerformanceRecord[] {
  return history
    .filter(r => r.domain === domain && !r.correct)
    .slice(-limit)
    .reverse();
}

export function getIncorrectVocabulary(): string[] {
  // Extract vocabulary-related incorrect answers
  return history
    .filter(r => r.domain === 'vocabulary' && !r.correct && r.questionType)
    .map(r => r.questionType || '')
    .filter(Boolean)
    .slice(-50);
}

export function getIncorrectGrammar(): string[] {
  return history
    .filter(r => r.domain === 'grammar' && !r.correct && r.questionType)
    .map(r => r.questionType || '')
    .filter(Boolean)
    .slice(-50);
}

export function clearHistory(): void {
  history.length = 0;
}

export function getHistorySize(): number {
  return history.length;
}
