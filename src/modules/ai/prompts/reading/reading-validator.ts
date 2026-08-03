// ============================================
// Reading Question Set Validator — Programmatic post-generation quality checks
// Replaces prompt-level rules with structured validation for regeneration.
// ============================================

import type { DSEreadingQuestion, DSEreadingQuestionType } from './types';
import {
  resolveSkillCategory,
  type ReadingSkillCategory,
  SKILL_DISTRIBUTION,
} from './types';

// ══════════════════════════════════════════
// Types
// ══════════════════════════════════════════

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface ReadingValidationMetrics {
  totalQuestions: number;
  paragraphCount: number;
  coverageByParagraph: Record<number, number>;
  uncoveredParagraphs: number[];
  maxQuestionsInOneParagraph: number;
  factualCount: number;
  factualRatio: number;
  higherOrderCount: number;
  wholeTextCount: number;
  crossParagraphCount: number;
  toneCount: number;
  vocabularyCount: number;
  referenceCount: number;
  inferenceCount: number;
  summaryOrTransformationCount: number;
}

export interface ReadingValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  metrics: ReadingValidationMetrics;
}

// ══════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════

/** Parse paragraph count from passage content text */
export function parseParagraphCount(content: string): number {
  const markerMatches = content.match(/\[Paragraph\s+\d+\]/gi);
  if (markerMatches && markerMatches.length > 0) return markerMatches.length;
  // Fallback: count [N] markers or double-newline splits
  const parts = content.split(/\n\n+/).filter(p => p.trim().length > 30);
  if (parts.length > 1) return parts.length;
  const numMatches = content.match(/\[\d+\]/g);
  return numMatches ? Math.min(numMatches.length, 10) : 1;
}

/** Map DSE type to skill family for distribution analysis */
function mapTypeToFamily(type: DSEreadingQuestionType): string {
  const factualTypes: DSEreadingQuestionType[] = ['mcq', 'trueFalseNG', 'shortAnswer', 'mcCloze', 'negativeInference'];
  const referenceTypes: DSEreadingQuestionType[] = ['referencing'];
  const vocabularyTypes: DSEreadingQuestionType[] = ['vocabularyInContext', 'synonymSearch', 'phraseSearch'];
  const inferenceTypes: DSEreadingQuestionType[] = ['inference', 'authorIntention'];
  const toneTypes: DSEreadingQuestionType[] = ['toneAttitude'];
  const summaryTransformTypes: DSEreadingQuestionType[] = ['summaryCloze', 'mcCloze', 'tableCompletion', 'causeEffectCompletion', 'errorCorrectionSummary'];
  const sequencingTypes: DSEreadingQuestionType[] = ['sequencing'];
  const matchingTypes: DSEreadingQuestionType[] = ['matching'];
  const exampleTypes: DSEreadingQuestionType[] = ['exampleFinding'];

  if (factualTypes.includes(type)) return 'factual';
  if (referenceTypes.includes(type)) return 'reference';
  if (vocabularyTypes.includes(type)) return 'vocabulary';
  if (inferenceTypes.includes(type)) return 'inference';
  if (toneTypes.includes(type)) return 'tone';
  if (summaryTransformTypes.includes(type)) return 'summaryTransform';
  if (sequencingTypes.includes(type)) return 'crossParagraph';
  if (matchingTypes.includes(type)) return 'crossParagraph';
  if (exampleTypes.includes(type)) return 'factual';
  return 'factual';
}

