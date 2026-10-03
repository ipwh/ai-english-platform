// ============================================
// IELTS Speaking — official part structure & criterion definitions
// ============================================
// Source: official Speaking format page + Speaking Band Descriptors / Key
// Assessment Criteria (docs/ielts/IELTS_SOURCES.md #7, #10, #11). Descriptions
// are paraphrased platform summaries.
//
// 2026-10-03 (II) PRODUCT DECISION: the platform does NOT score Speaking, does
// NOT simulate an examiner, and does NOT judge pronunciation. These definitions
// exist to TEACH what the real test assesses (preparation coach + criteria
// panel), not to produce a score.
// ============================================

import type { IeltsSpeakingCriterionKey, IeltsSpeakingPartType } from '../domain/types';

export interface IeltsSpeakingPartConfig {
  part: IeltsSpeakingPartType;
  partNumber: 1 | 2 | 3;
  labelEn: string;
  durationLabel: string;
  description: string;
  /** Part 2: 1 minute preparation then up to 2 minutes speaking (official). */
  preparationSeconds?: number;
  speakingSeconds?: number;
}

export const IELTS_SPEAKING_PARTS: Readonly<Record<IeltsSpeakingPartType, IeltsSpeakingPartConfig>> = {
  speaking_part1: {
    part: 'speaking_part1',
    partNumber: 1,
    labelEn: 'Part 1 — Introduction and interview',
    durationLabel: '4–5 minutes',
    description:
      'General questions on familiar topics (home, family, work, studies, interests). Give opinions and information about everyday topics.',
  },
  speaking_part2: {
    part: 'speaking_part2',
    partNumber: 2,
    labelEn: 'Part 2 — Long turn',
    durationLabel: '3–4 minutes including preparation',
    description:
      'Task card topic. 1 minute to prepare (notes allowed), then speak for up to 2 minutes. The examiner may ask one or two follow-up questions.',
    preparationSeconds: 60,
    speakingSeconds: 120,
  },
  speaking_part3: {
    part: 'speaking_part3',
    partNumber: 3,
    labelEn: 'Part 3 — Discussion',
    durationLabel: '4–5 minutes',
    description:
      'Discuss issues related to the Part 2 topic in a more general and abstract way, in greater depth. Explain opinions; analyse, discuss and speculate.',
  },
};

export interface IeltsSpeakingCriterionDefinition {
  key: IeltsSpeakingCriterionKey;
  labelEn: string;
  focus: string[];
  /**
   * What the REAL test needs for this criterion, and why the platform does not
   * score it: text-only preparation can coach transcript-linked aspects;
   * pronunciation needs acoustic evidence the platform does not analyse.
   */
  evidenceType: 'preparable_from_transcript' | 'acoustic_required';
}

export const IELTS_SPEAKING_CRITERIA_DEFINITIONS: readonly IeltsSpeakingCriterionDefinition[] = [
  {
    key: 'fluencyAndCoherence',
    labelEn: 'Fluency and Coherence',
    focus: [
      'Continuity and ability to speak at length',
      'Hesitation, repetition, self-correction (practise these with self-recording)',
      'Logical sequencing and development of ideas',
      'Appropriate cohesive devices',
    ],
    evidenceType: 'preparable_from_transcript',
  },
  {
    key: 'lexicalResource',
    labelEn: 'Lexical Resource',
    focus: [
      'Range of vocabulary',
      'Precision, appropriacy and collocation',
      'Paraphrasing when a word is unknown',
    ],
    evidenceType: 'preparable_from_transcript',
  },
  {
    key: 'grammaticalRangeAndAccuracy',
    labelEn: 'Grammatical Range and Accuracy',
    focus: [
      'Range and flexibility of structures',
      'Frequency and impact of errors',
    ],
    evidenceType: 'preparable_from_transcript',
  },
  {
    key: 'pronunciation',
    labelEn: 'Pronunciation',
    focus: [
      'Intelligibility (understood without too much effort) — the real test criterion',
      'The platform does NOT assess pronunciation (no acoustic analysis) and never equates accent with quality',
    ],
    evidenceType: 'acoustic_required',
  },
];

/** Status recorded whenever pronunciation is not acoustically verified. */
export const IELTS_PRONUNCIATION_NOT_VERIFIED = 'NOT_VERIFIED' as const;

export interface IeltsPronunciationState {
  status: typeof IELTS_PRONUNCIATION_NOT_VERIFIED | 'VERIFIED';
  reason: string;
}

/**
 * The platform never produces a pronunciation judgement. This state exists so
 * UI/teaching copy can state the limitation explicitly — it is ALWAYS
 * NOT_VERIFIED here (no acoustic analysis exists in the platform).
 */
export function defaultPronunciationState(): IeltsPronunciationState {
  return {
    status: IELTS_PRONUNCIATION_NOT_VERIFIED,
    reason:
      'This platform does not assess pronunciation or accent (no acoustic analysis). Practise with your own recordings and focus on clarity of ideas and language you control.',
  };
}
