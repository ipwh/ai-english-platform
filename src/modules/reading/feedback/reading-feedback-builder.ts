// ============================================
// Phase 2B: Reading Diagnostic Feedback Builder
// Deterministic rule-based feedback using evaluation signals.
// No AI calls — pure logic from ReadingAnswerEvaluation.
// ============================================

import type { ReadingAnswerEvaluation } from '../evaluation/reading-answer-types';
import type { ReadingDiagnosticFeedback, ReadingErrorType } from './reading-feedback-types';
import { DSE_SKILL_LABELS } from './reading-feedback-types';

/** Build diagnostic feedback from evaluation + question context */
export function buildReadingDiagnosticFeedback(params: {
  dseType: string;
  questionText: string;
  studentAnswer: string;
  expectedAnswer: string;
  choices?: string[];
  evaluation: ReadingAnswerEvaluation;
  paragraphRef?: number;
}): ReadingDiagnosticFeedback {
  const { dseType, questionText, studentAnswer, expectedAnswer, choices, evaluation, paragraphRef } = params;

  // ── Per-type specialized feedback ──

  // Summary cloze / sentence transformation → grammar focus
  if (dseType === 'summary_cloze' || dseType === 'sentence_transformation') {
    return buildClozeTransformationFeedback(dseType, evaluation, paragraphRef);
  }

  // Tone/attitude → vague label + precision focus
  if (dseType === 'tone_attitude') {
    return buildToneAttitudeFeedback(evaluation, paragraphRef);
  }

  // Reference → wrong referent + clue location
  if (dseType === 'reference') {
    return buildReferenceFeedback(evaluation, paragraphRef, studentAnswer, expectedAnswer);
  }

  // Vocabulary in context → POS + contextual meaning
  if (dseType === 'vocabulary_in_context') {
    return buildVocabInContextFeedback(evaluation, paragraphRef);
  }

  // Inference → evidence + over-inference risk
  if (dseType === 'inference') {
    return buildInferenceFeedback(evaluation, paragraphRef);
  }

  // Multiple choice / TFNG → distractor analysis
  if (dseType === 'multiple_choice' || dseType === 'true_false_not_given') {
    return buildObjectiveFeedback(evaluation, choices, expectedAnswer);
  }

  // Short answer / fallback → paraphrase + locating clue
  return buildShortAnswerFeedback(dseType, evaluation, paragraphRef);
}

// ============================================
// Per-Type Feedback Builders
// ============================================

function buildClozeTransformationFeedback(
  dseType: string,
  evaluation: ReadingAnswerEvaluation,
  paragraphRef?: number,
): ReadingDiagnosticFeedback {
  const skillLabel = DSE_SKILL_LABELS[dseType] || DSE_SKILL_LABELS.summary_cloze;

  if (evaluation.grammaticalFitToPrompt === 'poor') {
    return {
      verdict: evaluation.isCorrect ? 'partially_correct' : 'incorrect',
      skillTarget: skillLabel,
      locatingClue: paragraphRef
        ? `Focus on the keywords around the blank in paragraph ${paragraphRef}.`
        : 'Use the keywords around the blank to determine the required word form.',
      errorType: 'grammar_mismatch',
      improvementAdvice: 'Check tense, number (singular/plural), and part of speech before finalising your answer.',
      grammarAdvice: 'The meaning is close, but the word form does not fit the sentence grammatically.',
      confidence: 'high',
    };
  }

  if (evaluation.copyingLevel === 'heavy') {
    return {
      verdict: evaluation.isCorrect ? 'partially_correct' : 'incorrect',
      skillTarget: skillLabel,
      locatingClue: 'You identified the correct passage, but the answer should fit the summary\'s grammar.',
      errorType: 'paraphrase_too_close',
      improvementAdvice: 'The summary may need a different word form (e.g., noun instead of verb). Adapt the form.',
      grammarAdvice: 'Check whether the blank needs a noun, verb, adjective, or adverb form.',
      confidence: 'high',
    };
  }

  if (!evaluation.isCorrect) {
    return {
      verdict: 'incorrect',
      skillTarget: skillLabel,
      locatingClue: paragraphRef
        ? `Re-read paragraph ${paragraphRef} and match the keywords to the summary blanks.`
        : 'Match keywords between the passage and the summary to locate the answer.',
      errorType: 'missed_keyword',
      improvementAdvice: 'Find the sentence in the passage that corresponds to each blank, then extract the word.',
      grammarAdvice: 'After finding the word, check if the form needs adjusting for the summary.',
      confidence: 'high',
    };
  }

  return {
    verdict: 'correct',
    skillTarget: skillLabel,
    locatingClue: paragraphRef
      ? `Correctly identified the word from paragraph ${paragraphRef}.`
      : 'Correctly completed the summary.',
    improvementAdvice: 'Word form and meaning both fit the blank correctly.',
    confidence: 'high',
  };
}

