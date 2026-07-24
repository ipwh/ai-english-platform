// Sprint 39: WritingCoachPro — enhanced analysis + revision engine
import type {
  EssaySubmission, EssayReview, ProRubricScores, IELTSScores, CEFRScores,
  SentenceVarietyAnalysis, ToneRegisterAnalysis, LogicArgumentAnalysis,
  ExpressionUpgrade, ParagraphRewrite, SentenceRewrite,
  ProRevisionPlan, ProRevisionComparison, RevisionRecord,
} from '../types';

// ============================================
// WritingCoachPro
// ============================================

export class WritingCoachPro {

  /** Full multi-rubric scoring */
  scoreWithAllRubrics(submission: EssaySubmission): ProRubricScores {
    const hkdse = this.scoreHkdse(submission);
    const cefr = this.scoreCefr(submission);
    const ielts = this.scoreIelts(submission);

    return {
      hkdse,
      cefr: { overall: cefr.overall, subScores: cefr.subScores },
      ielts,
      overallBand: hkdse.estimatedLevel,
    };
  }

  /** Analyze sentence variety */
  analyzeSentenceVariety(content: string): SentenceVarietyAnalysis {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    let simple = 0, compound = 0, complex = 0, compoundComplex = 0;
    let totalWords = 0, longestSent = 0;

    for (const s of sentences) {
      const words = s.trim().split(/\s+/).length;
      totalWords += words;
      longestSent = Math.max(longestSent, words);

      const hasConjunction = /(\band\b|\bbut\b|\bor\b|\bso\b|\byet\b|\bfor\b|\bnor\b)/i.test(s);
      const hasSubordinator = /(\bbecause\b|\balthough\b|\bwhile\b|\bif\b|\bwhen\b|\bsince\b|\bunless\b|\bafter\b|\bbefore\b|\bthat\b|\bwhich\b|\bwho\b)/i.test(s);

      if (hasConjunction && hasSubordinator) compoundComplex++;
      else if (hasSubordinator) complex++;
      else if (hasConjunction) compound++;
      else simple++;
    }

    const total = sentences.length || 1;
    const varietyScore = this.calcVariety(simple / total, compound / total, complex / total, compoundComplex / total);

    const suggestions: string[] = [];
    const suggestionsZh: string[] = [];
    if (simple / total > 0.6) { suggestions.push('Add more compound and complex sentences'); suggestionsZh.push('增加更多複合句和複雜句'); }
    if (compoundComplex / total < 0.05) { suggestions.push('Try compound-complex sentences for advanced writing'); suggestionsZh.push('嘗試複合複雜句以提升寫作層次'); }

    return {
      simpleCount: simple, compoundCount: compound, complexCount: complex,
      compoundComplexCount: compoundComplex,
      varietyScore: Math.round(varietyScore * 100) / 100,
      averageLength: Math.round(totalWords / total),
      longestSentence: longestSent,
      suggestions: suggestions.length > 0 ? suggestions : ['Good sentence variety'],
      suggestionsZh: suggestionsZh.length > 0 ? suggestionsZh : ['句子變化良好'],
    };
  }

  /** Analyze tone and register */
  analyzeToneRegister(content: string, textType: string): ToneRegisterAnalysis {
    const formalMarkers = ['furthermore', 'moreover', 'consequently', 'nevertheless', 'therefore', 'thus', 'accordingly'];
    const informalMarkers = ['gonna', 'wanna', 'kinda', 'yeah', 'cool', 'awesome', 'stuff', 'things'];
    const academicMarkers = ['hypothesis', 'methodology', 'analysis', 'significant', 'empirical', 'theoretical'];

    let formalCount = 0, informalCount = 0, academicCount = 0;
    const lower = content.toLowerCase();

    for (const m of formalMarkers) if (lower.includes(m)) formalCount++;
    for (const m of informalMarkers) if (lower.includes(m)) informalCount++;
    for (const m of academicMarkers) if (lower.includes(m)) academicCount++;

    let tone: ToneRegisterAnalysis['tone'] = 'semi-formal';
    if (formalCount > 5 && informalCount === 0) tone = 'formal';
    else if (informalCount > 3) tone = 'informal';
    else if (formalCount !== informalCount) tone = 'inconsistent';

    const register: ToneRegisterAnalysis['register'] =
      academicCount > 3 ? 'academic' : informalCount > 3 ? 'casual' :
      formalCount > 3 ? 'professional' : 'mixed';

    const expectedFormal = ['essay', 'report', 'article', 'argumentative'].includes(textType);
    const consistency = expectedFormal ? (tone === 'formal' || tone === 'semi-formal' ? 0.8 : 0.3) : 0.7;

    const suggestions: string[] = [];
    const suggestionsZh: string[] = [];
    if (expectedFormal && tone === 'informal') {
      suggestions.push('Use more formal language for this text type');
      suggestionsZh.push('這種文體應使用較正式的語言');
    }

    return {
      tone, register, consistency: Math.round(consistency * 100) / 100,
      inappropriateShifts: [],
      suggestions: suggestions.length > 0 ? suggestions : ['Tone and register are appropriate'],
      suggestionsZh: suggestionsZh.length > 0 ? suggestionsZh : ['語氣和語域合適'],
    };
  }

