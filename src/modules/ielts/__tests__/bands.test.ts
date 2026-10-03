// ============================================
// IELTS Band Arithmetic — official rounding tests
// ============================================
import { describe, expect, it } from 'vitest';
import {
  computeOverallBand,
  computeWritingSectionBand,
  formatBand,
  formatBandRange,
  isValidBand,
  roundToHalfBand,
} from '../domain/bands';

describe('isValidBand', () => {
  it('accepts whole and half bands within 1–9 (and 0)', () => {
    expect(isValidBand(0)).toBe(true);
    expect(isValidBand(5)).toBe(true);
    expect(isValidBand(6.5)).toBe(true);
    expect(isValidBand(9)).toBe(true);
  });

  it('rejects non-half values and out-of-range values', () => {
    expect(isValidBand(7.13)).toBe(false);
    expect(isValidBand(6.3)).toBe(false);
    expect(isValidBand(9.5)).toBe(false);
    expect(isValidBand(-1)).toBe(false);
    expect(isValidBand(Number.NaN)).toBe(false);
  });
});

describe('roundToHalfBand — official .25/.75 rule (verified against official examples)', () => {
  it('6.25 → 6.5 (official example A)', () => {
    expect(roundToHalfBand(6.25)).toBe(6.5);
  });

  it('3.875 → 4.0 (official example B)', () => {
    expect(roundToHalfBand(3.875)).toBe(4.0);
  });

  it('6.125 → 6.0 (official example C)', () => {
    expect(roundToHalfBand(6.125)).toBe(6.0);
  });

  it('rounds .75 up to the next whole band', () => {
    expect(roundToHalfBand(6.75)).toBe(7.0);
  });

  it('never produces false precision', () => {
    for (const value of [4.1, 4.24, 5.6, 6.99, 7.13]) {
      const rounded = roundToHalfBand(value);
      expect(isValidBand(rounded)).toBe(true);
    }
  });

  it('throws on non-finite input (fail loud, never fabricate)', () => {
    expect(() => roundToHalfBand(Number.NaN)).toThrow();
  });
});

describe('computeOverallBand — average of four components', () => {
  it('rounds per official examples', () => {
    // Test taker A: 6.5 / 6.5 / 5.0 / 7.0 → average 6.25 → 6.5
    expect(computeOverallBand([6.5, 6.5, 5.0, 7.0])).toBe(6.5);
    // Test taker B: 4.0 / 3.5 / 4.0 / 4.0 → average 3.875 → 4.0
    expect(computeOverallBand([4.0, 3.5, 4.0, 4.0])).toBe(4.0);
    // Test taker C: 6.5 / 6.5 / 5.5 / 6.0 → average 6.125 → 6.0
    expect(computeOverallBand([6.5, 6.5, 5.5, 6.0])).toBe(6.0);
  });

  it('rejects invalid component bands and partial component sets (fail loud)', () => {
    expect(() => computeOverallBand([6.5, 7.13, 5.0, 6.0])).toThrow();
    expect(() => computeOverallBand([])).toThrow();
    // Official overall band = average of FOUR section bands: a partial set must
    // never be averaged (and extras are rejected too).
    expect(() => computeOverallBand([6.5, 6.5, 5.0])).toThrow();
    expect(() => computeOverallBand([6.5, 6.5, 5.0, 7.0, 7.0])).toThrow();
  });

  it('rounds every eighth-of-a-band average boundary (.25↑ / .75↑ matrix)', () => {
    const cases: Array<[readonly number[], number]> = [
      [[6, 6, 6, 6], 6], //          6.000 → 6.0
      [[6, 6, 6, 6.5], 6], //        6.125 → 6.0
      [[6, 6, 6.5, 6.5], 6.5], //    6.250 → 6.5 (official: .25 rounds up)
      [[6, 6.5, 6.5, 6.5], 6.5], //  6.375 → 6.5
      [[6.5, 6.5, 6.5, 6.5], 6.5], // 6.500 → 6.5
      [[6.5, 6.5, 6.5, 7], 6.5], //  6.625 → 6.5
      [[6.5, 6.5, 7, 7], 7], //      6.750 → 7.0 (official: .75 rounds up)
      [[6.5, 7, 7, 7], 7], //        6.875 → 7.0
      [[0, 0, 0, 0], 0],
      [[9, 9, 9, 9], 9],
    ];
    for (const [bands, expected] of cases) {
      expect(computeOverallBand(bands)).toBe(expected);
    }
  });
});

describe('computeWritingSectionBand — Task 2 double weight', () => {
  it('weights Task 2 twice Task 1', () => {
    // (5.0 + 2×7.0)/3 = 6.333… → 6.5
    expect(computeWritingSectionBand(5.0, 7.0)).toBe(6.5);
    // (6.0 + 2×6.0)/3 = 6.0
    expect(computeWritingSectionBand(6.0, 6.0)).toBe(6.0);
    // (7.0 + 2×5.0)/3 = 5.666… → 5.5
    expect(computeWritingSectionBand(7.0, 5.0)).toBe(5.5);
  });
});

describe('formatting', () => {
  it('formats bands with one decimal place', () => {
    expect(formatBand(7)).toBe('7.0');
    expect(formatBand(6.5)).toBe('6.5');
  });

  it('formats ranges without false precision', () => {
    expect(formatBandRange(6.5, 7)).toBe('6.5');
    expect(formatBandRange(6, 7)).toBe('6.0–6.5');
    expect(formatBandRange(8, null)).toBe('8.0+');
  });
});