function buildToneAttitudeFeedback(
  evaluation: ReadingAnswerEvaluation,
  paragraphRef?: number,
): ReadingDiagnosticFeedback {
  const isVague = evaluation.warnings.some(w => /vague/i.test(w));

  if (isVague) {
    return {
      verdict: evaluation.isCorrect ? 'partially_correct' : 'incorrect',
      skillTarget: DSE_SKILL_LABELS.tone_attitude,
      locatingClue: paragraphRef
        ? `Focus on evaluative words in paragraph ${paragraphRef} (e.g., "unfortunately", "remarkably").`
        : 'Focus on evaluative wording and the writer\'s stance, not just the topic.',
      errorType: 'tone_too_vague',
      improvementAdvice: 'Use a more precise tone label (e.g., "critical", "admiring", "sceptical") instead of a broad description.',
      paraphraseAdvice: 'Choose a tone word that matches the writer\'s exact wording and attitude, not just the general direction.',
      confidence: 'medium',
    };
  }

  if (!evaluation.isCorrect) {
    return {
      verdict: 'incorrect',
      skillTarget: DSE_SKILL_LABELS.tone_attitude,
      locatingClue: paragraphRef
        ? `Look for emotional or evaluative language in paragraph ${paragraphRef}.`
        : 'Look for emotional or evaluative language in the passage.',
      errorType: 'unsupported_inference',
      improvementAdvice: 'Identify specific words that reveal the writer\'s attitude (e.g., adjectives, adverbs, intensifiers).',
      confidence: 'medium',
    };
  }

  return {
    verdict: 'correct',
    skillTarget: DSE_SKILL_LABELS.tone_attitude,
    locatingClue: 'Correctly identified the writer\'s attitude from evaluative language.',
    improvementAdvice: 'Good identification of the tone from the text\'s wording.',
    confidence: 'high',
  };
}

function buildReferenceFeedback(
  evaluation: ReadingAnswerEvaluation,
  paragraphRef?: number,
  studentAnswer?: string,
  expectedAnswer?: string,
): ReadingDiagnosticFeedback {
  if (!evaluation.isCorrect) {
    return {
      verdict: 'incorrect',
      skillTarget: DSE_SKILL_LABELS.reference,
      locatingClue: paragraphRef
        ? `Look 1-2 sentences before the pronoun in paragraph ${paragraphRef}.`
        : 'Look 1-2 sentences before the pronoun to find its referent.',
      errorType: 'wrong_reference',
      improvementAdvice: 'Substitute your answer into the original sentence. Does it make logical sense?',
      evidenceSummary: expectedAnswer
        ? `Expected referent: "${expectedAnswer}". Your answer "${studentAnswer || ''}" does not match.`
        : undefined,
      confidence: 'high',
    };
  }

  return {
    verdict: 'correct',
    skillTarget: DSE_SKILL_LABELS.reference,
    locatingClue: 'Correctly identified the pronoun\'s referent from the surrounding sentences.',
    improvementAdvice: 'Good pronoun resolution — the answer fits logically in place of the pronoun.',
    confidence: 'high',
  };
}

