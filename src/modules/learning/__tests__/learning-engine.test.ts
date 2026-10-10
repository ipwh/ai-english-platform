// Sprint 7: Learning Engine Tests
import { describe, it, expect } from 'vitest';
import {
  GRAMMAR_GRAPH, getSkill, getAllPrerequisites, getDependents,
  getSkillsForLevel, topologicalSort,
} from '../services/knowledge-graph';
import { calculateMastery, isMastered, type PracticeEntry } from '../services/mastery-calculator';
import { analyzeWeaknesses, getTrueWeaknesses } from '../services/weakness-analyzer';
import { generateLearningPath, getRecommendedSteps } from '../services/learning-path';
import { getRecommendations } from '../services/adaptive-recommendation';

// ============================================
// Knowledge Graph Tests
// ============================================

describe('KnowledgeGraph', () => {
  it('should have 31 skills in the graph', () => {
    expect(GRAMMAR_GRAPH.length).toBe(31);
  });

  it('should return correct skill by ID', () => {
    const skill = getSkill('present-perfect');
    expect(skill?.name).toBe('Present Perfect Tense');
    expect(skill?.prerequisites).toContain('tenses-simple');
    expect(skill?.prerequisites).toContain('tenses-continuous');
  });

  it('should return all prerequisites recursively', () => {
    const prereqs = getAllPrerequisites('reported-speech');
    // reported-speech depends on relative-clauses, tenses-continuous
    // relative-clauses depends on sentence-structure, passive-voice
    // passive-voice depends on present-perfect, tenses-continuous, subject-verb-agreement
    // etc.
    expect(prereqs).toContain('relative-clauses');
    expect(prereqs).toContain('tenses-continuous');
    expect(prereqs).toContain('passive-voice');
    expect(prereqs).toContain('present-perfect');
    expect(prereqs.length).toBeGreaterThan(5);
  });

  it('should find dependents (reverse lookup)', () => {
    const deps = getDependents('present-perfect');
    expect(deps).toContain('passive-voice');
    expect(deps).toContain('conditionals-type-2-3');
    expect(deps).toContain('modal-verbs-advanced');
  });

  it('should filter skills by grade level', () => {
    const s1 = getSkillsForLevel('S1');
    expect(s1.every(s => ['S1'].includes(s.dseLevel))).toBe(true);
    const s3 = getSkillsForLevel('S3');
    expect(s3.some(s => s.dseLevel === 'S3')).toBe(true);
    expect(s3.some(s => s.dseLevel === 'S4')).toBe(false);
  });

  it('should topologically sort without cycles', () => {
    const sorted = topologicalSort();
    expect(sorted.length).toBe(GRAMMAR_GRAPH.length);

    // Verify no skill appears before its prerequisites
    const positions = new Map<string, number>();
    sorted.forEach((s, i) => positions.set(s.id, i));
    for (const skill of sorted) {
      for (const prereq of skill.prerequisites) {
        expect(positions.get(prereq)!).toBeLessThan(positions.get(skill.id)!);
      }
    }
  });

  it('should have correct dependency chain', () => {
    // Verify the example chain: Present Perfect → Passive Voice → Relative Clause → Reported Speech
    const pv = getSkill('passive-voice')!;
    const rc = getSkill('relative-clauses')!;
    const rs = getSkill('reported-speech')!;

    expect(pv.prerequisites).toContain('present-perfect');
    expect(rc.prerequisites).toContain('passive-voice');
    expect(rs.prerequisites).toContain('relative-clauses');
  });
});

// ============================================
// Mastery Calculator Tests
// ============================================

describe('MasteryCalculator', () => {
  it('should return 0 for no practice', () => {
    const result = calculateMastery([]);
    expect(result.score).toBe(0);
  });

  it('should calculate high mastery for consistent correct answers', () => {
    const entries: PracticeEntry[] = [
      { skillId: 'tenses-simple', correct: true, practicedAt: new Date() },
      { skillId: 'tenses-simple', correct: true, practicedAt: new Date() },
      { skillId: 'tenses-simple', correct: true, practicedAt: new Date() },
      { skillId: 'tenses-simple', correct: true, practicedAt: new Date() },
      { skillId: 'tenses-simple', correct: true, practicedAt: new Date() },
    ];
    const result = calculateMastery(entries);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.accuracy).toBe(1);
    expect(isMastered(result)).toBe(true);
  });

  it('should calculate low mastery for mostly wrong answers', () => {
    const entries: PracticeEntry[] = [
      { skillId: 'passive-voice', correct: false, practicedAt: new Date() },
      { skillId: 'passive-voice', correct: false, practicedAt: new Date() },
      { skillId: 'passive-voice', correct: true, practicedAt: new Date() },
    ];
    const result = calculateMastery(entries);
    expect(result.score).toBeLessThan(70);
    expect(isMastered(result)).toBe(false);
  });

  it('should decay mastery for old practice', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30); // 30 days ago
    const entries: PracticeEntry[] = [
      { skillId: 'tenses-simple', correct: true, practicedAt: oldDate },
      { skillId: 'tenses-simple', correct: true, practicedAt: oldDate },
      { skillId: 'tenses-simple', correct: true, practicedAt: oldDate },
    ];
    const result = calculateMastery(entries);
    expect(result.daysSinceLastPractice).toBeGreaterThanOrEqual(29);
    // Should still pass threshold but score should be lower than fresh
    expect(result.score).toBeLessThan(90);
  });

  it('should require minimum attempts for mastery', () => {
    const entries: PracticeEntry[] = [
      { skillId: 'tenses-simple', correct: true, practicedAt: new Date() },
    ];
    const result = calculateMastery(entries);
    expect(isMastered(result)).toBe(false); // Only 1 attempt
  });
});