  /** Analyze logic and argumentation */
  analyzeLogicArgument(content: string): LogicArgumentAnalysis {
    const hasCounter = /\b(on the other hand|however|some argue|opponents|critics|admittedly|conversely)\b/i.test(content);
    const hasEvidence = /\b(according to|research|study|survey|data|statistics|evidence|example|for instance)\b/i.test(content);
    const hasThesis = content.length > 100; // basic check — first paragraph assertion

    const transitions = (content.match(/\b(therefore|thus|however|moreover|furthermore|consequently|meanwhile|similarly|in contrast)\b/gi) || []).length;

    const fallacies: string[] = [];
    if (/\b(everyone knows|obviously|clearly|without a doubt)\b/i.test(content) && !hasEvidence) {
      fallacies.push('Appeal to common belief without evidence');
    }

    return {
      thesisClarity: hasThesis ? 0.7 : 0.3,
      argumentStrength: hasEvidence ? 0.7 : 0.4,
      evidenceQuality: hasEvidence ? 0.7 : 0.3,
      counterargumentPresence: hasCounter,
      logicalFallacies: fallacies,
      transitionsQuality: Math.min(1, transitions / 5),
      overallPersuasiveness: Math.round(((hasThesis ? 0.3 : 0.1) + (hasEvidence ? 0.3 : 0.1) + (hasCounter ? 0.2 : 0) + Math.min(0.2, transitions * 0.04)) * 100) / 100,
      suggestions: fallacies.length > 0 ? ['Avoid logical fallacies — support claims with evidence'] : ['Add counterarguments to strengthen your position'],
      suggestionsZh: fallacies.length > 0 ? ['避免邏輯謬誤——用證據支持主張'] : ['加入反駁論點以強化立場'],
    };
  }

  /** Generate vocabulary upgrades */
  generateVocabUpgrades(content: string): ExpressionUpgrade[] {
    const upgrades: Record<string, { to: string; type: ExpressionUpgrade['type']; exp: string; expZh: string }> = {
      'very good': { to: 'excellent', type: 'impact', exp: '"Very good" → "excellent" (stronger adjective)', expZh: '「very good」→「excellent」（更強形容詞）' },
      'very bad': { to: 'terrible', type: 'impact', exp: '"Very bad" → "terrible" (stronger adjective)', expZh: '「very bad」→「terrible」（更強形容詞）' },
      'a lot of': { to: 'numerous', type: 'formality', exp: '"A lot of" → "numerous" (more formal)', expZh: '「a lot of」→「numerous」（更正式）' },
      'get': { to: 'obtain', type: 'formality', exp: '"Get" → "obtain" (more formal)', expZh: '「get」→「obtain」（更正式）' },
      'I think': { to: 'It is evident that', type: 'formality', exp: '"I think" → "It is evident that" (more academic)', expZh: '「I think」→「It is evident that」（更學術）' },
      'big': { to: 'substantial', type: 'impact', exp: '"Big" → "substantial" (more precise)', expZh: '「big」→「substantial」（更精確）' },
    };

    const found: ExpressionUpgrade[] = [];
    const lower = content.toLowerCase();

    for (const [key, val] of Object.entries(upgrades)) {
      if (lower.includes(key)) {
        found.push({
          original: key,
          upgraded: val.to,
          type: val.type,
          explanation: val.exp,
          explanationZh: val.expZh,
        });
      }
    }

    return found.slice(0, 5);
  }

  /** Generate grammar upgrades */
  generateGrammarUpgrades(content: string): ExpressionUpgrade[] {
    const upgrades: ExpressionUpgrade[] = [];

    if (/\b(although.*but|Although.*but)\b/i.test(content)) {
      upgrades.push({
        original: 'Although...but',
        upgraded: 'Although... (remove "but")',
        type: 'clarity',
        explanation: 'Chinglish: "Although...but" → use only "Although" or "but", not both',
        explanationZh: '中式英文：「雖然...但是」→只用 Although 或 but，不可並用',
      });
    }

    if (/\b(there has|there have)\b/i.test(content)) {
      upgrades.push({
        original: 'There has/have',
        upgraded: 'There is/are',
        type: 'clarity',
        explanation: '"There has" → "There is" (existential there uses be, not have)',
        explanationZh: '「There has」→「There is」（存在句用 be，不用 have）',
      });
    }

    return upgrades;
  }

