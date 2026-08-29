// ============================================
// AI Question Normalizer — post-generation question cleanup
// Extracted from ai-service.ts (Sprint 91)
// Imports from question-validator + listening-normalizer
// ============================================

import { logger } from '@/shared/logger/logger';
import { MCQ_LETTERS, stripMcqPrefix, normalizeMcqAnswer, validateAndFixQuestion, type ValidatableQuestion } from './question-validator';
import { normalizeListeningContent } from './listening-normalizer';
import { BANNED_PATTERNS, TIME_FRAGMENT_PATTERNS, getFallbackFillers } from './mcq-filters';
import type { GeneratedQuestion } from '../types/generation-types';

export function normalizeGeneratedQuestions(questions: GeneratedQuestion[]): GeneratedQuestion[] {
  const results: GeneratedQuestion[] = [];
  let rejectedCount = 0;

  for (const q of questions) {
    const base: GeneratedQuestion = {
      ...q,
      type: (q.type || 'mc').trim(),
      prompt: (q.prompt || '').trim(),
      promptZh: q.promptZh?.trim(),
      answer: (q.answer || '').trim(),
      explanationZh: (q.explanationZh || '').trim(),
      explanationEn: (q.explanationEn || '').trim(),
      commonMistake: (q.commonMistake || '').trim(),
      grammarPoint: q.grammarPoint?.trim(),
      listeningContent: normalizeListeningContent(q.listeningContent?.trim() || ''),
      listeningContentZh: q.listeningContentZh?.trim(),
      readingContent: q.readingContent?.trim(),
      readingContentZh: q.readingContentZh?.trim(),
      choices: Array.isArray(q.choices) ? q.choices.map(c => String(c)) : [],
    };

    if (base.type !== 'mc') {
      const { warnings, rejected } = validateAndFixQuestion(base as ValidatableQuestion, results.length);
      if (rejected) { rejectedCount++; continue; }
      if (warnings.length > 0) logger.warn({ module: 'question-normalizer', warnings }, 'Non-MC answer consistency issues');
      if (!base.answer || base.answer.trim().length === 0) {
        logger.warn({ module: 'question-normalizer', questionIndex: results.length }, 'Non-MC question has empty answer — rejected');
        rejectedCount++;
        continue;
      }
      const keepChoices = base.type === 'error-correction' && base.choices && base.choices.length > 0;
      results.push({ ...base, choices: keepChoices ? base.choices : [] });
      continue;
    }

    const cleanedChoices = Array.from(new Set(
      (base.choices || [])
        .map(stripMcqPrefix)
        .map(c => c.trim())
        .filter(Boolean)
    ));

    const punctuatedChoices = cleanedChoices.map(c => {
      const isLikelySentence =
        /^[A-Z]/.test(c) &&
        c.length > 20 &&
        /\s+(is|are|was|were|has|have|had|will|would|can|could|should|may|might|do|does|did)\s+/i.test(c) &&
        !/[.!?]$/.test(c) &&
        !/^(?:Yes|No|True|False)$/i.test(c);
      const isFragment =
        c.length < 20 ||
        /^(?:The |A |An )?\d/.test(c) ||
        /^\d{1,2}[:\s]/.test(c) ||
        /^[A-Z][a-z]+(?:\s+[a-z]+){0,2}$/.test(c);
      if (isLikelySentence && !isFragment) return c + '.';
      return c;
    });

    const isListening = !!base.listeningContent;
    const isReading = !!base.readingContent;

    // Keep the AI's ORIGINAL (pre-filter) choice order. Filtering re-orders the
    // list, so a bare letter/number key cannot be trusted positionally anymore.
    const preFilterChoices = [...punctuatedChoices];

    const validChoices = punctuatedChoices.filter(c => {
      if (c.length < 1) return false;
      if (/^[\d:.\s]+$/.test(c) && c.length < 6) return false;
      if (BANNED_PATTERNS.some(p => p.test(c))) {
        logger.warn({ module: 'question-normalizer', choice: c }, 'Filtered banned choice');
        return false;
      }
      if (!isListening && TIME_FRAGMENT_PATTERNS.some(p => p.test(c))) {
        logger.warn({ module: 'question-normalizer', choice: c }, 'Filtered time fragment choice');
        return false;
      }
      return true;
    });
    const choicesShifted = validChoices.length < preFilterChoices.length;

    if (validChoices.length < 2) {
      logger.error({ module: 'question-normalizer', validChoiceCount: validChoices.length, choices: validChoices }, 'Question has insufficient valid choices after filtering');
      const fallbackFillers = getFallbackFillers(isListening, isReading);
      while (validChoices.length < 4) {
        const filler = fallbackFillers[validChoices.length] || `Option ${validChoices.length + 1}`;
        if (!validChoices.some(c => c.toLowerCase() === filler.toLowerCase())) {
          validChoices.push(filler);
        } else {
          break;
        }
      }
    }

    const finalChoices = validChoices.slice(0, 4);
    const rawAnswer = (base.answer || '').trim();

    // Anti-fabrication (2026-08-29 audit): when choices were filtered or
    // fillers injected, position-based keys ("C", "C. Beta", "2") referred to
    // the AI's ORIGINAL list and can no longer be trusted positionally.
    // Resolve by TEXT against the pre-filter list and remap; if the
    // referenced choice was filtered out (or never existed), the question is
    // defective — reject it rather than persist a filler as the canonical key.
    let finalAnswer: string | null;
    const bareKey = rawAnswer.match(/^\(?([A-Da-d1-4])\)?[.、]?$/);
    if (choicesShifted) {
      // Position-independent text resolution first.
      const textOnly = stripMcqPrefix(rawAnswer).trim().toLowerCase();
      const textIdx = finalChoices.findIndex(
        c => stripMcqPrefix(c).trim().toLowerCase() === textOnly,
      );
      if (textIdx >= 0) {
        finalAnswer = MCQ_LETTERS[textIdx];
      } else if (bareKey) {
        const token = bareKey[1];
        const origIndex = /^[1-4]$/.test(token)
          ? Number(token) - 1
          : MCQ_LETTERS.indexOf(token.toUpperCase() as typeof MCQ_LETTERS[number]);
        const referencedChoice = preFilterChoices[origIndex];
        if (origIndex >= 0 && referencedChoice !== undefined) {
          const remapped = finalChoices.findIndex(
            c => stripMcqPrefix(c).trim().toLowerCase() === stripMcqPrefix(referencedChoice).trim().toLowerCase(),
          );
          finalAnswer = remapped >= 0 ? MCQ_LETTERS[remapped] : null;
        } else {
          finalAnswer = null;
        }
      } else {
        // Letter-prefixed or positional answer whose referenced choice no
        // longer exists after filtering — defective, reject.
        finalAnswer = null;
      }
    } else {
      finalAnswer = normalizeMcqAnswer(base.answer, finalChoices);
    }
    if (finalAnswer === null) {
      // R3.10-L: answer key resolves to no choice — reject, never guess 'A'.
      rejectedCount++;
      logger.warn({ module: 'question-normalizer', questionIndex: results.length }, 'MC question rejected — answer does not match any choice');
      continue;
    }

    const tempQuestion: GeneratedQuestion = {
      ...base,
      choices: finalChoices,
      answer: finalAnswer,
    };
    const result = validateAndFixQuestion(tempQuestion as ValidatableQuestion, results.length);
    if (result.rejected) {
      rejectedCount++;
      logger.warn({ module: 'question-normalizer', questionIndex: results.length }, 'Question rejected — answer not found in listeningContent');
      continue;
    }
    if (result.warnings.length > 0) logger.warn({ module: 'question-normalizer', warnings: result.warnings }, 'Answer auto-fix applied');

    results.push({
      ...base,
      choices: finalChoices,
      answer: (result.fixed as GeneratedQuestion).answer,
    });
  }

  if (rejectedCount > 0) {
    logger.warn({ module: 'question-normalizer', rejectedCount, totalQuestions: questions.length }, 'Questions rejected due to answer-content mismatch');
  }

  return results;
}