function buildVocabInContextFeedback(
  evaluation: ReadingAnswerEvaluation,
  paragraphRef?: number,
): ReadingDiagnosticFeedback {
  const posNote = evaluation.notes.find(n => /POS/i.test(n));

  if (posNote && /mismatch/i.test(posNote)) {
    return {
      verdict: evaluation.isCorrect ? 'partially_correct' : 'incorrect',
      skillTarget: DSE_SKILL_LABELS.vocabulary_in_context,
      locatingClue: paragraphRef
        ? `Check the part of speech required by the context in paragraph ${paragraphRef}.`
        : 'Check the part of speech required by the context.',
      errorType: 'pos_mismatch',
      improvementAdvice: 'The meaning is close, but the word form may not fit. Check if a noun/verb/adjective form is needed.',
      grammarAdvice: 'Choose the correct part of speech that fits the sentence structure.',
      confidence: 'medium',
    };
  }

  if (!evaluation.isCorrect) {
    return {
      verdict: 'incorrect',
      skillTarget: DSE_SKILL_LABELS.vocabulary_in_context,
      locatingClue: paragraphRef
        ? `Read 1-2 sentences before and after the word in paragraph ${paragraphRef} for context clues.`
        : 'Read 1-2 sentences before and after the word for context clues.',
      errorType: 'missed_keyword',
      improvementAdvice: 'Use surrounding words to infer the meaning — look for synonyms, contrasts, or examples nearby.',
      confidence: 'medium',
    };
  }

  return {
    verdict: 'correct',
    skillTarget: DSE_SKILL_LABELS.vocabulary_in_context,
    locatingClue: 'Correctly used context clues to determine the word\'s meaning.',
    improvementAdvice: 'Good use of surrounding text to infer meaning.',
    confidence: 'high',
  };
}

function buildInferenceFeedback(
  evaluation: ReadingAnswerEvaluation,
  paragraphRef?: number,
): ReadingDiagnosticFeedback {
  if (evaluation.copyingLevel === 'heavy') {
    return {
      verdict: evaluation.isCorrect ? 'partially_correct' : 'incorrect',
      skillTarget: DSE_SKILL_LABELS.inference,
      locatingClue: 'You found the evidence, but inference requires going beyond the exact words.',
      errorType: 'paraphrase_too_close',
      improvementAdvice: 'Inference answers should explain what the text IMPLIES, not just repeat what it SAYS.',
      paraphraseAdvice: 'Use your own words to express the implied meaning, not the literal text.',
      confidence: 'high',
    };
  }

  if (!evaluation.isCorrect) {
    return {
      verdict: 'incorrect',
      skillTarget: DSE_SKILL_LABELS.inference,
      locatingClue: paragraphRef
        ? `Look for hints and implications in paragraph ${paragraphRef}, not just stated facts.`
        : 'Look for hints and implications, not just stated facts.',
      errorType: 'unsupported_inference',
      improvementAdvice: 'Your answer goes beyond what the passage supports. Base your inference on specific textual evidence.',
      confidence: 'medium',
    };
  }

  return {
    verdict: 'correct',
    skillTarget: DSE_SKILL_LABELS.inference,
    locatingClue: 'Correctly inferred meaning beyond the literal text.',
    improvementAdvice: 'Good use of textual evidence to support your inference.',
    confidence: 'high',
  };
}

