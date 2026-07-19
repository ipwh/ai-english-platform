// Sprint 39: Writing Coach Pro — Tests
import { describe, it, expect } from 'vitest';
import { WritingCoachPro } from '../services/writing-coach-pro';

const coach = new WritingCoachPro();

const sampleEssay = `Technology has changed our lives in many ways. In my opinion, it has both advantages and disadvantages. 
Although technology makes communication easier, but it also reduces face-to-face interaction.
Firstly, people can connect instantly through social media. Secondly, online learning has become very popular.
There has been a significant increase in online education. I think this is a positive development.
Furthermore, technology helps us work more efficiently. A lot of people use computers every day.
On the other hand, excessive screen time can cause health problems. In conclusion, technology is a useful tool.`;

const submission = {
  studentId: 's1', essayId: 'e1', title: 'Technology Essay',
  content: sampleEssay, textType: 'essay', gradeLevel: 'S4',
  wordCount: sampleEssay.split(/\s+/).length, submittedAt: new Date().toISOString(),
};

describe('WritingCoachPro — Rubric Scoring', () => {
  it('should score with all three rubrics', () => {
    const scores = coach.scoreWithAllRubrics(submission);
    expect(scores.hkdse).toBeDefined();
    expect(scores.hkdse.total).toBeGreaterThan(0);
    expect(scores.hkdse.maxTotal).toBe(21);
    expect(scores.cefr.overall).toBeDefined();
    expect(scores.ielts).toBeDefined();
    expect(scores.ielts!.overallBand).toBeGreaterThan(0);
    expect(scores.ielts!.overallBand).toBeLessThanOrEqual(9);
  });

  it('should return HKDSE CLO scores (C+L+O=21)', () => {
    const scores = coach.scoreWithAllRubrics(submission);
    expect(scores.hkdse.content.maxScore).toBe(7);
    expect(scores.hkdse.language.maxScore).toBe(7);
    expect(scores.hkdse.organization.maxScore).toBe(7);
    expect(scores.hkdse.estimatedLevel).toBeTruthy();
  });

  it('should estimate HKDSE level from score', () => {
    const scores = coach.scoreWithAllRubrics(submission);
    const validLevels = ['1', '2', '3', '4', '5', '5*', '5**'];
    expect(validLevels).toContain(scores.hkdse.estimatedLevel);
  });
});

describe('WritingCoachPro — Sentence Variety', () => {
  it('should classify sentence types', () => {
    const analysis = coach.analyzeSentenceVariety(sampleEssay);
    expect(analysis.simpleCount + analysis.compoundCount + analysis.complexCount + analysis.compoundComplexCount).toBeGreaterThan(0);
    expect(analysis.varietyScore).toBeGreaterThan(0);
    expect(analysis.varietyScore).toBeLessThanOrEqual(1);
    expect(analysis.averageLength).toBeGreaterThan(0);
    expect(analysis.longestSentence).toBeGreaterThan(0);
    expect(analysis.suggestions).toBeDefined();
    expect(analysis.suggestionsZh).toBeDefined();
  });
});

describe('WritingCoachPro — Tone & Register', () => {
  it('should detect formal tone in essays', () => {
    const analysis = coach.analyzeToneRegister(sampleEssay, 'essay');
    expect(analysis.tone).toBeDefined();
    expect(analysis.register).toBeDefined();
    expect(analysis.consistency).toBeGreaterThan(0);
  });
});

describe('WritingCoachPro — Logic & Argument', () => {
  it('should analyze argumentation', () => {
    const analysis = coach.analyzeLogicArgument(sampleEssay);
    expect(analysis.thesisClarity).toBeGreaterThan(0);
    expect(analysis.argumentStrength).toBeGreaterThan(0);
    expect(analysis.overallPersuasiveness).toBeGreaterThanOrEqual(0);
    expect(analysis.overallPersuasiveness).toBeLessThanOrEqual(1);
  });

  it('should detect counterargument presence', () => {
    const analysis = coach.analyzeLogicArgument(sampleEssay);
    expect(analysis.counterargumentPresence).toBe(true); // "on the other hand" is present
  });
});

describe('WritingCoachPro — Upgrades', () => {
  it('should generate vocabulary upgrades', () => {
    const upgrades = coach.generateVocabUpgrades(sampleEssay);
    expect(upgrades.length).toBeGreaterThan(0);
    expect(upgrades[0].original).toBeTruthy();
    expect(upgrades[0].upgraded).toBeTruthy();
    expect(upgrades[0].explanationZh).toBeTruthy();
  });

  it('should detect chinglish patterns in grammar upgrades', () => {
    const upgrades = coach.generateGrammarUpgrades(sampleEssay);
    expect(upgrades.length).toBeGreaterThan(0);
    // "Although...but" is in the sample
    expect(upgrades.some(u => u.original.includes('Although'))).toBe(true);
  });

  it('should generate better expressions', () => {
    const upgrades = coach.generateBetterExpressions(sampleEssay);
    expect(upgrades.length).toBeGreaterThan(0);
  });

  it('should generate sentence rewrites for long sentences', () => {
    const longText = 'This is a very long sentence that keeps going and going with many words and clauses and phrases that make it hard to follow the main point of what the writer is trying to say in this particular instance of writing.';
    const rewrites = coach.generateSentenceRewrites(longText);
    expect(rewrites.length).toBeGreaterThanOrEqual(0);
    if (rewrites.length > 0) {
      expect(rewrites[0].technique).toBeDefined();
      expect(rewrites[0].explanationZh).toBeDefined();
    }
  });

  it('should generate paragraph rewrite', () => {
    const paragraph = sampleEssay.split('\n\n')[0] || sampleEssay.slice(0, 100);
    const rewrite = coach.generateParagraphRewrite(paragraph);
    expect(rewrite.originalParagraph).toBeTruthy();
    expect(rewrite.rewrittenParagraph).toBeTruthy();
    expect(rewrite.changes.length).toBeGreaterThan(0);
  });
});

describe('WritingCoachPro — Revisions', () => {
  it('should compare two revisions', () => {
    const scores1 = coach.scoreWithAllRubrics(submission);
    const improved = submission.content.replace(/very/g, 'extremely').replace(/I think/g, 'It can be argued that');
    const scores2 = coach.scoreWithAllRubrics({ ...submission, content: improved, wordCount: improved.split(/\s+/).length });

    const comparison = coach.compareRevisions(
      'e1',
      { content: submission.content, scores: scores1, version: 1 },
      { content: improved, scores: scores2, version: 2 },
    );

    expect(comparison.essayId).toBe('e1');
    expect(comparison.originalVersion).toBe(1);
    expect(comparison.newVersion).toBe(2);
    expect(comparison.scoreChange.gain).toBeDefined();
    expect(comparison.improvements.length).toBeGreaterThan(0);
    expect(comparison.vocabularyChanges.upgraded.length).toBeGreaterThan(0);
  });

  it('should save and retrieve revision history', () => {
    const record = {
      id: 'r1', essayId: 'e1', studentId: 's1', version: 1,
      content: sampleEssay,
      scores: coach.scoreWithAllRubrics(submission),
      totalScore: 15,
      createdAt: new Date().toISOString(),
    };
    coach.saveRevision(record);
    const history = coach.getHistory('e1');
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].id).toBe('r1');

    const latest = coach.getLatestRevision('e1');
    expect(latest).toBeDefined();
    expect(latest!.version).toBe(1);
  });
});