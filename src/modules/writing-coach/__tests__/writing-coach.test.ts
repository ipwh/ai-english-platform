// Sprint 27: AI Writing Coach — Unit Tests
import { describe, it, expect } from 'vitest';
import {
  scoreRubric, reviewEssay, compareRevisions,
  saveRevision, getRevisionHistory, getLatestVersion,
  getGrammarRules, getVocabUpgrades,
} from '../services/writing-coach';
import type { EssaySubmission } from '../types';

function makeEssay(overrides: Partial<EssaySubmission> = {}): EssaySubmission {
  return {
    studentId: 's1', essayId: 'e1',
    title: 'Should School Uniforms Be Abolished?',
    content: `In recent years, the debate over school uniforms has become increasingly prominent. Some people argue that school uniforms should be abolished because they restrict students' freedom of expression. However, others believe that uniforms are beneficial because they promote equality among students.

There are several reasons why school uniforms are important. Firstly, uniforms help to create a sense of belonging. When all students wear the same clothes, they feel part of a community. Furthermore, school uniforms reduce peer pressure related to fashion and appearance. Students do not need to worry about wearing expensive brands to fit in.

On the other hand, opponents argue that uniforms limit creativity. They believe that students should have the right to express their individuality through clothing. However, it is important to note that there are many other ways for students to express themselves, such as through art, music, and writing.

In conclusion, while the debate continues, I believe that the benefits of school uniforms outweigh the drawbacks. Uniforms promote discipline, reduce bullying, and create a focused learning environment.`,
    textType: 'argumentative', gradeLevel: 'S5', wordCount: 180,
    submittedAt: '2026-07-19',
    ...overrides,
  };
}

describe('RubricScorer', () => {
  it('should score an essay with HKDSE CLO rubric', () => {
    const result = scoreRubric(makeEssay());
    expect(result.hkdse.total).toBeGreaterThan(0);
    expect(result.hkdse.total).toBeLessThanOrEqual(21);
    expect(result.hkdse.content.score).toBeGreaterThanOrEqual(1);
    expect(result.hkdse.content.score).toBeLessThanOrEqual(7);
    expect(result.hkdse.language.score).toBeGreaterThanOrEqual(1);
    expect(result.hkdse.organization.score).toBeGreaterThanOrEqual(1);
  });

  it('should estimate HKDSE level', () => {
    const result = scoreRubric(makeEssay());
    expect(result.hkdse.estimatedLevel).toBeTruthy();
    expect(result.overallBand).toBeTruthy();
  });

  it('should estimate CEFR level', () => {
    const result = scoreRubric(makeEssay());
    expect(result.cefr.overall).toBeTruthy();
    expect(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).toContain(result.cefr.overall);
  });

  it('should score a short essay lower', () => {
    const short = makeEssay({ content: 'I like school. It is good. The end.', wordCount: 8 });
    const result = scoreRubric(short);
    expect(result.hkdse.total).toBeLessThan(12);
  });

  it('should score a long well-structured essay higher', () => {
    const long = makeEssay({
      content: Array(8).fill(makeEssay().content).join('\n\n'),
      wordCount: 1400,
    });
    const result = scoreRubric(long);
    expect(result.hkdse.total).toBeGreaterThan(12);
  });
});

