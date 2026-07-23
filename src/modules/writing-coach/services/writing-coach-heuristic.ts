// Sprint 36: Writing Coach 2.0 — orchestration service
import type { WritingCoachResult, WritingDimensions } from '../types';
import {
  scoreGrammar, scoreVocabulary, scoreSentenceVariety,
  scoreCoherence, scoreCohesion, scoreOrganization,
  scoreTaskResponse, scoreTone, predictBand,
  generateRevisionChecklist, generateNextPractice,
  extractWeakSentences, generatePersonalizedSuggestions,
} from './writing-coach-formula';

/**
 * Analyze an essay with all 8 dimensions and return full coach result.
 */
export function analyzeEssay(params: {
  essayId: string;
  studentId: string;
  title: string;
  text: string;
  wordLimit?: number;
  textType?: string;
}): WritingCoachResult {
  const { essayId, studentId, title, text, wordLimit, textType } = params;

  // Compute all 8 dimensions
  const dimensions: WritingDimensions = {
    grammar: scoreGrammar(text),
    vocabulary: scoreVocabulary(text),
    sentenceVariety: scoreSentenceVariety(text),
    coherence: scoreCoherence(text),
    cohesion: scoreCohesion(text),
    organization: scoreOrganization(text),
    taskResponse: scoreTaskResponse(text, { wordLimit, textType }),
    tone: scoreTone(text),
  };

  // Predict DSE band
  const bandPrediction = predictBand(dimensions);

  // Generate all outputs
  const revisionChecklist = generateRevisionChecklist(dimensions, text);
  const nextPractice = generateNextPractice(dimensions);
  const weakSentences = extractWeakSentences(text);
  const personalizedSuggestions = generatePersonalizedSuggestions(dimensions);

  return {
    essayId,
    studentId,
    title,
    dimensions,
    bandPrediction,
    revisionChecklist,
    nextPractice,
    weakSentences,
    personalizedSuggestions,
    analyzedAt: new Date(),
  };
}