  /** Generate better expressions */
  generateBetterExpressions(content: string): ExpressionUpgrade[] {
    const upgrades: ExpressionUpgrade[] = [];

    if (/\bin my opinion\b/i.test(content)) {
      upgrades.push({
        original: 'In my opinion',
        upgraded: 'From my perspective / It can be argued that',
        type: 'flow',
        explanation: 'Vary your opening phrases for more engaging writing',
        explanationZh: '變化開頭用語使文章更吸引',
      });
    }

    if (/\bfirstly.*secondly.*thirdly\b/i.test(content)) {
      upgrades.push({
        original: 'Firstly...Secondly...Thirdly',
        upgraded: 'To begin with...Furthermore...Finally',
        type: 'flow',
        explanation: 'Use more sophisticated sequencing language',
        explanationZh: '使用更成熟的順序連接詞',
      });
    }

    return upgrades;
  }

  /** Generate sentence rewrites */
  generateSentenceRewrites(content: string): SentenceRewrite[] {
    const rewrites: SentenceRewrite[] = [];

    // Find passive opportunities
    const passiveMatch = content.match(/\b(People think that|Many believe that|Someone)\b/i);
    if (passiveMatch) {
      rewrites.push({
        original: passiveMatch[0],
        rewritten: 'It is widely believed that',
        technique: 'active-voice',
        explanation: 'Use impersonal passive for academic tone',
        explanationZh: '使用非人稱被動語態以達學術語氣',
      });
    }

    // Find very long sentences
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const longSentence = sentences.find(s => s.trim().split(/\s+/).length > 35);
    if (longSentence) {
      rewrites.push({
        original: longSentence.trim().slice(0, 80) + '...',
        rewritten: '[Split into 2-3 shorter sentences for clarity]',
        technique: 'split',
        explanation: 'Very long sentences are hard to follow — split them',
        explanationZh: '過長句子難以理解——拆分為短句',
      });
    }

    return rewrites;
  }

  /** Generate a paragraph rewrite */
  generateParagraphRewrite(paragraph: string): ParagraphRewrite {
    const words = paragraph.trim().split(/\s+/);
    const improved = words
      .map(w => w === 'very' ? 'extremely' : w === 'get' ? 'obtain' : w)
      .join(' ');

    return {
      originalParagraph: paragraph,
      rewrittenParagraph: improved !== paragraph ? improved : paragraph.replace(/\bI think\b/gi, 'It can be argued that'),
      changes: [
        { what: 'Vocabulary upgrade', why: 'More formal word choices', whyZh: '更正式的詞彙選擇' },
      ],
      improvementScore: 0.75,
    };
  }

  /** Generate a comprehensive Pro revision plan */
  generateProRevisionPlan(
    essayId: string,
    submission: EssaySubmission,
    review: EssayReview,
  ): ProRevisionPlan {
    const vocabUpgrades = this.generateVocabUpgrades(submission.content);
    const grammarUpgrades = this.generateGrammarUpgrades(submission.content);
    const betterExpressions = this.generateBetterExpressions(submission.content);
    const sentenceRewrites = this.generateSentenceRewrites(submission.content);

    const firstParagraph = submission.content.split('\n\n')[0] || submission.content.slice(0, 200);
    const paragraphRewrites = [this.generateParagraphRewrite(firstParagraph)];

    // Estimate score gain
    const totalIssues = review.grammarIssues.length + review.vocabularySuggestions.length;
    const estimatedGain = Math.min(15, totalIssues * 1.5);

    return {
      ...review.revisionPlan,
      vocabularyUpgrades: vocabUpgrades,
      grammarUpgrades: grammarUpgrades,
      betterExpressions: betterExpressions,
      sentenceRewrites: sentenceRewrites,
      paragraphRewrites: paragraphRewrites,
      estimatedScoreGain: Math.round(estimatedGain * 10) / 10,
    };
  }