/** Normalize string for comparison: lowercase, collapse whitespace */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Compute normalized Levenshtein-like overlap ratio */
function textOverlapRatio(a: string, b: string): number {
  const wordsA = new Set(normalize(a).split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(normalize(b).split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) { if (wordsB.has(w)) overlap++; }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

/** Check if two strings are near-duplicates (normalized) */
function areNearDuplicates(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

// ══════════════════════════════════════════
// 1. Paragraph Coverage Balance
// ══════════════════════════════════════════

export function validateParagraphCoverage(
  questions: DSEreadingQuestion[],
  paragraphCount: number,
): { issues: ValidationIssue[]; coverageByParagraph: Record<number, number>; uncovered: number[]; maxInOne: number } {
  const issues: ValidationIssue[] = [];
  const coverageByParagraph: Record<number, number> = {};

  // Initialize all paragraphs at 0
  for (let p = 1; p <= paragraphCount; p++) coverageByParagraph[p] = 0;

  for (const q of questions) {
    // wholeText questions count for all paragraphs
    if (q.wholeText) {
      for (let p = 1; p <= paragraphCount; p++) coverageByParagraph[p] = (coverageByParagraph[p] || 0) + 1;
      continue;
    }
    // paragraphCoverage array (cross-paragraph)
    if (q.paragraphCoverage && q.paragraphCoverage.length >= 2) {
      for (const p of q.paragraphCoverage) {
        if (p >= 1 && p <= paragraphCount) coverageByParagraph[p] = (coverageByParagraph[p] || 0) + 1;
      }
      continue;
    }
    // Single paragraphRef
    if (q.paragraphRef && q.paragraphRef >= 1 && q.paragraphRef <= paragraphCount) {
      coverageByParagraph[q.paragraphRef] = (coverageByParagraph[q.paragraphRef] || 0) + 1;
    }
  }

  const uncovered = Object.entries(coverageByParagraph)
    .filter(([, count]) => count === 0)
    .map(([p]) => parseInt(p));

  const maxInOne = Math.max(0, ...Object.values(coverageByParagraph));
  const total = questions.length;

  // Rule: every paragraph must be covered
  if (uncovered.length > 0) {
    issues.push({
      code: 'READING_PARAGRAPH_UNCOVERED',
      severity: uncovered.length >= Math.ceil(paragraphCount / 3) ? 'error' : 'warning',
      message: `Paragraph(s) ${uncovered.join(', ')} have no questions`,
      details: { uncovered, paragraphCount },
    });
  }

  // Rule: for 4+ paragraphs, no single paragraph > 40% of questions
  if (paragraphCount >= 4 && total >= 6) {
    const maxRatio = maxInOne / total;
    if (maxRatio > 0.40) {
      const worstPara = Object.entries(coverageByParagraph)
        .filter(([, c]) => c === maxInOne).map(([p]) => p);
      issues.push({
        code: 'READING_PARAGRAPH_OVERCONCENTRATED',
        severity: 'error',
        message: `Paragraph ${worstPara.join(', ')} has ${maxInOne}/${total} questions (${Math.round(maxRatio * 100)}%) — exceeds 40% maximum`,
        details: { worstParagraphs: worstPara, count: maxInOne, total, ratio: maxRatio },
      });
    }
  }

  // Rule: lopsided distribution warning (one para 3+, others 1 each)
  if (paragraphCount >= 3 && maxInOne >= 3) {
    const minCovered = Math.min(...Object.values(coverageByParagraph).filter(c => c > 0));
    if (maxInOne - minCovered >= 3) {
      issues.push({
        code: 'READING_PARAGRAPH_LOPSIDED',
        severity: 'warning',
        message: `Paragraph coverage is uneven: range ${minCovered}–${maxInOne} questions`,
        details: { coverageByParagraph },
      });
    }
  }

  return { issues, coverageByParagraph, uncovered, maxInOne };
}

// ══════════════════════════════════════════
// 2. Skill Distribution
// ══════════════════════════════════════════

interface SkillCounts {
  factual: number;
  reference: number;
  vocabulary: number;
  inference: number;
  tone: number;
  crossParagraph: number;
  wholeText: number;
  summaryTransform: number;
}

function computeSkillCounts(questions: DSEreadingQuestion[]): SkillCounts {
  const counts: SkillCounts = { factual: 0, reference: 0, vocabulary: 0, inference: 0, tone: 0, crossParagraph: 0, wholeText: 0, summaryTransform: 0 };

  for (const q of questions) {
    const family = mapTypeToFamily(q.type);
    if (family === 'factual') counts.factual++;
    else if (family === 'reference') counts.reference++;
    else if (family === 'vocabulary') counts.vocabulary++;
    else if (family === 'inference') counts.inference++;
    else if (family === 'tone') counts.tone++;
    else if (family === 'crossParagraph') counts.crossParagraph++;
    else if (family === 'summaryTransform') counts.summaryTransform++;

    // wholeText is determined by wholeText flag or lack of paragraphRef
    if (q.wholeText) counts.wholeText++;
    else if (!q.paragraphRef && !q.paragraphCoverage?.length) counts.wholeText++;
  }

  return counts;
}

export function validateSkillDistribution(
  questions: DSEreadingQuestion[],
  paragraphCount: number,
  opts?: { isPartA?: boolean },
): { issues: ValidationIssue[]; counts: SkillCounts } {
  const issues: ValidationIssue[] = [];
  const counts = computeSkillCounts(questions);
  const total = questions.length;
  const isPartA = opts?.isPartA ?? false;

  // Factual ratio check (paragraphs 4+, questions 7+)
  if (paragraphCount >= 4 && total >= 7) {
    const factualRatio = counts.factual / total;
    if (factualRatio > SKILL_DISTRIBUTION.maxFactualRatio) {
      issues.push({
        code: 'READING_FACTUAL_RATIO_TOO_HIGH',
        severity: 'error',
        message: `${counts.factual}/${total} (${Math.round(factualRatio * 100)}%) factual items — exceeds ${Math.round(SKILL_DISTRIBUTION.maxFactualRatio * 100)}% maximum`,
        details: { factualCount: counts.factual, total, ratio: factualRatio },
      });
    }
  }

  // Higher-order ratio
  const higherOrder = counts.crossParagraph + counts.wholeText + counts.tone;
  if (paragraphCount >= 4 && total >= 6) {
    const hoRatio = higherOrder / total;
    if (hoRatio < SKILL_DISTRIBUTION.minHigherOrderRatio) {
      issues.push({
        code: 'READING_HIGHER_ORDER_TOO_LOW',
        severity: 'error',
        message: `Only ${higherOrder}/${total} higher-order items — need ≥${Math.ceil(SKILL_DISTRIBUTION.minHigherOrderRatio * total)}`,
        details: { higherOrderCount: higherOrder, total, ratio: hoRatio },
      });
    }
  }

  // Required family checks
  if (counts.reference < 1 && total >= 4) {
    issues.push({ code: 'READING_MISSING_REFERENCE', severity: 'error', message: 'No reference (pronoun referent) question' });
  }
  if (counts.vocabulary < 1 && total >= 4) {
    issues.push({ code: 'READING_MISSING_VOCABULARY', severity: 'error', message: 'No vocabulary-in-context question' });
  }
  if (counts.inference < 1 && total >= 4) {
    issues.push({ code: 'READING_MISSING_INFERENCE', severity: 'error', message: 'No inference question' });
  }
  if (counts.summaryTransform < 1 && total >= 6 && !isPartA) {
    issues.push({ code: 'READING_MISSING_SUMMARY_OR_TRANSFORMATION', severity: 'warning', message: 'No summary cloze or transformation item' });
  }

  // At least one higher-order type
  if (counts.tone + counts.crossParagraph + counts.wholeText === 0 && paragraphCount >= 3 && total >= 6) {
    issues.push({ code: 'READING_MISSING_HIGHER_ORDER', severity: 'error', message: 'No tone/attitude, whole-text, or cross-paragraph question' });
  }

  // Skill over-concentration: any family > 40%
  const allFamilies: [string, number][] = [
    ['factual', counts.factual],
    ['reference', counts.reference],
    ['vocabulary', counts.vocabulary],
    ['inference', counts.inference],
    ['tone', counts.tone],
    ['crossParagraph', counts.crossParagraph],
    ['wholeText', counts.wholeText],
    ['summaryTransform', counts.summaryTransform],
  ];
  for (const [family, count] of allFamilies) {
    if (count / total > SKILL_DISTRIBUTION.maxSameSkillRatio && total >= 6) {
      issues.push({
        code: 'READING_SKILL_OVERCONCENTRATION',
        severity: 'warning',
        message: `Skill family "${family}" has ${count}/${total} items (${Math.round(count / total * 100)}%) — exceeds ${Math.round(SKILL_DISTRIBUTION.maxSameSkillRatio * 100)}%`,
        details: { family, count, total },
      });
      break; // Report worst offender only
    }
  }

  // Part A guardrails
  if (isPartA && paragraphCount <= 3) {
    const hoPartARatio = higherOrder / total;
    if (hoPartARatio > SKILL_DISTRIBUTION.maxHigherOrderShortPassage) {
      issues.push({
        code: 'READING_PART_A_HIGHER_ORDER_OVERLOAD',
        severity: 'warning',
        message: `Part A with ${paragraphCount} paragraphs has ${higherOrder}/${total} higher-order items — exceeds ${Math.round(SKILL_DISTRIBUTION.maxHigherOrderShortPassage * 100)}% cap`,
      });
    }
    if (counts.wholeText > SKILL_DISTRIBUTION.maxWholeTextPartA) {
      issues.push({
        code: 'READING_PART_A_TOO_MANY_WHOLE_TEXT',
        severity: 'warning',
        message: `Part A has ${counts.wholeText} whole-text items — exceeds max ${SKILL_DISTRIBUTION.maxWholeTextPartA}`,
      });
    }
  }

  return { issues, counts };
}

// ══════════════════════════════════════════
// 3. Question Progression
// ══════════════════════════════════════════

export function validateQuestionProgression(
  questions: DSEreadingQuestion[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (questions.length < 5) return issues;

  const sorted = [...questions].sort((a, b) => a.index - b.index);
  const total = sorted.length;
  const earlyBoundary = Math.floor(total * 0.4);
  const lateStart = Math.floor(total * 0.7);

  const early = sorted.slice(0, earlyBoundary);
  const late = sorted.slice(lateStart);

  // Late questions should not be mostly literal factual
  const lateFactual = late.filter(q => {
    const family = mapTypeToFamily(q.type);
    return family === 'factual' && (q.marks || 1) <= 1;
  });
  if (lateFactual.length >= Math.ceil(late.length * 0.5)) {
    issues.push({
      code: 'READING_POOR_LATE_STAGE_PROGRESS',
      severity: 'warning',
      message: `${lateFactual.length}/${late.length} late-stage questions are still literal factual — difficulty should progress`,
      details: { lateFactualCount: lateFactual.length, lateTotal: late.length },
    });
  }

  // Whole-text question shouldn't appear too early
  const earlyWholeText = early.filter(q => q.wholeText || (!q.paragraphRef && !q.paragraphCoverage?.length));
  if (earlyWholeText.length > 0 && total >= 6) {
    issues.push({
      code: 'READING_WHOLE_TEXT_TOO_EARLY',
      severity: 'warning',
      message: `Whole-text question appears in first ${earlyBoundary} items — students haven't read enough text yet`,
      details: { indices: earlyWholeText.map(q => q.index) },
    });
  }

  return issues;
}

// ══════════════════════════════════════════
// 4. Whole-Text / Cross-Paragraph Validity
// ══════════════════════════════════════════

export function validateWholeTextQuestions(
  questions: DSEreadingQuestion[],
  paragraphCount: number,
  opts?: { isPartA?: boolean },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const isPartA = opts?.isPartA ?? false;

  // Identify whole-text items: wholeText flag OR no paragraphRef with no paragraphCoverage
  const wholeTextItems = questions.filter(q => q.wholeText || (!q.paragraphRef && (!q.paragraphCoverage || q.paragraphCoverage.length === 0)));
  const crossParaItems = questions.filter(q => q.paragraphCoverage && q.paragraphCoverage.length >= 1 && !q.wholeText);

  // Check: wholeText items must truly span the passage, not just one paragraph
  for (const wt of wholeTextItems) {
    // If a "whole-text" question mentions a single paragraph, it's invalid
    const singleParaMatch = wt.questionText.match(/\bparagraph\s+(\d+)\b/i);
    const mentionsMultiple = /paragraphs?\s*\d+\s*(?:-|to|through|and)\s*\d+|entire\s+passage|whole\s+passage|as\s+a\s+whole|overall/i.test(wt.questionText);

    if (singleParaMatch && !mentionsMultiple) {
      const para = parseInt(singleParaMatch[1], 10);
      issues.push({
        code: 'READING_INVALID_WHOLE_TEXT_LABEL',
        severity: 'error',
        message: `Question #${wt.index} is labeled as whole-text but only references paragraph ${para}`,
        details: { questionIndex: wt.index, referencedParagraph: para },
      });
    }

    // If wholeText flag is true but paragraphRef is explicitly set, contradiction
    if (wt.wholeText && wt.paragraphRef) {
      issues.push({
        code: 'READING_INVALID_WHOLE_TEXT_LABEL',
        severity: 'warning',
        message: `Question #${wt.index} has wholeText=true but also has paragraphRef=${wt.paragraphRef} — contradictory`,
        details: { questionIndex: wt.index, paragraphRef: wt.paragraphRef },
      });
    }
  }

  // Check: cross-paragraph items should reference 2+ paragraphs
  for (const cp of crossParaItems) {
    if (cp.paragraphCoverage && cp.paragraphCoverage.length < 2 && !cp.wholeText) {
      // If paragraphCoverage has only 1 entry or just a single paragraphRef, it's not truly cross-paragraph
      const actualRefs = cp.paragraphCoverage.length >= 2 ? cp.paragraphCoverage : (cp.paragraphRef ? [cp.paragraphRef] : []);
      if (actualRefs.length < 2) {
        issues.push({
          code: 'READING_INVALID_CROSS_PARAGRAPH_LABEL',
          severity: 'warning',
          message: `Question #${cp.index} has cross-paragraph type but references only ${actualRefs.length} paragraph(s)`,
          details: { questionIndex: cp.index, refs: actualRefs },
        });
      }
    }
  }

  // Required: at least 1 whole-text or cross-paragraph for 4+ paragraph passages
  if (paragraphCount >= 4 && !isPartA) {
    const hasValidWholeText = wholeTextItems.some(wt => {
      const singleParaMatch = wt.questionText.match(/\bparagraph\s+(\d+)\b/i);
      const mentionsMultiple = /paragraphs?\s*\d+\s*(?:-|to|through|and)\s*\d+|entire\s+passage|whole\s+passage/i.test(wt.questionText);
      return !singleParaMatch || mentionsMultiple;
    });
    const hasValidCrossPara = crossParaItems.some(cp => cp.paragraphCoverage && cp.paragraphCoverage.length >= 2);

    if (!hasValidWholeText && !hasValidCrossPara) {
      issues.push({
        code: 'READING_MISSING_WHOLE_TEXT',
        severity: 'error',
        message: `Passage has ${paragraphCount} paragraphs but no valid whole-text or cross-paragraph question`,
        details: { paragraphCount },
      });
    }
  }

  return issues;
}

// ══════════════════════════════════════════
// 5. MC Distractor Quality
// ══════════════════════════════════════════

const BANNED_CHOICE_PATTERNS = [
  /all\s*of\s*the\s*above/i,
  /none\s*of\s*the\s*above/i,
  /both\s+a\s+and\s+b/i,
];

function cleanChoice(c: string): string {
  return c.replace(/^[A-D][.)\s]+/, '').trim();
}

export function validateDistractorQuality(
  questions: DSEreadingQuestion[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let totalIssues = 0;

  for (const q of questions) {
    if (!q.choices || q.choices.length === 0) continue;

    const cleaned = q.choices.map(cleanChoice).filter(c => c.length > 0);

    // Must have exactly 4 choices (DSE standard)
    if (cleaned.length !== 4 && cleaned.length > 0) {
      issues.push({
        code: 'READING_MC_CHOICE_COUNT',
        severity: 'warning',
        message: `Question #${q.index} has ${cleaned.length} choices — DSE standard is 4`,
        details: { questionIndex: q.index, choiceCount: cleaned.length },
      });
    }

    // Check for banned patterns
    for (const c of q.choices) {
      for (const pattern of BANNED_CHOICE_PATTERNS) {
        if (pattern.test(c)) {
          issues.push({
            code: 'READING_MC_BANNED_PATTERN',
            severity: 'error',
            message: `Question #${q.index}: choice "${c.slice(0, 50)}" contains banned pattern`,
            details: { questionIndex: q.index, choice: c },
          });
          totalIssues++;
          break;
        }
      }
    }

    // Check for duplicate / near-duplicate choices
    for (let i = 0; i < cleaned.length; i++) {
      for (let j = i + 1; j < cleaned.length; j++) {
        if (areNearDuplicates(cleaned[i], cleaned[j])) {
          issues.push({
            code: 'READING_DUPLICATE_CHOICES',
            severity: 'error',
            message: `Question #${q.index}: choices ${String.fromCharCode(65 + i)} and ${String.fromCharCode(65 + j)} are near-duplicates`,
            details: { questionIndex: q.index, choiceA: cleaned[i], choiceB: cleaned[j] },
          });
          totalIssues++;
        }
      }
    }

    // Uneven choice lengths (one choice > 2x average and average > 10 chars)
    const lengths = cleaned.map(c => c.length);
    const avgLen = lengths.reduce((s, l) => s + l, 0) / lengths.length;
    if (avgLen > 10) {
      for (let i = 0; i < lengths.length; i++) {
        if (lengths[i] > avgLen * 2) {
          issues.push({
            code: 'READING_MC_LENGTH_IMBALANCE',
            severity: 'warning',
            message: `Question #${q.index}: choice ${String.fromCharCode(65 + i)} is ${lengths[i]} chars vs average ${Math.round(avgLen)} — may stand out`,
            details: { questionIndex: q.index, choiceIndex: i, length: lengths[i], average: Math.round(avgLen) },
          });
          totalIssues++;
        }
      }
    }

    // Detect strongly weak distractors: choices with < 3 meaningful words
    for (let i = 0; i < cleaned.length; i++) {
      const wordCount = cleaned[i].split(/\s+/).filter(w => w.length > 2).length;
      if (wordCount <= 1 && cleaned[i].length > 0) {
        issues.push({
          code: 'READING_WEAK_DISTRACTORS',
          severity: 'warning',
          message: `Question #${q.index}: choice ${String.fromCharCode(65 + i)} has only ${wordCount} substantive word(s)`,
          details: { questionIndex: q.index, choiceIndex: i },
        });
        totalIssues++;
      }
    }

    // Plausibility heuristic: at least 1 distractor should share words with the question domain
    // If ALL distractors have zero word overlap with question stem, they may be too generic
    const questionWords = new Set(normalize(q.questionText).split(/\s+/).filter(w => w.length > 3));
    if (questionWords.size >= 3) {
      const distractorsWithOverlap = cleaned.filter(c => {
        const choiceWords = normalize(c).split(/\s+/).filter(w => w.length > 3);
        return choiceWords.some(w => questionWords.has(w));
      });
      // Heuristic: if NO distractor shares any word with question stem, they're too disconnected
      // (soft check — only flag if ALL distractors have zero overlap AND question is specific enough)
      if (distractorsWithOverlap.length === 0 && cleaned.length >= 3 && questionWords.size >= 5) {
        issues.push({
          code: 'READING_WEAK_DISTRACTORS',
          severity: 'warning',
          message: `Question #${q.index}: no distractor shares vocabulary with the question stem — may be trivially eliminable`,
          details: { questionIndex: q.index },
        });
        totalIssues++;
      }
    }
  }

  return issues;
}

// ══════════════════════════════════════════
// 6. Prompt-Overguidance / Answer-Giveaway Risk
// ══════════════════════════════════════════

export function validateQuestionWordingRisk(
  questions: DSEreadingQuestion[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const q of questions) {
    const answerText = normalize(q.answer);
    const questionText = normalize(q.questionText);
    const targetPhrase = q.targetPhrase ? normalize(q.targetPhrase) : '';

    // Check: question text too similar to answer text
    if (answerText.length > 10) {
      const overlap = textOverlapRatio(questionText, answerText);
      if (overlap > 0.7) {
        issues.push({
          code: 'READING_ANSWER_GIVEAWAY',
          severity: 'warning',
          message: `Question #${q.index}: question text has ${Math.round(overlap * 100)}% word overlap with the answer — may give away the answer`,
          details: { questionIndex: q.index, overlapRatio: overlap },
        });
      }
    }

    // Check: target phrase appears verbatim in question (vocabulary giveaway)
    if (targetPhrase && q.type === 'vocabularyInContext') {
      if (questionText.includes(targetPhrase)) {
        issues.push({
          code: 'READING_ANSWER_GIVEAWAY',
          severity: 'warning',
          message: `Question #${q.index}: vocabulary question quotes the target word "${targetPhrase}" — trivial lookup`,
          details: { questionIndex: q.index, targetPhrase },
        });
      }
    }

    // Check: "Find a word that means X" where X is directly defined in the passage
    if (q.type === 'synonymSearch' && q.targetPhrase) {
      // The targetPhrase IS the synonym; check if question over-narrows
      if (questionText.includes(q.targetPhrase)) {
        issues.push({
          code: 'READING_ANSWER_GIVEAWAY',
          severity: 'warning',
          message: `Question #${q.index}: synonym search directly quotes the target — no context transformation needed`,
          details: { questionIndex: q.index },
        });
      }
    }
  }

  return issues;
}

// ══════════════════════════════════════════
// 7. Summary / Transformation Validation
// ══════════════════════════════════════════

const SUMMARY_TRANSFORM_TYPES: DSEreadingQuestionType[] = [
  'summaryCloze', 'mcCloze', 'tableCompletion', 'causeEffectCompletion', 'errorCorrectionSummary',
];

export function validateSummaryTransformItems(
  questions: DSEreadingQuestion[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const q of questions) {
    if (!SUMMARY_TRANSFORM_TYPES.includes(q.type)) continue;

    // Check: summary cloze with only 1 blank is too trivial
    if (q.type === 'summaryCloze') {
      // Heuristic: count blanks by looking for numbered gaps like (i), (ii), or ____ patterns in questionText
      const blankCount = (q.questionText.match(/\(\s*[ivx]+\s*\)/gi) || []).length;
      if (blankCount <= 1 && q.marks <= 1) {
        issues.push({
          code: 'READING_SUMMARY_TOO_TRIVIAL',
          severity: 'warning',
          message: `Question #${q.index}: summary cloze has only ${blankCount} blank(s) — too simple for this question type`,
          details: { questionIndex: q.index, blankCount },
        });
      }
    }

    // Check: if answer exists in question text verbatim, it's not real transformation
    if (q.answer && q.questionText) {
      const answerWords = normalize(q.answer);
      const questionWords = normalize(q.questionText);
      // For single-word answers, check if they appear in the question
      if (answerWords.split(/\s+/).length <= 2 && questionWords.includes(answerWords)) {
        issues.push({
          code: 'READING_SUMMARY_TOO_TRIVIAL',
          severity: 'warning',
          message: `Question #${q.index}: answer "${q.answer}" appears in the question text — no transformation required`,
          details: { questionIndex: q.index, answer: q.answer },
        });
      }
    }

    // Check: answerMode validation — if answerMode is 'copy' and this is a summary/transform item, warn
    if (q.answerMode === 'copy' && (q.type === 'summaryCloze' || q.type === 'causeEffectCompletion')) {
      issues.push({
        code: 'READING_SUMMARY_TOO_TRIVIAL',
        severity: 'warning',
        message: `Question #${q.index}: answerMode is "copy" for a ${q.type} item — should require change or create mode`,
        details: { questionIndex: q.index, type: q.type, answerMode: q.answerMode },
      });
    }
  }

  return issues;
}

// ══════════════════════════════════════════
// Top-Level Validator
// ══════════════════════════════════════════

export interface ValidateReadingSetOptions {
  /** Whether this is a Part A paper (affects strictness of some rules) */
  isPartA?: boolean;
  /** Minimum paragraph count override (auto-detected if not provided) */
  paragraphCount?: number;
  /** Passage content string for paragraph counting */
  readingContent?: string;
}

export function validateReadingQuestionSet(
  questions: DSEreadingQuestion[],
  options: ValidateReadingSetOptions = {},
): ReadingValidationResult {
  const { isPartA = false, readingContent } = options;

  // Auto-detect paragraph count
  const paragraphCount = options.paragraphCount ??
    (readingContent ? parseParagraphCount(readingContent) : 1);

  const allIssues: ValidationIssue[] = [];

  // 1. Paragraph coverage
  const coverageResult = validateParagraphCoverage(questions, paragraphCount);
  allIssues.push(...coverageResult.issues);

  // 2. Skill distribution
  const skillResult = validateSkillDistribution(questions, paragraphCount, { isPartA });
  allIssues.push(...skillResult.issues);

  // 3. Question progression
  const progressionIssues = validateQuestionProgression(questions);
  allIssues.push(...progressionIssues);

  // 4. Whole-text / cross-paragraph validity
  const wholeTextIssues = validateWholeTextQuestions(questions, paragraphCount, { isPartA });
  allIssues.push(...wholeTextIssues);

  // 5. Distractor quality
  const distractorIssues = validateDistractorQuality(questions);
  allIssues.push(...distractorIssues);

  // 6. Answer giveaway risk
  const giveawayIssues = validateQuestionWordingRisk(questions);
  allIssues.push(...giveawayIssues);

  // 7. Summary / transformation validation
  const summaryIssues = validateSummaryTransformItems(questions);
  allIssues.push(...summaryIssues);

  // Build metrics
  const skillCounts = computeSkillCounts(questions);
  const metrics: ReadingValidationMetrics = {
    totalQuestions: questions.length,
    paragraphCount,
    coverageByParagraph: coverageResult.coverageByParagraph,
    uncoveredParagraphs: coverageResult.uncovered,
    maxQuestionsInOneParagraph: coverageResult.maxInOne,
    factualCount: skillCounts.factual,
    factualRatio: questions.length > 0 ? skillCounts.factual / questions.length : 0,
    higherOrderCount: skillCounts.tone + skillCounts.crossParagraph + skillCounts.wholeText,
    wholeTextCount: skillCounts.wholeText,
    crossParagraphCount: skillCounts.crossParagraph,
    toneCount: skillCounts.tone,
    vocabularyCount: skillCounts.vocabulary,
    referenceCount: skillCounts.reference,
    inferenceCount: skillCounts.inference,
    summaryOrTransformationCount: skillCounts.summaryTransform,
  };

  return {
    isValid: !allIssues.some(i => i.severity === 'error'),
    issues: allIssues,
    metrics,
  };
}