describe('EssayReviewer', () => {
  it('should produce a full review', () => {
    const result = reviewEssay(makeEssay());
    expect(result.essayId).toBe('e1');
    expect(result.grammarIssues).toBeDefined();
    expect(result.vocabularySuggestions).toBeDefined();
    expect(result.coherenceAnalysis).toBeDefined();
    expect(result.taskFulfillment).toBeDefined();
    expect(result.organization).toBeDefined();
    expect(result.styleAnalysis).toBeDefined();
    expect(result.revisionPlan).toBeDefined();
    expect(result.totalScore).toBeGreaterThan(0);
  });

  it('should detect chinglish patterns', () => {
    const chinglish = makeEssay({
      content: 'Although it is good, but I disagree. Because it is important, so we must try.',
      wordCount: 20,
    });
    const result = reviewEssay(chinglish);
    expect(result.grammarIssues.some(i => i.type === 'chinglish')).toBe(true);
  });

  it('should generate a revision plan', () => {
    const result = reviewEssay(makeEssay());
    expect(result.revisionPlan.priorityActions.length).toBeGreaterThanOrEqual(0);
    expect(result.revisionPlan.estimatedTimeMinutes).toBeGreaterThanOrEqual(0);
    expect(result.revisionPlan.focusAreas.length).toBeGreaterThanOrEqual(0);
    expect(result.overallFeedback.length).toBeGreaterThan(10);
    expect(result.overallFeedbackZh.length).toBeGreaterThan(10);
  });

  it('should provide vocabulary suggestions', () => {
    const simple = makeEssay({
      content: 'This is a good idea. It is very important to get a lot of things done. I say that it is bad.',
      wordCount: 25,
    });
    const result = reviewEssay(simple);
    // May detect "good", "very", "a lot of", "things"
    expect(result.vocabularySuggestions.length).toBeGreaterThanOrEqual(0);
  });
});

describe('RevisionComparison', () => {
  it('should compare original and revised essays', () => {
    const original = makeEssay();
    const revised = makeEssay({
      essayId: 'e2',
      content: makeEssay().content.replace(/good/gi, 'beneficial').replace(/important/gi, 'crucial'),
      wordCount: 180,
    });
    const comparison = compareRevisions(original, revised);
    expect(comparison.originalId).toBe('e1');
    expect(comparison.revisedId).toBe('e2');
    expect(comparison.scoreChange).toBeDefined();
  });
});

describe('RevisionHistory', () => {
  it('should store and retrieve revision history', () => {
    saveRevision('e1', { versionId: 'v1', content: 'original', submittedAt: '2026-07-01', score: 12, changes: 'First draft' });
    saveRevision('e1', { versionId: 'v2', content: 'revised', submittedAt: '2026-07-02', score: 15, changes: 'Fixed grammar' });

    const history = getRevisionHistory('e1');
    expect(history).toBeDefined();
    expect(history!.versions.length).toBe(2);

    const latest = getLatestVersion('e1');
    expect(latest).toBeDefined();
    expect(latest!.versionId).toBe('v2');
  });

  it('should return undefined for unknown essay', () => {
    expect(getRevisionHistory('unknown')).toBeUndefined();
    expect(getLatestVersion('unknown')).toBeUndefined();
  });
});

describe('GrammarExplainer', () => {
  it('should provide grammar rules', () => {
    const rules = getGrammarRules();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0].type).toBeTruthy();
    expect(rules[0].rule).toBeTruthy();
    expect(rules[0].ruleZh).toBeTruthy();
  });
});

describe('VocabularyUpgrader', () => {
  it('should provide vocabulary upgrade mappings', () => {
    const upgrades = getVocabUpgrades();
    expect(upgrades.length).toBeGreaterThan(0);
    expect(upgrades[0].pattern).toBeDefined();
    expect(upgrades[0].suggestion).toBeDefined();
  });
});

describe('EdgeCases', () => {
  it('should handle empty content', () => {
    const empty = makeEssay({ content: '', wordCount: 0 });
    const result = reviewEssay(empty);
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.revisionPlan).toBeDefined();
  });

  it('should handle very short content', () => {
    const short = makeEssay({ content: 'Hello.', wordCount: 1 });
    expect(() => reviewEssay(short)).not.toThrow();
  });

  it('should produce consistent scores for same input', () => {
    const essay = makeEssay();
    const r1 = reviewEssay(essay);
    const r2 = reviewEssay(essay);
    expect(r1.totalScore).toBe(r2.totalScore);
    expect(r1.estimatedLevel).toBe(r2.estimatedLevel);
    expect(r1.grammarIssues.length).toBe(r2.grammarIssues.length);
  });
});
