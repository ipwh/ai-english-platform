// ============================================
// Phase 2B: Reading Diagnostic Feedback Builder
// Deterministic rule-based feedback using evaluation signals.
// No AI calls — pure logic from ReadingAnswerEvaluation.
// ============================================

import type { ReadingAnswerEvaluation } from '../evaluation/reading-answer-types';
import type { ReadingDiagnosticFeedback } from './reading-feedback-types';
import { DSE_SKILL_LABELS, DSE_SKILL_LABELS_ZH } from './reading-feedback-types';

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
  const { dseType, studentAnswer, expectedAnswer, choices, evaluation, paragraphRef } = params;

  // ── Per-type specialized feedback ──
  let feedback: ReadingDiagnosticFeedback;

  // Summary cloze / sentence transformation → grammar focus
  if (dseType === 'summary_cloze' || dseType === 'sentence_transformation') {
    feedback = buildClozeTransformationFeedback(dseType, evaluation, paragraphRef);
  } else if (dseType === 'tone_attitude') {
    // Tone/attitude → vague label + precision focus
    feedback = buildToneAttitudeFeedback(evaluation, paragraphRef);
  } else if (dseType === 'reference') {
    // Reference → wrong referent + clue location
    feedback = buildReferenceFeedback(evaluation, paragraphRef, studentAnswer, expectedAnswer);
  } else if (dseType === 'vocabulary_in_context') {
    // Vocabulary in context → POS + contextual meaning
    feedback = buildVocabInContextFeedback(evaluation, paragraphRef);
  } else if (dseType === 'inference') {
    // Inference → evidence + over-inference risk
    feedback = buildInferenceFeedback(evaluation, paragraphRef);
  } else if (dseType === 'multiple_choice' || dseType === 'true_false_not_given') {
    // Multiple choice / TFNG → distractor analysis
    feedback = buildObjectiveFeedback(evaluation, choices, expectedAnswer);
  } else {
    // Short answer / fallback → paraphrase + locating clue
    feedback = buildShortAnswerFeedback(dseType, evaluation, paragraphRef);
  }

  // 2026-08-30 audit: every diagnostic carries a curated 繁體中文 counterpart
  // so zh-mode students read the feedback content (not just the labels).
  return { ...feedback, ...buildZhDiagnostic(dseType, feedback, paragraphRef, studentAnswer, expectedAnswer) };
}

/**
 * 2026-08-30: curated Traditional-Chinese counterpart for each diagnostic
 * branch. Keyed on errorType + verdict + dseType so every branch the EN
 * builders can produce has matching zh content.
 */
function buildZhDiagnostic(
  dseType: string,
  fb: ReadingDiagnosticFeedback,
  paragraphRef?: number,
  studentAnswer?: string,
  expectedAnswer?: string,
): Pick<
  ReadingDiagnosticFeedback,
  | 'skillTargetZh'
  | 'locatingClueZh'
  | 'evidenceSummaryZh'
  | 'improvementAdviceZh'
  | 'paraphraseAdviceZh'
  | 'grammarAdviceZh'
  | 'distractorNotesZh'
