// ============================================
// IELTS Answer Normalization — conservative by design
// ============================================
// Principles (docs/ielts/IELTS_SCORING.md §6):
//   * deterministic and conservative — NEVER turn an invalid answer into a
//     correct one (official IELTS penalises incorrect spelling).
//   * allowed: trim, case-folding, whitespace collapse, typographic
//     unification, trailing punctuation, number-word ↔ figure equivalence.
//   * forbidden: stemming, spell correction, synonym expansion, article
//     dropping, fuzzy matching.
// ============================================

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15',
  sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
  thirty: '30', forty: '40', fifty: '50', sixty: '60', seventy: '70',
  eighty: '80', ninety: '90', hundred: '100', thousand: '1000',
  million: '1000000',
};

/** Normalize a free-text answer (completion / short answer families). */
export function normalizeIeltsAnswer(text: string): string {
  let value = text
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019\u02BC]/g, "'") // curly apostrophes → '
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-'); // en/em dash → hyphen

  // Strip a single trailing terminal punctuation mark (does not touch
  // internal dots — abbreviations like "e.g." keep their internal dot).
  value = value.replace(/[.,;:!?]$/, '');

  return value;
}

/** Normalize a True/False/Not Given answer to its canonical token, or null. */
export function normalizeTrueFalseNotGiven(text: string): 'TRUE' | 'FALSE' | 'NOT GIVEN' | null {
  const v = normalizeAgreementToken(text);
  if (v === 'true' || v === 't') return 'TRUE';
  if (v === 'false' || v === 'f') return 'FALSE';
  if (v === 'notgiven' || v === 'ng' || v === 'not-given') return 'NOT GIVEN';
  return null;
}

/** Normalize a Yes/No/Not Given answer to its canonical token, or null. */
export function normalizeYesNoNotGiven(text: string): 'YES' | 'NO' | 'NOT GIVEN' | null {
  const v = normalizeAgreementToken(text);
  if (v === 'yes' || v === 'y') return 'YES';
  if (v === 'no' || v === 'n') return 'NO';
  if (v === 'notgiven' || v === 'ng' || v === 'not-given') return 'NOT GIVEN';
  return null;
}

function normalizeAgreementToken(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.!?]$/, '')
    .replace(/\s*-\s*/g, '-') // "not - given" → "not-given" for token checks
    .replace(/not\s+given/g, 'notgiven'); // "not given" → "notgiven"
}

/**
 * Numeric equivalence: converts spelled-out numbers to figures so
 * "fifteen" and "15" compare equal (official: numbers may be figures or words).
 * Only converts a token that is a single number word; mixed strings keep their
 * other tokens normalized as text.
 */
export function normalizeNumbers(text: string): string {
  return text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)\b/gi,
    (match) => NUMBER_WORDS[match.toLowerCase()] ?? match,
  );
}

/**
 * Full comparison key for completion-family answers:
 * conservative normalization + numeric equivalence.
 */
export function completionCompareKey(text: string): string {
  return normalizeNumbers(normalizeIeltsAnswer(text));
}

/** Remove a leading option letter prefix ("B. At ten" / "B At ten" / "B) At ten"). */
export function stripOptionPrefix(text: string): string {
  return text.replace(/^\s*\(?([A-Za-z]|\d{1,2}|[ivxIVX]+)[.)\]]\s+/, '');
}

/** Normalize a multiple-choice/matching code (letter or roman numeral). */
export function normalizeOptionCode(text: string): string {
  return text.trim().toLowerCase().replace(/[.)\]]$/, '');
}
