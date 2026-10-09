// Sprint 8: Skill Tracker — maps practice data to skill dimensions
import type { SkillDimension, SkillStats } from '../types';

/** Map a skill string to its HKDSE dimension */
export function mapToDimension(skill: string): SkillDimension {
  const s = skill.toLowerCase();
  if (s.includes('grammar') || s.includes('tense') || s.includes('clause') || s.includes('voice') || s.includes('conditional') || s.includes('modal') || s.includes('preposition') || s.includes('article') || s.includes('connector') || s.includes('inversion') || s.includes('subjunctive') || s.includes('participle') || s.includes('gerund') || s.includes('phrasal') || s.includes('sentence') || s.includes('subject-verb') || s.includes('reported-speech')) return 'grammar';
  if (s.includes('vocab') || s.includes('word') || s.includes('collocation') || s.includes('idiom')) return 'vocabulary';
  if (s.includes('writ')) return 'writing';
  if (s.includes('read')) return 'reading';
  if (s.includes('speak') || s.includes('oral')) return 'speaking';
  if (s.includes('listen')) return 'listening';
  return 'grammar'; // default
}

export interface PracticeRecord {
  skillId: string;
  skillName?: string;
  skillNameZh?: string;
  correct: boolean;
  practicedAt: Date;
}

/** Aggregate practice records into per-dimension stats */
export function aggregateSkillStats(records: PracticeRecord[]): Record<SkillDimension, SkillStats> {
  const dimensions: SkillDimension[] = ['grammar', 'vocabulary', 'writing', 'reading', 'speaking', 'listening'];
  const result = {} as Record<SkillDimension, SkillStats>;

  for (const dim of dimensions) {
    result[dim] = { dimension: dim, totalAttempts: 0, correctAttempts: 0, accuracy: 0, subSkills: [] };
  }

  // Group by dimension → sub-skill
  const subMap = new Map<SkillDimension, Map<string, { name: string; nameZh: string; attempts: number; correct: number; lastAt: Date }>>();
  for (const dim of dimensions) subMap.set(dim, new Map());

  for (const record of records) {
    const dim = mapToDimension(record.skillId);
    result[dim].totalAttempts++;
    if (record.correct) result[dim].correctAttempts++;
    if (!result[dim].lastPracticedAt || record.practicedAt > result[dim].lastPracticedAt) {
      result[dim].lastPracticedAt = record.practicedAt;
    }

    const sub = subMap.get(dim)!;
    const existing = sub.get(record.skillId);
    if (existing) {
      existing.attempts++;
      if (record.correct) existing.correct++;
      if (record.practicedAt > existing.lastAt) existing.lastAt = record.practicedAt;
    } else {
      sub.set(record.skillId, {
        name: record.skillName || record.skillId,
        nameZh: record.skillNameZh || record.skillId,
        attempts: 1,
        correct: record.correct ? 1 : 0,
        lastAt: record.practicedAt,
      });
    }
  }

  for (const dim of dimensions) {
    const stats = result[dim];
    stats.accuracy = stats.totalAttempts > 0 ? stats.correctAttempts / stats.totalAttempts : 0;
    stats.subSkills = [...subMap.get(dim)!.entries()].map(([skillId, s]) => ({
      skillId, name: s.name, nameZh: s.nameZh,
      attempts: s.attempts, correct: s.correct,
      accuracy: s.attempts > 0 ? s.correct / s.attempts : 0,
      lastPracticedAt: s.lastAt,
    })).sort((a, b) => b.attempts - a.attempts);
  }

  return result;
}