> {
  const p = paragraphRef;
  const skillTargetZh = DSE_SKILL_LABELS_ZH[dseType] || DSE_SKILL_LABELS_ZH.short_answer;

  // Correct-answer zh content per question type.
  const correctZh: Record<string, { clue: string; advice: string }> = {
    summary_cloze: { clue: p ? `正確找出第 ${p} 段的字詞。` : '正確完成摘要。', advice: '詞形與意思均正確配合空格。' },
    sentence_transformation: { clue: p ? `正確找出第 ${p} 段的字詞。` : '正確完成句子轉換。', advice: '詞形與意思均正確配合。' },
    tone_attitude: { clue: '正確地從評價性語言辨識作者態度。', advice: '能從文章用字正確辨識語調。' },
    reference: { clue: '正確地從前後句找出代名詞的前詞。', advice: '代詞解析良好 — 答案能合邏輯地代替代名詞。' },
    vocabulary_in_context: { clue: '正確地利用語境線索判斷字義。', advice: '善用前後文推斷詞義。' },
    inference: { clue: '正確地推斷出字面以外的意思。', advice: '善用文本證據支持推論。' },
    multiple_choice: { clue: '正確地選出正確選項。', advice: '你的答案符合篇章內容。' },
    true_false_not_given: { clue: '正確地選出正確選項。', advice: '你的答案符合篇章內容。' },
    short_answer: { clue: p ? `正確地從第 ${p} 段找到並提取答案。` : '正確地找到並提取答案。', advice: '答案符合所需意思。' },
  };

  if (fb.verdict === 'correct' || fb.verdict === 'partially_correct') {
    const c = correctZh[dseType] ?? correctZh.short_answer;
    if (fb.verdict === 'correct' && fb.errorType === undefined) {
      const strongParaphrase =
        dseType === 'short_answer' && (fb.improvementAdvice ?? '').includes('Good use of paraphrase');
      return {
        skillTargetZh,
        locatingClueZh: c.clue,
        improvementAdviceZh: strongParaphrase ? '善用改寫 — 保留原意並以自己文字表達。' : c.advice,
      };
    }
  }

  switch (fb.errorType) {
    case 'grammar_mismatch':
      return {
        skillTargetZh,
        locatingClueZh: p ? `留意第 ${p} 段空格前後的關鍵詞。` : '利用空格前後的關鍵詞判斷所需的詞形。',
        improvementAdviceZh: '作答前檢查時態、單複數及詞性。',
        grammarAdviceZh: '意思接近，但詞形在文法上不符合句子。',
      };
    case 'paraphrase_too_close': {
      if (dseType === 'summary_cloze' || dseType === 'sentence_transformation') {
        return {
          skillTargetZh,
          locatingClueZh: '你找到了正確段落，但答案須符合摘要的文法。',
          improvementAdviceZh: '摘要可能需要不同的詞形（例如名詞代替動詞），請調整詞形。',
          grammarAdviceZh: '檢查空格需要名詞、動詞、形容詞還是副詞形式。',
        };
      }
      if (dseType === 'inference') {
        return {
          skillTargetZh,
          locatingClueZh: '你找到了證據，但推論須超越原文字眼。',
          improvementAdviceZh: '推論答案應解釋文章的「言外之意」，而非重複原文。',
          paraphraseAdviceZh: '用自己的文字表達隱含意思，不要照抄原文。',
        };
      }
      return {
        skillTargetZh,
        locatingClueZh: p ? `你在第 ${p} 段找到了正確證據，但抄得太直接。` : '你找到了正確證據，但過於直接抄錄原文。',
        improvementAdviceZh: '保留重點但縮短或重塑用字，DSE 獎勵改寫。',
        paraphraseAdviceZh: '嘗試改變句子結構，或為非關鍵字詞換用同義詞。',
      };
    }
    case 'missed_keyword': {
      if (dseType === 'summary_cloze' || dseType === 'sentence_transformation') {
        return {
          skillTargetZh,
          locatingClueZh: p ? `重讀第 ${p} 段，將關鍵詞對應到摘要空格。` : '將篇章與摘要的關鍵詞對應，以定位答案。',
          improvementAdviceZh: '找出篇章中對應每個空格的句子，然後提取字詞。',
          grammarAdviceZh: '找到字詞後，檢查是否需要為摘要調整詞形。',
        };
      }
      if (dseType === 'vocabulary_in_context') {
        return {
          skillTargetZh,
          locatingClueZh: p ? `閱讀第 ${p} 段字詞前後 1-2 句，尋找語境線索。` : '閱讀該字前後 1-2 句，尋找語境線索。',
          improvementAdviceZh: '利用前後文推斷詞義 — 留意附近的同義詞、對比或例子。',
        };
      }
      return {
        skillTargetZh,
        locatingClueZh: p ? `在第 ${p} 段尋找答案，將題目關鍵詞對應到篇章。` : '將題目關鍵詞對應到篇章以定位答案。',
        improvementAdviceZh: '掃描篇章中與題目相同的字詞，然後閱讀前後句子。',
      };
    }
    case 'tone_too_vague':
      return {
        skillTargetZh,
        locatingClueZh: p ? `留意第 ${p} 段的評價性用字（例如 "unfortunately"、"remarkably"）。` : '留意評價性用字及作者立場，而非只顧主題。',
        improvementAdviceZh: '使用更精確的語調標籤（例如「批評」、「讚賞」、「懷疑」），不要用籠統描述。',
        paraphraseAdviceZh: '選擇與作者確實用字及態度相符的語調詞，而非只有大方向。',
      };
    case 'unsupported_inference':
      return {
        skillTargetZh,
        locatingClueZh: p ? `在第 ${p} 段尋找情感或評價性語言。` : '在篇章中尋找情感或評價性語言。',
        improvementAdviceZh: '找出顯示作者態度的具體字詞（如形容詞、副詞、強調詞）。',
      };
    case 'wrong_reference':
      return {
        skillTargetZh,
        locatingClueZh: p ? `在第 ${p} 段代名詞之前的 1-2 句尋找前詞。` : '在代名詞之前 1-2 句尋找其指涉對象。',
        improvementAdviceZh: '把你的答案代入原句，邏輯上是否通順？',
        evidenceSummaryZh: expectedAnswer ? `正確前詞：「${expectedAnswer}」。你的答案「${studentAnswer || ''}」不符合。` : undefined,
      };
    case 'pos_mismatch':
      return {
        skillTargetZh,
        locatingClueZh: p ? `檢查第 ${p} 段語境所需的詞性。` : '檢查語境所需的詞性。',
        improvementAdviceZh: '意思接近，但詞形可能不符。檢查需要名詞／動詞／形容詞形式。',
        grammarAdviceZh: '選擇符合句子結構的正確詞性。',
      };
    case 'incomplete_answer':
      return {
        skillTargetZh,
        locatingClueZh: p ? `你的答案太短，重讀第 ${p} 段補回細節。` : '你的答案太短或不完整。',
        improvementAdviceZh: '涵蓋相關段落的所有重點。',
      };
    case 'paraphrase_too_far':
      return {
        skillTargetZh,
        locatingClueZh: p ? `你的改寫改變了原意，請仔細重讀第 ${p} 段。` : '你的改寫改變了原意，請仔細重讀篇章。',
        improvementAdviceZh: '改寫須保留原意 — 檢查有否增減重點。',
        paraphraseAdviceZh: '保留篇章關鍵字，但在其周圍重整句子結構。',
      };
    case 'distractor_trap':
      return {
        skillTargetZh,
        locatingClueZh: '重讀相關段落，逐項選項與篇章比較。',
        improvementAdviceZh: '排除與篇章矛盾或完全沒有提及的選項。',
        distractorNotesZh: [
          '干擾項常使用篇章中的字眼，但略為改變意思。',
          '檢查每個選項是否完全獲得篇章支持，而非只部分正確。',
        ],
      };
    default:
      // Unknown/edge branch — provide a generic zh fallback so zh mode never
      // shows bare English content.
      return {
        skillTargetZh,
        locatingClueZh: p ? `重讀第 ${p} 段，比較你的答案與篇章證據。` : '重讀相關段落，比較你的答案與篇章證據。',
        improvementAdviceZh: '核對你的答案是否與篇章內容一致。',
      };
  }
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
  _expectedAnswer?: string,
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
