// ============================================
// IELTS Band Arithmetic — deterministic, official rounding
// ============================================
// Bands are whole or half only (1–9). The overall band rounds per official
// rule: average ending in .25 rounds UP to the next half band; ending in .75
// rounds UP to the next whole band. Verified against the official examples
// (6.25 → 6.5; 3.875 → 4.0; 6.125 → 6.0).
// ============================================

export const IELTS_MIN_BAND = 0;
export const IELTS_MAX_BAND = 9;

/** Is `value` a legal IELTS band (whole or half, 0–9)? */
export function isValidBand(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (value < IELTS_MIN_BAND || value > IELTS_MAX_BAND) return false;
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-9;
}

/**
 * Round any numeric band average to the nearest half band.
 * Uses the platform-wide rounding convention (halves round up at exact .25/.75
 * boundaries because Math.round rounds .5 upward).
 */
export function roundToHalfBand(value: number): number {
  if (!Number.isFinite(value)) throw new Error(`roundToHalfBand: non-finite value ${value}`);
  const clamped = Math.min(Math.max(value, IELTS_MIN_BAND), IELTS_MAX_BAND);
  const rounded = Math.round((clamped + Number.EPSILON) * 2) / 2;
  // Guard against floating point producing e.g. 6.5000000001
  return Math.round(rounded * 2) / 2;
}

/**
 * Overall band = average of four component bands, rounded to nearest half
 * band per the official rule (.25 up, .75 up — which is exactly
 * "round to nearest half, ties upward" given half-band inputs).
 */
export function computeOverallBand(componentBands: readonly number[]): number {
  if (componentBands.length !== 4) {
    // Official overall band = average of the FOUR section bands. A partial set
    // (or extras) must fail loudly — never average an incomplete candidate.
    throw new Error(
      `computeOverallBand: exactly four component bands are required (received ${componentBands.length}).`,
    );
  }
  for (const band of componentBands) {
    if (!isValidBand(band)) {
      throw new Error(`computeOverallBand: invalid component band ${band}`);
    }
  }
  const average = componentBands.reduce((sum, b) => sum + b, 0) / componentBands.length;
  return roundToHalfBand(average);
}

/**
 * Writing section band: Task 2 contributes TWICE as much as Task 1
 * (official). `(task1 + 2 × task2) / 3`, rounded to half band.
 */
export function computeWritingSectionBand(task1Band: number, task2Band: number): number {
  if (!isValidBand(task1Band) || !isValidBand(task2Band)) {
    throw new Error(`computeWritingSectionBand: invalid bands (${task1Band}, ${task2Band})`);
  }
  return roundToHalfBand((task1Band + 2 * task2Band) / 3);
}

// NOTE (2026-10-03 II): a Speaking section-band combiner deliberately does NOT
// exist any more — the platform does not score Speaking (preparation coaching
// only). Do not re-add one without an explicit product + governance decision.


/** Display a band with exactly one decimal place (7 → "7.0"). */
export function formatBand(band: number): string {
  return band.toFixed(1);
}

/** Display a range "6.5–7.0" without false precision. */
export function formatBandRange(minBand: number, maxBandExclusive: number | null): string {
  if (maxBandExclusive === null) return `${formatBand(minBand)}+`;
  // Upper bound is exclusive in anchor space; display the inclusive half band below it.
  const displayMax = Math.max(minBand, maxBandExclusive - 0.5);
  if (displayMax <= minBand) return formatBand(minBand);
  return `${formatBand(minBand)}–${formatBand(displayMax)}`;
}
