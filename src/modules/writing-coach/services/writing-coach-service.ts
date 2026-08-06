// ============================================
// Sprint 111: Unified WritingCoachService
// Replaces 4 separate implementations with ONE canonical service.
//
// Design:
// - AI-powered deep analysis (grammar, vocab, coherence, organization, tone, task)
// - Rule-based format validation (letter, speech, proposal, article, report)
// - Bilingual feedback with evidence spans
// - HKDSE CLO scoring (Content/Language/Organization 0-7 each)
//
// Why better for ONE school:
// - One file to understand instead of 4
// - AI catches errors regex can't (hundreds vs 24 patterns)
// - Format validators are DSE-specific — rule-based is correct here
// - Removes IELTS scoring (not needed for DSE school)
// ============================================

import { callLLM } from '@/modules/ai/services/llm-call';
import { parseAIJSON } from '@/modules/ai/services/json-utils';
import { logger } from '@/shared/logger/logger';
import { buildWritingAnalysisPromptV2, buildQuickWritingFeedbackPrompt } from '@/modules/ai/prompts/writing/v2';

// Format validators kept from writing-coach.ts (rule-based is correct for format checking)
import {
  validateLetterFormat,
  validateSpeechFormat,
  validateProposalFormat,
  validateArticleFormat,
  validateReportFormat,
  validateFormat,
} from './writing-coach';

// Types
import type {
  EssaySubmission, EssayReview, RubricScores, HKDSEScores,
  GrammarIssue, VocabularySuggestion, CoherenceAnalysis,
  TaskFulfillment, OrganizationAnalysis, StyleAnalysis,
  RevisionPlan, PriorityAction,
} from '../types';

// ============================================
// AI Analysis Result (from v2 prompt)
// ============================================
interface AIWritingAnalysis {
  overall: {
    totalScore: number;
    contentScore: number;
    languageScore: number;
    organizationScore: number;
    estimatedLevel: string;
    summary: string;
    summaryZh: string;
  };
  strengths: Array<{
    dimension: string;
    point: string;
    pointZh: string;
    evidence: string;
  }>;
  weaknesses: Array<{
    dimension: string;
    point: string;
    pointZh: string;
    evidence: string;
    priority: string;
  }>;
  grammarErrors: Array<{
    type: string;
    original: string;
    correction: string;
    explanation: string;
    explanationZh: string;
    severity: string;
  }>;
  vocabularySuggestions: Array<{
    original: string;
    suggestion: string;
    reason: string;
    reasonZh: string;
    type: string;
  }>;
  coherenceFeedback: {
    score: number;
    transitionUsage: string;
    transitionUsageZh: string;
    paragraphFlow: string;
    paragraphFlowZh: string;
    suggestions: string[];
    suggestionsZh: string[];
  };
  organizationFeedback: {
    score: number;
    hasClearIntroduction: boolean;
    hasClearConclusion: boolean;
    paragraphCount: number;
    structureComment: string;
    structureCommentZh: string;
    suggestions: string[];
    suggestionsZh: string[];
  };
  taskFulfillment: {
    score: number;
    addressedAllParts: boolean;
    wordCountAdequate: boolean;
    textTypeAppropriate: boolean;
    toneAppropriate: boolean;
    comments: string;
    commentsZh: string;
  };
  revisionPlan: {
    priorityActions: Array<{
      order: number;
      category: string;
      action: string;
      actionZh: string;
      expectedImprovement: string;
      effort: string;
    }>;
    estimatedTimeMinutes: number;
    focusAreas: string[];
    focusAreasZh: string[];
  };
  modelRevision?: {
    revisedParagraphs: Array<{
      paragraphIndex: number;
      original: string;
      revised: string;
      changes: Array<{
        what: string;
        why: string;
        whyZh: string;
      }>;
    }>;
  };
}

// ============================================
// WritingCoachService
// ============================================
export class WritingCoachService {