function buildObjectiveFeedback(
  evaluation: ReadingAnswerEvaluation,
  choices?: string[],
  expectedAnswer?: string,
): ReadingDiagnosticFeedback {
  if (evaluation.isCorrect) {
    return {
      verdict: 'correct',
      skillTarget: 'Comprehension — Multiple choice',
      locatingClue: 'Correctly identified the right option.',
      improvementAdvice: 'Your answer matches the passage content.',
      confidence: 'high',
    };
  }

  const distractorNotes: string[] = [];
  if (choices && choices.length >= 2) {
    distractorNotes.push(
      'Distractors often use words from the passage but change the meaning slightly.',
    );
    distractorNotes.push(
      'Check if each option is fully supported by the passage, not just partially true.',
    );
  }

  return {
    verdict: 'incorrect',
    skillTarget: 'Comprehension — Multiple choice',
    locatingClue: 'Re-read the relevant paragraph and compare each option against the passage.',
    errorType: 'distractor_trap',
    improvementAdvice: 'Eliminate options that are contradicted by the passage or not mentioned at all.',
    distractorNotes: distractorNotes.length > 0 ? distractorNotes : undefined,
    confidence: 'medium',
  };
}

function buildShortAnswerFeedback(
  dseType: string,
  evaluation: ReadingAnswerEvaluation,
  paragraphRef?: number,
): ReadingDiagnosticFeedback {
  const skillLabel = DSE_SKILL_LABELS[dseType] || DSE_SKILL_LABELS.short_answer;

  // Heavy copying
  if (evaluation.copyingLevel === 'heavy' && evaluation.isCorrect) {
    return {
      verdict: 'partially_correct',
      skillTarget: skillLabel,
      locatingClue: paragraphRef
        ? `You found the correct evidence in paragraph ${paragraphRef}, but copied too directly.`
        : 'You found the correct evidence, but copied too directly from the passage.',
      errorType: 'paraphrase_too_close',
      improvementAdvice: 'Keep the key idea but shorten or reshape the wording. DSE rewards paraphrasing.',
      paraphraseAdvice: 'Try changing the sentence structure or using synonyms for non-key terms.',
      confidence: 'high',
    };
  }

  // Incomplete
  if (evaluation.completeness === 'partial' && !evaluation.isCorrect) {
    return {
      verdict: 'incorrect',
      skillTarget: skillLabel,
      locatingClue: paragraphRef
        ? `Your answer is too short. Re-read paragraph ${paragraphRef} for the missing detail.`
        : 'Your answer is too short or incomplete.',
      errorType: 'incomplete_answer',
      improvementAdvice: 'Include all key points from the relevant passage section.',
      confidence: 'high',
    };
  }

  // Paraphrase too far (lost meaning)
  if (evaluation.paraphraseQuality === 'strong' && !evaluation.isCorrect) {
    return {
      verdict: 'incorrect',
      skillTarget: skillLabel,
      locatingClue: paragraphRef
        ? `Your paraphrase changed the meaning. Re-read paragraph ${paragraphRef} carefully.`
        : 'Your paraphrase changed the meaning. Re-read the passage carefully.',
      errorType: 'paraphrase_too_far',
      improvementAdvice: 'Paraphrase should keep the original meaning — check that your answer doesn\'t add or remove key ideas.',
      paraphraseAdvice: 'Use keywords from the passage but restructure the sentence around them.',
      confidence: 'medium',
    };
  }

  // Wrong
  if (!evaluation.isCorrect) {
    return {
      verdict: 'incorrect',
      skillTarget: skillLabel,
      locatingClue: paragraphRef
        ? `Look for the answer in paragraph ${paragraphRef}. Match keywords from the question to the passage.`
        : 'Match keywords from the question to locate the answer in the passage.',
      errorType: 'missed_keyword',
      improvementAdvice: 'Scan the passage for words from the question, then read the surrounding sentences.',
      confidence: 'high',
    };
  }

  // Correct
  return {
    verdict: 'correct',
    skillTarget: skillLabel,
    locatingClue: paragraphRef
      ? `Correctly located and extracted the answer from paragraph ${paragraphRef}.`
      : 'Correctly located and extracted the answer.',
    improvementAdvice: evaluation.paraphraseQuality === 'strong'
      ? 'Good use of paraphrase — meaning preserved with your own wording.'
      : 'Answer matches the required meaning.',
    confidence: 'high',
  };
}