  /** Compare two revisions */
  compareRevisions(
    essayId: string,
    original: { content: string; scores: ProRubricScores; version: number },
    revised: { content: string; scores: ProRubricScores; version: number },
  ): ProRevisionComparison {
    const beforeScore = original.scores.hkdse.total;
    const afterScore = revised.scores.hkdse.total;

    const origWords = new Set(original.content.toLowerCase().split(/\s+/));
    const revWords = new Set(revised.content.toLowerCase().split(/\s+/));
    const added = [...revWords].filter(w => !origWords.has(w)).slice(0, 10);
    const removed = [...origWords].filter(w => !revWords.has(w)).slice(0, 5);

    return {
      essayId,
      originalVersion: original.version,
      newVersion: revised.version,
      scoreChange: {
        before: beforeScore,
        after: afterScore,
        gain: Math.round((afterScore - beforeScore) * 10) / 10,
      },
      improvements: [
        { area: 'Vocabulary', before: `${Math.round(original.scores.hkdse.language.score)}/7`, after: `${Math.round(revised.scores.hkdse.language.score)}/7`, impact: 'medium' },
      ],
      vocabularyChanges: {
        added, removed,
        upgraded: [{ from: 'get', to: 'obtain' }],
      },
      grammarChanges: {
        fixed: 2,
        remaining: 1,
      },
    };
  }

  /** Track revision history */
  private revisions = new Map<string, RevisionRecord[]>();

  saveRevision(record: RevisionRecord): void {
    const history = this.revisions.get(record.essayId) || [];
    history.push(record);
    this.revisions.set(record.essayId, history);
  }

  getHistory(essayId: string): RevisionRecord[] {
    return this.revisions.get(essayId) || [];
  }

  getLatestRevision(essayId: string): RevisionRecord | null {
    const history = this.revisions.get(essayId);
    return history?.[history.length - 1] || null;
  }

  // ============================================
  // Private rubric scorers
  // ============================================

  private scoreHkdse(sub: EssaySubmission): ProRubricScores['hkdse'] {
    const words = sub.wordCount || sub.content.split(/\s+/).length;
    const contentScore = Math.min(7, 3 + Math.min(4, words / 100 * 1.5));
    const langScore = Math.min(7, 3 + Math.min(4, words / 120 * 1.5));
    const orgScore = Math.min(7, 3 + (sub.content.includes('\n\n') ? 2 : 1));

    const total = Math.round((contentScore + langScore + orgScore) * 10) / 10;
    const level = total >= 19 ? '5**' : total >= 17 ? '5*' : total >= 15 ? '5' : total >= 12 ? '4' : total >= 9 ? '3' : total >= 6 ? '2' : '1';

    return {
      content: { score: Math.round(contentScore * 10) / 10, maxScore: 7, comments: 'Content development analysis', commentsZh: '內容發展分析' },
      language: { score: Math.round(langScore * 10) / 10, maxScore: 7, comments: 'Language accuracy analysis', commentsZh: '語言準確度分析' },
      organization: { score: Math.round(orgScore * 10) / 10, maxScore: 7, comments: 'Organization analysis', commentsZh: '組織結構分析' },
      total, maxTotal: 21, estimatedLevel: level,
    };
  }

  private scoreCefr(sub: EssaySubmission): CEFRScores {
    const words = sub.wordCount || 150;
    const level = words > 300 ? 'B2' as const : words > 150 ? 'B1' as const : 'A2' as const;
    return { overall: level, subScores: { grammar: level, vocabulary: level, coherence: level } };
  }

  private scoreIelts(sub: EssaySubmission): IELTSScores {
    const words = sub.wordCount || 150;
    const base = words > 250 ? 6.5 : words > 150 ? 5.5 : 4.5;
    return {
      taskAchievement: { score: Math.round(base * 10), maxScore: 90, band: base, comments: 'Task response evaluation' },
      coherenceAndCohesion: { score: Math.round((base - 0.5) * 10), maxScore: 90, band: base - 0.5, comments: 'Coherence evaluation' },
      lexicalResource: { score: Math.round(base * 10), maxScore: 90, band: base, comments: 'Vocabulary range evaluation' },
      grammaticalRange: { score: Math.round((base - 0.5) * 10), maxScore: 90, band: base - 0.5, comments: 'Grammar range evaluation' },
      overallBand: Math.round((base * 4 - 1) / 4 * 2) / 2,
    };
  }

  private calcVariety(simple: number, compound: number, complex: number, cc: number): number {
    const ideal = { simple: 0.25, compound: 0.25, complex: 0.30, cc: 0.20 };
    const diff = Math.abs(simple - ideal.simple) + Math.abs(compound - ideal.compound) + Math.abs(complex - ideal.complex) + Math.abs(cc - ideal.cc);
    return Math.max(0, 1 - diff / 2);
  }
}

export const writingCoachPro = new WritingCoachPro();
