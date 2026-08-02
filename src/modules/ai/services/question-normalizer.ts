// ============================================
// AI Question Normalizer — post-generation question cleanup
// Extracted from ai-service.ts (Sprint 91)
// Imports from question-validator + listening-normalizer
// ============================================

import { logger } from '@/shared/logger/logger';
import { stripMcqPrefix, normalizeMcqAnswer, validateAndFixQuestion, type ValidatableQuestion } from './question-validator';
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
    const finalAnswer = normalizeMcqAnswer(base.answer, finalChoices);

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