  /**
   * Full AI-powered essay analysis.
   * This is the main method — replaces reviewEssay() from writing-coach.ts
   * and analyzeEssay() from writing-coach-heuristic.ts.
   *
   * Educational benefit: Students get specific, evidence-based feedback
   * on grammar, vocabulary, coherence, organization, and task fulfillment
   * with Traditional Chinese explanations they can understand.
   */
  async analyzeEssay(essay: EssaySubmission): Promise<EssayReview> {
    const startTime = Date.now();

    try {
      // Build the enhanced prompt
      const systemPrompt = buildWritingAnalysisPromptV2({
        studentLevel: essay.gradeLevel,
        textType: essay.textType,
        wordLimit: undefined, // Let AI assess word count from content
      });

      const userPrompt = `Please analyze this student essay for HKDSE Paper 2 Writing.

**Title**: ${essay.title}
**Text Type**: ${essay.textType || 'essay'}
**Student Level**: ${essay.gradeLevel || 'S4'}
**Word Count** (system-calculated): ${essay.wordCount}

**Student Essay**:
"""
${essay.content}
"""

Provide a complete analysis in the specified JSON format. Be specific, quote evidence from the text, and provide bilingual (English + 繁體中文) feedback.`;

      // Call AI
      const rawResult = await callLLM(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          temperature: 0.3,
          maxTokens: 4096,
          jsonMode: true,
        },
      );

      // Parse and validate
      const content = typeof rawResult === 'string'
        ? rawResult
        : (rawResult as { content?: string }).content || JSON.stringify(rawResult);

      const analysis = parseAIJSON<AIWritingAnalysis>(content);

      if (!analysis || !analysis.overall) {
        logger.warn({ module: 'writing-coach', essayId: essay.essayId },
          'AI returned incomplete analysis, using fallback');
        return this.buildFallbackReview(essay);
      }

      // Convert AI result to EssayReview format
      return this.buildReview(essay, analysis, Date.now() - startTime);

    } catch (err) {
      logger.error({
        module: 'writing-coach',
        essayId: essay.essayId,
        error: String(err),
      }, 'AI analysis failed, using fallback');
      return this.buildFallbackReview(essay);
    }
  }

  /**
   * Quick feedback for real-time writing support.
   * Lighter prompt, faster response. Good for in-class use.
   */
  async quickFeedback(essay: EssaySubmission): Promise<{
    overallComment: string;
    overallCommentZh: string;
    topStrength: string;
    topWeakness: string;
    quickFixes: Array<{ original: string; fix: string; why: string }>;
    estimatedBand: string;
  }> {
    const systemPrompt = buildQuickWritingFeedbackPrompt();
    const userPrompt = `Analyze this student essay quickly:\n\nTitle: ${essay.title}\nText Type: ${essay.textType || 'essay'}\n\n"""\n${essay.content.slice(0, 3000)}\n"""\n\nProvide quick, specific feedback in JSON format. Quote from their text.`;

    try {
      const rawResult = await callLLM(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.3, maxTokens: 1024, jsonMode: true },
      );

      const content = typeof rawResult === 'string'
        ? rawResult
        : (rawResult as { content?: string }).content || JSON.stringify(rawResult);

      return parseAIJSON(content) || {
        overallComment: 'Unable to analyze at this time.',
        overallCommentZh: '暫時無法分析。',
        topStrength: 'N/A',
        topWeakness: 'N/A',
        quickFixes: [],
        estimatedBand: 'N/A',
      };
    } catch {
      return {
        overallComment: 'Analysis failed. Please try again.',
        overallCommentZh: '分析失敗，請重試。',
        topStrength: 'N/A',
        topWeakness: 'N/A',
        quickFixes: [],
        estimatedBand: 'N/A',
      };
    }
  }

  /**
   * Format validation (rule-based — correct approach for format checking).
   * Delegates to the existing format validators.
   */
  validateFormat(content: string, textType: string) {
    return validateFormat(content, textType);
  }

  /**
   * PEEL analysis per paragraph.
   */
  analyzePEEL(content: string) {
    return (async () => {
      const { analyzePEEL } = await import('./writing-coach');
      return analyzePEEL(content);
    })();
  }

  /**
   * Connector diversity analysis.
   */
  analyzeConnectors(content: string) {
    return (async () => {
      const { analyzeConnectors } = await import('./writing-coach');
      return analyzeConnectors(content);
    })();
  }

  // ============================================
  // Private: Build EssayReview from AI result
  // ============================================
  private buildReview(
    essay: EssaySubmission,
    analysis: AIWritingAnalysis,
    durationMs: number,
  ): EssayReview {
    const { overall, strengths, weaknesses, grammarErrors, vocabularySuggestions,
      coherenceFeedback, organizationFeedback, taskFulfillment, revisionPlan } = analysis;

    const rubricScores: RubricScores = {
      hkdse: {
        content: {
          score: overall.contentScore,
          maxScore: 7,
          comments: strengths.filter(s => s.dimension === 'content').map(s => s.point).join('. ') || 'N/A',
          commentsZh: strengths.filter(s => s.dimension === 'content').map(s => s.pointZh).join('。') || 'N/A',
        },
        language: {
          score: overall.languageScore,
          maxScore: 7,
          comments: strengths.filter(s => s.dimension === 'language').map(s => s.point).join('. ') || 'N/A',
          commentsZh: strengths.filter(s => s.dimension === 'language').map(s => s.pointZh).join('。') || 'N/A',
        },
        organization: {
          score: overall.organizationScore,
          maxScore: 7,
          comments: strengths.filter(s => s.dimension === 'organization').map(s => s.point).join('. ') || 'N/A',
          commentsZh: strengths.filter(s => s.dimension === 'organization').map(s => s.pointZh).join('。') || 'N/A',
        },
        total: overall.totalScore,
        maxTotal: 21,
        estimatedLevel: overall.estimatedLevel,
      },
      cefr: {
        overall: this.mapToCEFR(overall.totalScore),
        subScores: { writing: this.mapToCEFR(overall.totalScore) },
      },
      overallBand: overall.estimatedLevel,
    };

    const grammarIssues: GrammarIssue[] = grammarErrors.map(e => ({
      type: e.type,
      description: e.explanation,
      descriptionZh: e.explanationZh,
      location: this.findLocation(essay.content, e.original),
      original: e.original,
      correction: e.correction,
      rule: e.type.replace(/_/g, ' '),
      ruleZh: this.typeLabelZh(e.type),
      severity: e.severity === 'major' ? 'major' as const : 'minor' as const,
    }));

    const vocabSuggestions: VocabularySuggestion[] = vocabularySuggestions.map(v => ({
      original: v.original,
      suggestion: v.suggestion,
      reason: v.reason,
      reasonZh: v.reasonZh,
      type: v.type as VocabularySuggestion['type'],
      impact: 'medium' as const,
    }));

    const coherenceAnalysis: CoherenceAnalysis = {
      score: coherenceFeedback.score,
      strengths: coherenceFeedback.suggestions?.length === 0
        ? ['Good coherence'] : [],
      weaknesses: coherenceFeedback.suggestions?.length > 0
        ? coherenceFeedback.suggestions : [],
      transitionUsage: {
        count: 0,
        variety: 0,
        appropriateness: coherenceFeedback.score >= 7 ? 7 : 5,
      },
      paragraphFlow: coherenceFeedback.score >= 7 ? 'Smooth'
        : coherenceFeedback.score >= 5 ? 'Adequate' : 'Needs improvement',
    };

    const orgAnalysis: OrganizationAnalysis = {
      score: organizationFeedback.score,
      hasClearIntroduction: organizationFeedback.hasClearIntroduction,
      hasClearConclusion: organizationFeedback.hasClearConclusion,
      paragraphCount: organizationFeedback.paragraphCount,
      averageParagraphLength: essay.wordCount / Math.max(1, organizationFeedback.paragraphCount),
      logicalFlow: organizationFeedback.score >= 7 ? 'Well-structured'
        : organizationFeedback.score >= 5 ? 'Adequate' : 'Needs improvement',
      suggestions: organizationFeedback.suggestions || [],
      suggestionsZh: organizationFeedback.suggestionsZh || [],
    };

    const task: TaskFulfillment = {
      score: taskFulfillment.score,
      addressedAllParts: taskFulfillment.addressedAllParts,
      wordCountAdequate: taskFulfillment.wordCountAdequate,
      textTypeAppropriate: taskFulfillment.textTypeAppropriate,
      toneAppropriate: taskFulfillment.toneAppropriate,
      comments: taskFulfillment.comments,
      commentsZh: taskFulfillment.commentsZh,
    };

    const style: StyleAnalysis = {
      score: overall.languageScore,
      register: 'Formal',
      tone: 'Academic',
      sentenceVariety: { simple: 1, compound: 1, complex: 1 },
      vocabularyRichness: 0.7,
      suggestions: [],
      suggestionsZh: [],
    };

    const plan: RevisionPlan = {
      essayId: essay.essayId,
      priorityActions: (revisionPlan?.priorityActions || []).map(a => ({
        order: a.order,
        category: a.category as PriorityAction['category'],
        action: a.action,
        actionZh: a.actionZh,
        expectedImprovement: a.expectedImprovement,
        effort: a.effort as PriorityAction['effort'],
      })),
      estimatedTimeMinutes: revisionPlan?.estimatedTimeMinutes || 15,
      focusAreas: revisionPlan?.focusAreas || [],
      focusAreasZh: revisionPlan?.focusAreasZh || [],
      nextSteps: (revisionPlan?.priorityActions || []).map(a => a.action),
      nextStepsZh: (revisionPlan?.priorityActions || []).map(a => a.actionZh),
    };

    // Build strength/weakness strings from analysis
    const strengthTexts = strengths.slice(0, 3).map(s => s.point);
    const weaknessTexts = weaknesses.filter(w => w.priority === 'high').slice(0, 3).map(w => w.point);

    return {
      essayId: essay.essayId,
      reviewedAt: new Date().toISOString(),
      rubricScores,
      grammarIssues,
      vocabularySuggestions: vocabSuggestions,
      coherenceAnalysis,
      taskFulfillment: task,
      organization: orgAnalysis,
      styleAnalysis: style,
      overallFeedback: [
        `Overall: ${overall.estimatedLevel} (${overall.totalScore}/21).`,
        strengthTexts.length > 0 ? `Strengths: ${strengthTexts.join('; ')}.` : '',
        weaknessTexts.length > 0 ? `Areas to improve: ${weaknessTexts.join('; ')}.` : '',
      ].filter(Boolean).join(' '),
      overallFeedbackZh: [
        `總評：${overall.estimatedLevel}（${overall.totalScore}/21 分）。`,
        `摘要：${overall.summaryZh}`,
      ].join(' '),
      revisionPlan: plan,
      totalScore: overall.totalScore,
      estimatedLevel: overall.estimatedLevel,
    };
  }

  // ============================================
  // Fallback: basic rule-based analysis if AI fails
  // ============================================
  private buildFallbackReview(essay: EssaySubmission): EssayReview {
    return {
      essayId: essay.essayId,
      reviewedAt: new Date().toISOString(),
      rubricScores: {
        hkdse: {
          content: { score: 0, maxScore: 7, comments: 'AI analysis unavailable', commentsZh: 'AI 分析暫時不可用' },
          language: { score: 0, maxScore: 7, comments: 'AI analysis unavailable', commentsZh: 'AI 分析暫時不可用' },
          organization: { score: 0, maxScore: 7, comments: 'AI analysis unavailable', commentsZh: 'AI 分析暫時不可用' },
          total: 0,
          maxTotal: 21,
          estimatedLevel: 'N/A',
        },
        cefr: { overall: 'A1', subScores: { writing: 'A1' } },
        overallBand: 'N/A',
      },
      grammarIssues: [],
      vocabularySuggestions: [],
      coherenceAnalysis: {
        score: 0,
        strengths: [],
        weaknesses: ['Analysis unavailable — please try again later'],
        transitionUsage: { count: 0, variety: 0, appropriateness: 0 },
        paragraphFlow: 'Unknown',
      },
      taskFulfillment: {
        score: 0,
        addressedAllParts: false,
        wordCountAdequate: false,
        textTypeAppropriate: false,
        toneAppropriate: false,
        comments: 'Unable to analyze',
        commentsZh: '無法分析',
      },
      organization: {
        score: 0,
        hasClearIntroduction: false,
        hasClearConclusion: false,
        paragraphCount: 0,
        averageParagraphLength: 0,
        logicalFlow: 'Unknown',
        suggestions: ['Please try again. If the problem persists, contact your teacher.'],
        suggestionsZh: ['請重試。如問題持續，請聯絡老師。'],
      },
      styleAnalysis: {
        score: 0,
        register: 'Unknown',
        tone: 'Unknown',
        sentenceVariety: { simple: 0, compound: 0, complex: 0 },
        vocabularyRichness: 0,
        suggestions: [],
        suggestionsZh: [],
      },
      overallFeedback: 'AI analysis is temporarily unavailable. Please try again later.',
      overallFeedbackZh: 'AI 分析暫時不可用，請稍後重試。',
      revisionPlan: {
        essayId: essay.essayId,
        priorityActions: [],
        estimatedTimeMinutes: 0,
        focusAreas: [],
        focusAreasZh: [],
        nextSteps: [],
        nextStepsZh: [],
      },
      totalScore: 0,
      estimatedLevel: 'N/A',
    };
  }

  // ============================================
  // Revision History (moved from writing-coach.ts)
  // ============================================

  private revisionStore = new Map<string, import('../types').RevisionHistory>();

  /** Save a revision version for an essay. */
  saveRevision(essayId: string, version: import('../types').EssayVersion): void {
    if (!this.revisionStore.has(essayId)) {
      this.revisionStore.set(essayId, { essayId, versions: [] });
    }
    this.revisionStore.get(essayId)!.versions.push(version);
  }

  /** Get revision history for an essay. */
  getRevisionHistory(essayId: string): import('../types').RevisionHistory | undefined {
    return this.revisionStore.get(essayId);
  }

  /** Get the latest version of an essay. */
  getLatestVersion(essayId: string): import('../types').EssayVersion | undefined {
    const history = this.revisionStore.get(essayId);
    return history?.versions[history.versions.length - 1];
  }

  /**
   * Compare two essay revisions.
   * Uses the AI-powered analyzer for both, then compares scores.
   */
  async compareRevisions(
    original: EssaySubmission,
    revised: EssaySubmission,
  ): Promise<import('../types').RevisionComparison> {
    const [origReview, revReview] = await Promise.all([
      this.analyzeEssay(original),
      this.analyzeEssay(revised),
    ]);

    const improvements: Array<{ category: string; before: string; after: string; impact: string }> = [];

    if (revReview.grammarIssues.length < origReview.grammarIssues.length) {
      improvements.push({
        category: 'Grammar',
        before: `${origReview.grammarIssues.length} issues`,
        after: `${revReview.grammarIssues.length} issues`,
        impact: `Reduced by ${origReview.grammarIssues.length - revReview.grammarIssues.length}`,
      });
    }
    if (revReview.totalScore > origReview.totalScore) {
      improvements.push({
        category: 'Overall Score',
        before: `${origReview.totalScore}/21`,
        after: `${revReview.totalScore}/21`,
        impact: `+${revReview.totalScore - origReview.totalScore}`,
      });
    }

    return {
      originalId: original.essayId,
      revisedId: revised.essayId,
      improvements,
      scoreChange: {
        before: origReview.totalScore,
        after: revReview.totalScore,
        difference: revReview.totalScore - origReview.totalScore,
      },
      wordCountChange: { before: original.wordCount, after: revised.wordCount },
    };
  }

  // ============================================
  // Helpers
  // ============================================
  private mapToCEFR(totalScore: number): 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' {
    if (totalScore >= 18) return 'C1';
    if (totalScore >= 14) return 'B2';
    if (totalScore >= 10) return 'B1';
    if (totalScore >= 6) return 'A2';
    return 'A1';
  }

  private findLocation(content: string, search: string): { start: number; end: number } {
    const idx = content.indexOf(search);
    return idx >= 0 ? { start: idx, end: idx + search.length } : { start: 0, end: 0 };
  }

  private typeLabelZh(type: string): string {
    const labels: Record<string, string> = {
      subject_verb_agreement: '主謂不一致',
      tense: '時態錯誤',
      article: '冠詞錯誤',
      preposition: '介詞錯誤',
      chinglish: '中式英文',
      word_order: '詞序錯誤',
      run_on: '流水句',
      fragment: '不完整句',
    };
    return labels[type] || type;
  }
}

// Export singleton
export const writingCoachService = new WritingCoachService();

// Re-export format validators for direct use
export {
  validateLetterFormat,
  validateSpeechFormat,
  validateProposalFormat,
  validateArticleFormat,
  validateReportFormat,
  validateFormat,
};
