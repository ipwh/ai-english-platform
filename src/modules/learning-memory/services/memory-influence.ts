// Sprint 36: MemoryInfluence — how memory influences AI systems
import type {
  LearningMemoryV2, MemoryInfluence,
} from '../types';

// ============================================
// MemoryInfluenceEngine
// ============================================

export class MemoryInfluenceEngine {

  /** Compute how memory should influence all downstream AI systems */
  compute(memory: LearningMemoryV2): MemoryInfluence {
    return {
      promptModifiers: this.promptModifiers(memory),
      promptModifiersZh: this.promptModifiersZh(memory),
      exercisePreferences: this.exercisePreferences(memory),
      feedbackPreferences: this.feedbackPreferences(memory),
      recommendationModifiers: this.recommendationModifiers(memory),
    };
  }

  /** Generate modifiers for AI prompt generation */
  private promptModifiers(memory: LearningMemoryV2): string[] {
    const mods: string[] = [];

    // Grammar level adaptation
    const grammarLevel = memory.grammar.overallGrammarLevel || 'B1';
    mods.push(`Use vocabulary and grammar appropriate for ${grammarLevel} level`);

    // Weakness awareness
    if (memory.grammar.strugglingTopics.length > 0) {
      mods.push(`Focus exercises on: ${memory.grammar.strugglingTopics.slice(0, 3).map(t => t.topic).join(', ')}`);
    }

    // Strength leveraging
    if (memory.strengths.strongestSkills.length > 0) {
      mods.push(`Leverage student's strength in ${memory.strengths.strongestSkills.join(', ')}`);
    }

    // Writing style
    if (memory.writingStyle.commonChinglishPatterns.length > 0) {
      mods.push(`Watch for Chinglish patterns: ${memory.writingStyle.commonChinglishPatterns.slice(0, 3).map(p => p.pattern).join(', ')}`);
    }

    // Motivation-aware
    if (memory.motivation?.burnoutRisk > 0.5) {
      mods.push('Include encouraging language and celebrate small wins');
    }

    // Learning habits
    if (memory.learningHabits?.focusLevel < 0.4) {
      mods.push('Keep exercises short and varied to maintain focus');
    }

    return mods;
  }

  private promptModifiersZh(memory: LearningMemoryV2): string[] {
    const mods: string[] = [];
    const level = memory.grammar.overallGrammarLevel || 'B1';
    mods.push(`使用適合 ${level} 程度的詞彙和文法`);

    if (memory.grammar.strugglingTopics.length > 0) {
      mods.push(`重點練習：${memory.grammar.strugglingTopics.slice(0, 3).map(t => t.topicZh).join('、')}`);
    }
    if (memory.motivation?.burnoutRisk > 0.5) {
      mods.push('使用鼓勵性語言，讚賞小進步');
    }
    return mods;
  }

  /** Compute exercise preferences from memory */
  private exercisePreferences(memory: LearningMemoryV2): MemoryInfluence['exercisePreferences'] {
    const preferredFormats: string[] = [];
    const topicsToFocus: string[] = [];
    const topicsToAvoid: string[] = [];

    // Format preferences from habits
    if (memory.learningHabits?.focusLevel < 0.4) {
      preferredFormats.push('mcq', 'matching'); // low cognitive load
    } else {
      preferredFormats.push('fill-blank'); // error-correction removed — underline not supported
    }

    // Writing preference
    if (memory.writingStyle.preferredTextTypes.length > 0) {
      preferredFormats.push('short-writing');
    }

    // Focus topics = struggling grammar + weak skills
    for (const t of memory.grammar.strugglingTopics.slice(0, 3)) {
      topicsToFocus.push(t.topic);
    }
    for (const w of memory.weaknesses.persistentWeaknesses.slice(0, 2)) {
      if (!topicsToFocus.includes(w.topic)) topicsToFocus.push(w.topic);
    }

    // Avoid topics = already mastered
    for (const t of memory.grammar.masteredTopics.slice(-5)) {
      topicsToAvoid.push(t);
    }

    // Difficulty bias
    const avgAccuracy = memory.learningSpeed.completionRate;
    const difficultyBias: MemoryInfluence['exercisePreferences']['difficultyBias'] =
      avgAccuracy > 0.85 ? 'challenge' : avgAccuracy > 0.65 ? 'core' : 'remedial';

    return { preferredFormats, topicsToFocus, topicsToAvoid, difficultyBias };
  }

  /** Compute feedback preferences from memory */
  private feedbackPreferences(memory: LearningMemoryV2): MemoryInfluence['feedbackPreferences'] {
    const confidence = memory.confidence?.overallConfidence ?? 0.5;
    const calibration = memory.confidence?.calibrationAccuracy ?? 0;

    return {
      detailLevel: calibration < 0.5 ? 'detailed' : 'balanced',
      includeExamples: memory.grammar.strugglingTopics.length > 3,
      includeChinglishWarnings: memory.writingStyle.commonChinglishPatterns.length > 0,
      tonePreference: confidence < 0.4 ? 'encouraging' :
        confidence > 0.8 ? 'direct' : 'analytical',
    };
  }

  /** Compute recommendation modifiers from memory */
  private recommendationModifiers(memory: LearningMemoryV2): MemoryInfluence['recommendationModifiers'] {
    const suggestedStrategies: string[] = [];

    if (memory.reviewHistory.overdueReviews > 5) {
      suggestedStrategies.push('spaced-repetition');
    }
    if (memory.learningHabits?.reviewConsistency < 0.4) {
      suggestedStrategies.push('retrieval-practice');
    }
    if (memory.weaknesses.persistentWeaknesses.length > 3) {
      suggestedStrategies.push('weakness-focus');
    }
    if (memory.motivation?.motivationLevel < 0.3) {
      suggestedStrategies.push('gamification-boost');
    }

    return {
      prioritizeWeaknesses: memory.weaknesses.persistentWeaknesses.length > 0,
      prioritizeInterests: memory.preferredTopics.topTopics.length > 3,
      includeChallengeContent: memory.motivation?.motivationLevel > 0.6,
      suggestedStrategies: suggestedStrategies.length > 0 ? suggestedStrategies : ['balanced'],
    };
  }
}

export const memoryInfluenceEngine = new MemoryInfluenceEngine();
