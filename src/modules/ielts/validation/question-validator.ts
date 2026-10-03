// ============================================
// IELTS Question Validator — structural + provenance screen
// ============================================
// This validator is a MACHINE SCREEN, not a semantic certification. It rejects
// items that are structurally unsound or lack provenance; semantic quality
// (T/F/NG reasoning, distractor defensibility) remains a HUMAN QA duty — items
// default to QA_REQUIRED after AI validation and can never auto-publish.
//
// Nothing here calls an LLM. Every check is deterministic.
// ============================================

import {
  isIeltsMatchingType,
  isIeltsMcType,
  isIeltsWordLimitedType,
  type IeltsEvidenceSpan,
  type IeltsQuestionDefinition,
  type IeltsQuestionType,
  type IeltsValidationStatus,
} from '../domain/types';
import { extractOptionPairs } from '../scoring/objective-scorer';
import {
  normalizeTrueFalseNotGiven,
  normalizeYesNoNotGiven,
} from '../domain/normalization';
import { validateWordLimit, countIeltsWords } from '../domain/word-count';

export interface IeltsValidationIssue {
  code: string;
  severity: 'reject' | 'flag';
  message: string;
}

export interface IeltsValidationReport {
  ok: boolean; // no 'reject' issues
  issues: IeltsValidationIssue[];
}

export interface IeltsValidationSectionContent {
  passageText?: string | null;
  transcriptText?: string | null;
}

export interface IeltsBatchContext {
  /** Normalized prompt texts already accepted in this batch (duplicate guard). */
  seenPromptKeys: Set<string>;
}

export function emptyBatchContext(): IeltsBatchContext {
  return { seenPromptKeys: new Set() };
}

function reject(report: IeltsValidationReport, code: string, message: string): void {
  report.ok = false;
  report.issues.push({ code, severity: 'reject', message });
}

function flag(report: IeltsValidationReport, code: string, message: string): void {
  report.issues.push({ code, severity: 'flag', message });
}

/** Word-boundary phrase containment (case-insensitive) for transcripts. */
export function containsAnswerVerbatim(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.trim().toLowerCase();
  if (!n) return false;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return pattern.test(h);
}

function spanMatchesText(content: string, span: IeltsEvidenceSpan): boolean {
  return content.slice(span.start, span.end) === span.text;
}

const SKILL_FOR_TYPE_PREFIX: Array<{ prefix: string; skill: 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING' }> = [
  { prefix: 'listening_', skill: 'LISTENING' },
  { prefix: 'reading_', skill: 'READING' },
  { prefix: 'writing_', skill: 'WRITING' },
  { prefix: 'speaking_', skill: 'SPEAKING' },
];

export function skillMatchesQuestionType(skill: string, type: IeltsQuestionType): boolean {
  const entry = SKILL_FOR_TYPE_PREFIX.find((e) => type.startsWith(e.prefix));
  return entry ? entry.skill === skill : false;
}

const BANNED_OPTION_PATTERNS = [
  /all of the above/i,
  /none of the above/i,
  /both a and b/i,
];

/**
 * Official Listening rule (fetched 2026-10-03): "Contracted words such as
 * 'they're' will not be tested." Word-limited Listening keys must therefore
 * not be contractions. Dictionary-based to avoid rejecting legitimate
 * apostrophes in names (O'Brien, D'Artagnan) or possessives (Halley's).
 */