// ============================================
// Weakness Analyzer Tests
// ============================================

describe('WeaknessAnalyzer', () => {
  function makeMastery(skillId: string, score: number, attempts = 5): [string, ReturnType<typeof calculateMastery>] {
    const entries: PracticeEntry[] = Array.from({ length: attempts }, (_, i) => ({
      skillId,
      correct: i < Math.round(score / 100 * attempts),
      practicedAt: new Date(),
    }));
    return [skillId, calculateMastery(entries)];
  }

  it('should identify true weakness when prereqs are mastered', () => {
    const mastery = new Map([
      makeMastery('tenses-simple', 90),
      makeMastery('tenses-continuous', 85),
      makeMastery('present-perfect', 40), // Weak!
    ]);
    const weaknesses = getTrueWeaknesses(mastery, 'S3');
    const pp = weaknesses.find(w => w.skillId === 'present-perfect');
    expect(pp).toBeDefined();
    expect(pp!.isTrueWeakness).toBe(true);
    expect(pp!.priority).toBe('medium');
  });

  it('should NOT flag as true weakness when prerequisites are missing', () => {
    const mastery = new Map([
      makeMastery('tenses-simple', 90),
      // tenses-continuous is missing — not mastered
      makeMastery('present-perfect', 40),
    ]);
    const weaknesses = analyzeWeaknesses(mastery, 'S3');
    const pp = weaknesses.find(w => w.skillId === 'present-perfect');
    expect(pp).toBeDefined();
    expect(pp!.isTrueWeakness).toBe(false);
    expect(pp!.missingPrerequisites).toContain('tenses-continuous');
  });

  it('should skip mastered skills', () => {
    const mastery = new Map([
      makeMastery('tenses-simple', 95),
    ]);
    const weaknesses = analyzeWeaknesses(mastery, 'S1');
    expect(weaknesses.length).toBe(0);
  });
});

// ============================================
// Learning Path Tests
// ============================================

describe('LearningPath', () => {
  it('should generate path with correct statuses', () => {
    const mastery = new Map<string, ReturnType<typeof calculateMastery>>();
    const path = generateLearningPath(mastery, 'S3');

    // Foundation skills should be "recommended" (no prereqs, not started)
    const simple = path.find(s => s.skillId === 'tenses-simple');
    expect(simple?.status).toBe('recommended');

    // Skills with unmet prereqs should be "locked"
    const passive = path.find(s => s.skillId === 'passive-voice');
    expect(passive?.status).toBe('locked');
  });

  it('should mark mastered skills correctly', () => {
    const entries: PracticeEntry[] = [
      { skillId: 'tenses-simple', correct: true, practicedAt: new Date() },
      { skillId: 'tenses-simple', correct: true, practicedAt: new Date() },
      { skillId: 'tenses-simple', correct: true, practicedAt: new Date() },
      { skillId: 'tenses-simple', correct: true, practicedAt: new Date() },
    ];
    const allMastery = new Map([[ 'tenses-simple', calculateMastery(entries) ]]);
    const path = generateLearningPath(allMastery, 'S1');
    const simple = path.find(s => s.skillId === 'tenses-simple');
    expect(simple?.status).toBe('mastered');
  });

  it('should return recommended steps', () => {
    const path = generateLearningPath(new Map(), 'S1');
    const recommended = getRecommendedSteps(path);
    expect(recommended.length).toBeGreaterThan(0);
    expect(recommended.every(s => s.status === 'recommended')).toBe(true);
  });
});

// ============================================
// Adaptive Recommendation Tests
// ============================================

describe('AdaptiveRecommendation', () => {
  function makeMastery(skillId: string, score: number, attempts = 5): [string, ReturnType<typeof calculateMastery>] {
    const entries: PracticeEntry[] = Array.from({ length: attempts }, (_, i) => ({
      skillId,
      correct: i < Math.round(score / 100 * attempts),
      practicedAt: new Date(),
    }));
    return [skillId, calculateMastery(entries)];
  }

  it('should recommend true weaknesses first', () => {
    const mastery = new Map([
      makeMastery('tenses-simple', 90),
      makeMastery('tenses-continuous', 85),
      makeMastery('subject-verb-agreement', 80),
      makeMastery('present-perfect', 35), // True weakness
    ]);
    const recs = getRecommendations(mastery, 'S3', 5);
    // First recommendation should be the weakness
    expect(recs[0].skillId).toBe('present-perfect');
    expect(recs[0].priority).toBe('high');
  });

  it('should limit to max recommendations', () => {
    const recs = getRecommendations(new Map(), 'S6', 3);
    expect(recs.length).toBeLessThanOrEqual(3);
  });

  it('should include learning path recommendations for new students', () => {
    const recs = getRecommendations(new Map(), 'S1', 5);
    // For a new S1 student with no practice, should recommend foundation skills
    const foundationRecs = recs.filter(r => r.reason === 'next-in-path');
    expect(foundationRecs.length).toBeGreaterThan(0);
    expect(foundationRecs[0].priority).toBe('medium');
  });
});
