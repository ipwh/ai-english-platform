// ============================================
// Listening Content Normalizer — dialogue format validation & sanitization
// Extracted from ai-service.ts (Sprint 0.5)
// ============================================

import { logger } from '@/shared/logger/logger';
import { stripMcqPrefix, type ValidatableQuestion } from './question-validator';

/** Valid speaker role labels for TTS compatibility */
export const VALID_SPEAKERS = ['Woman', 'Man', 'Boy', 'Girl'] as const;
export const VALID_SPEAKER_SET: Set<string> = new Set(VALID_SPEAKERS);
export const SPEAKER_LINE_RE_STRICT = /^(Woman|Man|Boy|Girl)\s*:\s*(.+)$/i;

/** Pattern that catches abbreviated labels like "W:", "M:", "B:", "G:" before normalization */
const ABBREVIATED_LABEL_RE = /^([WwMmBbGg])\s*[:：\-–—]\s*/;

/** Map single-letter abbreviations to full speaker labels */
const SPEAKER_EXPANSION: Record<string, string> = {
  w: 'Woman',
  m: 'Man',
  b: 'Boy',
  g: 'Girl',
};

/**
 * Sanitize a single listening dialogue line.
 * Normalizes speaker label format without changing speaker identity.
 */
export function sanitizeListeningLine(line: string): string {
  if (!line.trim()) return '';

  const cleaned = line.trim().replace(/^["'「『\[]+|["'」』\]]+$/g, '');

  const looseMatch = cleaned.match(
    /^["'\[]?\s*([A-Za-z]+(?:\s+[A-Za-z0-9]+)?)\s*["'\]]?\s*[:：\-–—]\s*/,
  );
  if (!looseMatch) return cleaned;

  const rawSpeaker = looseMatch[1];
  const rest = cleaned.slice(looseMatch[0].length);

  // Expand single-letter abbreviations: W→Woman, M→Man, B→Boy, G→Girl
  const normalized = SPEAKER_EXPANSION[rawSpeaker.toLowerCase()]
    || (rawSpeaker.charAt(0).toUpperCase() + rawSpeaker.slice(1).toLowerCase());

  if (!rest.trim()) return '';
  return `${normalized}: ${rest.trim()}`;
}

/**
 * Validate listeningContent dialogue structure.
 */
export function validateListeningContent(
  content: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!content || !content.trim()) {
    return { valid: false, errors: ['listeningContent is empty'] };
  }

  const lines = content.split(/\n/).filter(l => l.trim());
  if (lines.length < 2) {
    errors.push('dialogue too short (<2 lines)');
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect abbreviated labels (W:, M:, B:, G:) — these should have been normalized
    if (ABBREVIATED_LABEL_RE.test(line)) {
      errors.push(
        `Line ${i + 1}: ABBREVIATED speaker label detected — use full words Woman/Man/Boy/Girl, not W/M/B/G → "${line.slice(0, 40)}"`,
      );
      continue;
    }

    const match = line.match(SPEAKER_LINE_RE_STRICT);
    if (!match) {
      errors.push(
        `Line ${i + 1}: invalid format — must start with Woman:/Man:/Boy:/Girl: → "${line.slice(0, 40)}"`,
      );
      continue;
    }
    const speaker = match[1];
    if (!VALID_SPEAKER_SET.has(speaker)) {
      errors.push(
        `Line ${i + 1}: invalid speaker "${speaker}" — only Woman/Man/Boy/Girl allowed`,
      );
    }
    if (/[""'']/.test(line)) {
      errors.push(`Line ${i + 1}: contains quote characters`);
    }
    if (!match[2].trim()) {
      errors.push(`Line ${i + 1}: speaker "${speaker}" has no dialogue text`);
    }
  }

  const blankCount = content.split(/\n/).filter(l => !l.trim()).length;
  if (blankCount > lines.length) {
    errors.push(`excessive blank lines (${blankCount}), possible format anomaly`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalize AI-generated listeningContent.
 * - Splits multi-role single lines
 * - Sanitizes each line
 * - Deduplicates blank lines
 * - Validates in development mode
 */
export function normalizeListeningContent(raw: string): string {
  if (!raw) return '';

  let content = raw
    .replace(/([^\n])\b(Woman|Man|Boy|Girl)\s*:/gi, '$1\n$2:')
    .replace(/([^\n])(Speaker\s*[AB12]?)\s*:/gi, '$1\n$2:');

  const lines = content.split(/\n/);
  const sanitized = lines.map(sanitizeListeningLine).filter(l => l.trim());

  content = sanitized.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  if (process.env.NODE_ENV === 'development') {
    const validation = validateListeningContent(content);
    if (!validation.valid) {
      logger.warn(
        { module: 'listening-normalizer', errors: validation.errors },
        'listeningContent validation warnings',
      );
    }
    logger.debug(
      {
        module: 'listening-normalizer',
        lines: sanitized.length,
        chars: content.length,
        preview: content.slice(0, 80),
      },
      'listeningContent normalized',
    );
  }

  return content;
}

/**
 * Post-generation QA: validate listening questions for answer consistency,
 * proper time formats, and DSE-compliant choices.
 */
export function validateListeningConsistency(
  questions: ValidatableQuestion[],
): {
  passed: boolean;
  errors: string[];
  warnings: string[];
  questionIndices: number[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const retryIndices: number[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.listeningContent) continue;

    const prefix = `[L-Listening Q${i + 1}]`;

    const lines = q.listeningContent.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      errors.push(`${prefix} dialogue too short (<2 lines)`);
      retryIndices.push(i);
      continue;
    }

    if (q.choices && q.choices.length > 0 && q.type === 'mc') {
      const letterMatch = q.answer.trim().match(/^[A-D]$/i);
      if (letterMatch) {
        const idx = letterMatch[0].toUpperCase().charCodeAt(0) - 65;
        // ⚠️ Guard: answer letter out of range (e.g., "D" but only 3 choices)
        if (idx >= q.choices.length) {
          const letter = letterMatch[0].toUpperCase();
          errors.push(
            `${prefix} answer letter "${letter}" out of range — only ${q.choices.length} choices available (${['A','B','C','D'].slice(0, q.choices.length).join('/')})`,
          );
          retryIndices.push(i);
          continue;
        }
        const answerText = q.choices[idx] || '';
        const normContent = q.listeningContent.toLowerCase().replace(/\s+/g, ' ');
        const normAnswer = answerText
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .replace(/^[a-d][.)]\s*/i, '');

        if (!normContent.includes(normAnswer)) {
          errors.push(
            `${prefix} answer "${answerText}" NOT found verbatim in listeningContent`,
          );
          retryIndices.push(i);
        }
      }
    }

    const timeFragPattern = /\b\d{1,2}:\d{2}\b/g;
    const timeMatches = q.listeningContent.match(timeFragPattern);
    if (timeMatches && timeMatches.length > 0) {
      warnings.push(
        `${prefix} numeric time format found: ${timeMatches.join(', ')} — prefer words`,
      );
    }

    if (q.choices && q.choices.length > 0) {
      for (let ci = 0; ci < q.choices.length; ci++) {
        const choice = stripMcqPrefix(q.choices[ci] || '');
        if (/^\d{1,2}:\d{2}\s*(?:AM|PM)?$/i.test(choice)) {
          warnings.push(
            `${prefix} choice ${String.fromCharCode(65 + ci)} "${choice}" is numeric time format`,
          );
        }
        if (choice.length < 3) {
          warnings.push(
            `${prefix} choice ${String.fromCharCode(65 + ci)} "${choice}" too short (<3 chars)`,
          );
        }
        if (/^o'?clock$/i.test(choice)) {
          warnings.push(
            `${prefix} choice ${String.fromCharCode(65 + ci)} "${choice}" bare clock word`,
          );
        }
      }
    }

    if (/\b\d+\s+o'?clock\b/i.test(q.listeningContent)) {
      warnings.push(`${prefix} mixed digit+word time detected (e.g. "3 o'clock")`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    questionIndices: [...new Set(retryIndices)],
  };
}