const LISTENING_CONTRACTION_TOKEN =
  /^(?:they|we|you|it|that|there|who|he|she|i|is|are|was|were|do|does|did|has|have|had|can|could|will|would|shall|should|must|might|may)(?:n)?['\u2019](?:t|s|re|ve|ll|d|m)$/i;

/**
 * Validate one IELTS question. Deterministic; returns all issues found.
 */
export function validateIeltsQuestion(
  question: IeltsQuestionDefinition,
  section: IeltsValidationSectionContent | undefined,
  batch: IeltsBatchContext = emptyBatchContext(),
): IeltsValidationReport {
  const report: IeltsValidationReport = { ok: true, issues: [] };

  // ---- Common structural checks -------------------------------------------
  if (!question.id?.trim()) reject(report, 'MISSING_ID', 'Question id is required.');
  if (!question.prompt?.trim()) reject(report, 'MISSING_PROMPT', 'Question prompt is required.');
  if (!skillMatchesQuestionType(question.skill, question.questionType)) {
    reject(
      report,
      'SKILL_TYPE_MISMATCH',
      `Question type "${question.questionType}" does not belong to skill "${question.skill}".`,
    );
  }
  if (!question.contentSource?.type) {
    reject(report, 'MISSING_CONTENT_SOURCE', 'Content provenance (contentSource.type) is required.');
  } else if (question.contentSource.type === 'OFFICIAL_REFERENCE' && !question.contentSource.notes?.trim()) {
    flag(
      report,
      'OFFICIAL_REFERENCE_NEEDS_NOTES',
      'OFFICIAL_REFERENCE provenance requires notes explaining how the content is original.',
    );
  }
  if (!question.difficultyModel?.trim()) {
    flag(report, 'MISSING_DIFFICULTY_MODEL', 'Difficulty must record its model version (platform estimate).');
  }
  if (!question.generatorVersion?.trim()) {
    flag(report, 'MISSING_GENERATOR_VERSION', 'generatorVersion is recommended for audit.');
  }

  // ---- Duplicate prompt guard (batch scope) --------------------------------
  const promptKey = question.prompt.trim().toLowerCase().replace(/\s+/g, ' ');
  if (batch.seenPromptKeys.has(promptKey)) {
    reject(report, 'DUPLICATE_PROMPT', 'Duplicate question prompt within the same batch.');
  } else {
    batch.seenPromptKeys.add(promptKey);
  }

  // ---- Type-specific checks ------------------------------------------------
  if (isIeltsMcType(question.questionType)) {
    validateMcOptions(question, report);
  } else if (question.questionType === 'reading_true_false_not_given') {
    validateTrueFalseNotGiven(question, report);
  } else if (question.questionType === 'reading_yes_no_not_given') {
    validateYesNoNotGiven(question, report);
  } else if (isIeltsMatchingType(question.questionType)) {
    validateMatching(question, report);
  } else if (isIeltsWordLimitedType(question.questionType)) {
    validateWordLimitedItem(question, report);
  } else if (question.questionType === 'listening_plan_map_diagram_labelling') {
    const pairs = extractOptionPairs(question.options ?? null);
    if (pairs.length > 0) validateMatching(question, report);
    else validateWordLimitedItem(question, report, { requireWordLimit: false });
  }

  // ---- Evidence / provenance checks by skill -------------------------------
  if (question.skill === 'READING') {
    validateReadingEvidence(question, section, report);
  } else if (question.skill === 'LISTENING') {
    validateListeningEvidence(question, section, report);
  }

  return report;
}

// ============================================
// Type-specific validators
// ============================================

function answerKeyArray(question: IeltsQuestionDefinition): string[] {
  const key = question.answerKey;
  if (key === null || key === undefined) return [];
  return Array.isArray(key) ? key.map(String) : [String(key)];
}

function validateMcOptions(question: IeltsQuestionDefinition, report: IeltsValidationReport): void {
  const pairs = extractOptionPairs(question.options ?? null);
  if (pairs.length < 3) {
    reject(report, 'MC_TOO_FEW_OPTIONS', `Multiple choice requires at least 3 options (found ${pairs.length}).`);
    return;
  }
  const seen = new Set<string>();
  for (const p of pairs) {
    const key = p.text.trim().toLowerCase();
    if (seen.has(key)) reject(report, 'MC_DUPLICATE_OPTION', `Duplicate option text: "${p.text}".`);
    seen.add(key);
    if (BANNED_OPTION_PATTERNS.some((re) => re.test(p.text))) {
      reject(report, 'MC_BANNED_OPTION', `Ambiguous option policy: "${p.text}" is not allowed.`);
    }
  }
  const keys = answerKeyArray(question);
  if (keys.length !== 1) {
    // Official format: one numbered question = one answer = one mark.
    // "Choose TWO letters" in a real paper occupies TWO question numbers.
    reject(
      report,
      'MC_KEY_COUNT',
      'Multiple choice requires exactly one answer key. "Choose TWO letters" instructions must be authored as two numbered questions (one answer each), never as one item with two keys.',
    );
    return;
  }
  const codes = pairs.map((p) => p.code.trim().toLowerCase());
  if (!codes.includes(keys[0].trim().toLowerCase())) {
    reject(report, 'MC_KEY_NOT_IN_OPTIONS', `Answer key "${keys[0]}" is not one of the option codes.`);
  }
}

function validateTrueFalseNotGiven(question: IeltsQuestionDefinition, report: IeltsValidationReport): void {
  const keys = answerKeyArray(question);
  if (keys.length !== 1) {
    reject(report, 'TFNG_KEY_COUNT', 'True/False/Not Given requires exactly one key.');
    return;
  }
  const canonical = normalizeTrueFalseNotGiven(keys[0]);
  if (!canonical) {
    reject(report, 'TFNG_INVALID_KEY', `Key "${keys[0]}" is not TRUE/FALSE/NOT GIVEN.`);
    return;
  }
  if (canonical === 'FALSE' && !question.explanation?.trim()) {
    flag(report, 'TFNG_FALSE_NEEDS_CONTRADICTION', 'A FALSE key must explain the contradiction (QA review required).');
  }
  if (canonical === 'NOT GIVEN' && !question.explanation?.trim()) {
    flag(report, 'TFNG_NG_NEEDS_RATIONALE', 'A NOT GIVEN key must explain what is absent (QA review required).');
  }
}

function validateYesNoNotGiven(question: IeltsQuestionDefinition, report: IeltsValidationReport): void {
  const keys = answerKeyArray(question);
  if (keys.length !== 1) {
    reject(report, 'YNNG_KEY_COUNT', 'Yes/No/Not Given requires exactly one key.');
    return;
  }
  const canonical = normalizeYesNoNotGiven(keys[0]);
  if (!canonical) {
    reject(report, 'YNNG_INVALID_KEY', `Key "${keys[0]}" is not YES/NO/NOT GIVEN.`);
    return;
  }
  if (canonical === 'NO' && !question.explanation?.trim()) {
    flag(report, 'YNNG_NO_NEEDS_CONTRADICTION', 'A NO key must explain the contradiction with the writer (QA review).');
  }
  if (canonical === 'NOT GIVEN' && !question.explanation?.trim()) {
    flag(report, 'YNNG_NG_NEEDS_RATIONALE', 'A NOT GIVEN key must explain what is absent (QA review required).');
  }
}

function validateMatching(question: IeltsQuestionDefinition, report: IeltsValidationReport): void {
  const pairs = extractOptionPairs(question.options ?? null);
  if (pairs.length < 2) {
    reject(report, 'MATCHING_TOO_FEW_OPTIONS', 'Matching requires at least 2 options.');
    return;
  }
  const codes = pairs.map((p) => p.code.trim().toLowerCase());
  const keys = answerKeyArray(question);
  if (keys.length === 0) {
    reject(report, 'MATCHING_MISSING_KEY', 'Matching requires an answer key.');
    return;
  }
  if (keys.length !== 1) {
    // Official format: one numbered question = one answer = one mark. Multi-answer
    // instructions ("Which TWO features…") are two numbered questions in the paper.
    reject(
      report,
      'MATCHING_KEY_COUNT',
      'Matching requires exactly one answer key. Multi-answer instructions must be authored as separate numbered questions (one answer each).',
    );
    return;
  }
  for (const key of keys) {
    if (!codes.includes(key.trim().toLowerCase())) {
      reject(report, 'MATCHING_KEY_NOT_IN_OPTIONS', `Answer key "${key}" is not one of the option codes.`);
    }
  }
}

function validateWordLimitedItem(
  question: IeltsQuestionDefinition,
  report: IeltsValidationReport,
  opts: { requireWordLimit?: boolean } = {},
): void {
  const requireWordLimit = opts.requireWordLimit !== false;
  const keys = answerKeyArray(question);
  if (keys.length === 0) {
    reject(report, 'COMPLETION_MISSING_KEY', 'Completion/short-answer items require an answer key.');
    return;
  }
  if (keys.length !== 1) {
    // Official format: ONE numbered question = ONE answer = ONE mark. A completion
    // item with several required answers would be scored all-or-nothing while the
    // real paper awards one mark per numbered blank — fail closed instead.
    // Alternative spellings/forms belong in acceptedAnswers (still one key).
    reject(
      report,
      'COMPLETION_KEY_COUNT',
      'Completion/short-answer items require exactly one answer key (use acceptedAnswers for alternative correct forms). Multi-blank responses must be authored as separate numbered questions.',
    );
    return;
  }

  // ---- Answer-leakage guard (hardening 2026-10-03) ---------------------------
  // The learner must fill the blank from the source text; if the prompt already
  // contains the answer in plain text, the item is trivially copyable. Short
  // function words (<3 chars, no digit) are exempt to avoid false positives.
  const leakCandidates = [keys[0], ...(question.acceptedAnswers ?? [])]
    .map((a) => String(a).trim())
    .filter((a) => a.length >= 3 || /\d/.test(a));
  const leaked = leakCandidates.find((a) => containsAnswerVerbatim(question.prompt, a));
  if (leaked) {
    reject(
      report,
      'ANSWER_LEAKED_IN_PROMPT',
      `The prompt already contains the answer "${leaked}" — the learner could copy it without reading the source.`,
    );
    return;
  }

  // ---- Listening contraction guard (official: contracted words not tested) ---
  if (question.skill === 'LISTENING') {
    const contracted = keys
      .flatMap((k) => k.split(/\s+/))
      .find((token) => LISTENING_CONTRACTION_TOKEN.test(token));
    if (contracted) {
      reject(
        report,
        'LISTENING_CONTRACTION_KEY',
        `"${contracted}" is a contracted word — official Listening materials state contracted words are not tested.`,
      );
      return;
    }
  }

  if (requireWordLimit && !question.wordLimit?.maxWords) {
    reject(report, 'COMPLETION_MISSING_WORD_LIMIT', 'Completion/short-answer items require an explicit word limit.');
    return;
  }
  if (question.wordLimit?.maxWords) {
    for (const key of keys) {
      const result = validateWordLimit(key, question.wordLimit);
      if (result.limitExceeded) {
        reject(
          report,
          'COMPLETION_KEY_OVER_LIMIT',
          `Answer key "${key}" exceeds its own word limit (${result.wordCount} > ${question.wordLimit.maxWords}).`,
        );
      }
      if (result.numberNotAllowed) {
        reject(report, 'COMPLETION_KEY_NUMBER_NOT_ALLOWED', `Answer key "${key}" is numeric but numbers are disallowed.`);
      }
    }
  }
}

// ============================================
// Evidence validators
// ============================================

function validateReadingEvidence(
  question: IeltsQuestionDefinition,
  section: IeltsValidationSectionContent | undefined,
  report: IeltsValidationReport,
): void {
  const evidence = question.evidence;
  if (!evidence || !('evidenceSpans' in evidence) || !Array.isArray(evidence.evidenceSpans)) {
    reject(report, 'READING_MISSING_EVIDENCE', 'Reading items require evidence spans into the passage.');
    return;
  }
  if (evidence.evidenceSpans.length === 0) {
    reject(report, 'READING_EMPTY_EVIDENCE', 'At least one evidence span is required.');
    return;
  }
  const passage = section?.passageText ?? '';
  if (!passage) {
    reject(report, 'READING_MISSING_PASSAGE', 'Reading evidence cannot be validated without the passage text.');
    return;
  }
  for (const span of evidence.evidenceSpans) {
    if (span.start < 0 || span.end > passage.length || span.start >= span.end) {
      reject(report, 'READING_SPAN_OUT_OF_BOUNDS', `Evidence span [${span.start}, ${span.end}) is outside the passage.`);
      continue;
    }
    if (!spanMatchesText(passage, span)) {
      reject(
        report,
        'READING_SPAN_TEXT_MISMATCH',
        `Evidence span text does not match the passage at [${span.start}, ${span.end}).`,
      );
    }
  }

  // Completion / short-answer: the key (or a variant) must appear inside the evidence.
  if (isIeltsWordLimitedType(question.questionType)) {
    const candidateAnswers = [...answerKeyArray(question), ...(question.acceptedAnswers ?? [])];
    const evidenceText = evidence.evidenceSpans.map((s) => s.text).join(' ');
    const found = candidateAnswers.some(
      (a) =>
        a.trim().length > 0 &&
        (containsAnswerVerbatim(evidenceText, a) ||
          containsAnswerVerbatim(passage, a)),
    );
    if (!found) {
      reject(
        report,
        'READING_ANSWER_NOT_LOCATABLE',
        'The answer key does not appear in the passage/evidence (completion answers must come from the text).',
      );
    }
  }
}

function validateListeningEvidence(
  question: IeltsQuestionDefinition,
  section: IeltsValidationSectionContent | undefined,
  report: IeltsValidationReport,
): void {
  const evidence = question.evidence;
  if (!evidence || !('expectedAnswer' in evidence)) {
    reject(report, 'LISTENING_MISSING_EVIDENCE', 'Listening items require transcript-based evidence.');
    return;
  }
  const transcript = section?.transcriptText ?? '';
  if (!transcript) {
    reject(report, 'LISTENING_MISSING_TRANSCRIPT', 'Listening evidence cannot be validated without the transcript.');
    return;
  }

  if (evidence.transcriptSpan) {
    const span = evidence.transcriptSpan;
    if (span.start < 0 || span.end > transcript.length || span.start >= span.end) {
      reject(report, 'LISTENING_SPAN_OUT_OF_BOUNDS', `Transcript span [${span.start}, ${span.end}) is out of bounds.`);
    } else if (!spanMatchesText(transcript, span)) {
      reject(report, 'LISTENING_SPAN_TEXT_MISMATCH', 'Transcript span text does not match the transcript.');
    }
  }

  const expected = Array.isArray(evidence.expectedAnswer)
    ? evidence.expectedAnswer.map(String)
    : [String(evidence.expectedAnswer ?? '')];
  const keys = answerKeyArray(question);
  // Code-answer families (MC / matching / option-list labelling): the answer is
  // an option CODE, so verbatim-locatability applies to the option TEXT the key
  // points to — the transcript must actually support the correct option. Only
  // completion/short-answer families require the answer itself verbatim.
  const pairs = extractOptionPairs(question.options ?? null);
  const usesOptionCodes =
    isIeltsMcType(question.questionType) ||
    isIeltsMatchingType(question.questionType) ||
    (question.questionType === 'listening_plan_map_diagram_labelling' && pairs.length > 0);
  let allCandidates: string[];
  if (usesOptionCodes && pairs.length > 0) {
    const keyTexts = keys
      .map((k) => pairs.find((p) => p.code.trim().toLowerCase() === k.trim().toLowerCase())?.text)
      .filter((t): t is string => Boolean(t && t.trim().length > 0));
    allCandidates =
      keyTexts.length > 0
        ? keyTexts
        : [...expected, ...(evidence.acceptedVariants ?? []), ...keys];
  } else {
    allCandidates = [...expected, ...(evidence.acceptedVariants ?? []), ...keys];
  }
  const locatable = allCandidates.some((a) => a.trim().length > 0 && containsAnswerVerbatim(transcript, a));
  if (!locatable) {
    reject(
      report,
      'LISTENING_ANSWER_NOT_IN_TRANSCRIPT',
      usesOptionCodes
        ? 'The correct option text (or expected answer) does not appear verbatim in the transcript — undeliverable item.'
        : 'The expected answer (or an accepted variant) does not appear verbatim in the transcript — undeliverable item.',
    );
  }

  // Word-limit consistency: evidence rule vs question rule (min of both applies).
  const evidenceLimit = evidence.wordLimit;
  const questionLimit = question.wordLimit;
  if (evidenceLimit?.maxWords && questionLimit?.maxWords && evidenceLimit.maxWords !== questionLimit.maxWords) {
    flag(
      report,
      'LISTENING_WORD_LIMIT_CONFLICT',
      `Evidence word limit (${evidenceLimit.maxWords}) differs from question word limit (${questionLimit.maxWords}).`,
    );
  }
}

// ============================================
// Publishability gate
// ============================================

export interface IeltsPublishCheck {
  publishable: boolean;
  reasons: string[];
}

/**
 * An item may only be served after HUMAN_APPROVED → PUBLISHED with a reviewer.
 * AI can never publish; validator 'reject' issues block publication outright.
 */
export function assertPublishable(
  question: Pick<IeltsQuestionDefinition, 'validationStatus'> & {
    reviewedBy?: string | null;
    reviewedAt?: Date | null;
  },
  report?: IeltsValidationReport,
): IeltsPublishCheck {
  const reasons: string[] = [];
  if (question.validationStatus !== 'HUMAN_APPROVED') {
    reasons.push(`validationStatus is ${question.validationStatus}; publication requires HUMAN_APPROVED.`);
  }
  if (!question.reviewedBy) reasons.push('reviewedBy is required before publication.');
  if (!question.reviewedAt) reasons.push('reviewedAt is required before publication.');
  if (report && !report.ok) reasons.push('Validator rejected the item; fix the issues before publication.');
  return { publishable: reasons.length === 0, reasons };
}

/** Servability: only PUBLISHED items are ever delivered to students. */
export function isServableStatus(status: IeltsValidationStatus): boolean {
  return status === 'PUBLISHED';
}

/** Count words in a reading passage (for platform length checks). */
export function passageWordCount(passage: string): number {
  return countIeltsWords(passage);
}
