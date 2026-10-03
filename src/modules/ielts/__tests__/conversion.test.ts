// ============================================
// IELTS Raw→Band Conversion — versioned anchors + estimate semantics
// ============================================
import { describe, expect, it } from 'vitest';
import {
  IELTS_CONVERSION_TABLES,
  estimateBandFromRawScore,
  estimateComponentBandForAttempt,
  getConversionTable,
  isBandEstimate,
} from '../domain/conversion';

describe('conversion tables — provenance is explicit', () => {
  it('tables carry official source + version + variance notes', () => {
    expect(IELTS_CONVERSION_TABLES.length).toBeGreaterThanOrEqual(3);
    for (const table of IELTS_CONVERSION_TABLES) {
      expect(table.source).toContain('ielts.org');
      expect(table.sourceKind).toBe('OFFICIAL_PUBLIC_AVERAGE');
      expect(table.version).toMatch(/official-average/);
      expect(table.notes).toMatch(/var(ies|y)/i);
    }
  });

  it('listening table is shared; reading tables differ by test type', () => {
    expect(getConversionTable('ACADEMIC', 'LISTENING')?.id).toBe('listening-avg-2026-10');
    expect(getConversionTable('GENERAL_TRAINING', 'LISTENING')?.id).toBe('listening-avg-2026-10');
    expect(getConversionTable('ACADEMIC', 'READING')?.id).toBe('academic-reading-avg-2026-10');
    expect(getConversionTable('GENERAL_TRAINING', 'READING')?.id).toBe('general-training-reading-avg-2026-10');
  });

  it('Academic and GT Reading anchors are NOT identical', () => {
    const academic = getConversionTable('ACADEMIC', 'READING');
    const general = getConversionTable('GENERAL_TRAINING', 'READING');
    expect(academic?.anchors).not.toEqual(general?.anchors);
  });
});

describe('estimateBandFromRawScore — ranges, never false precision', () => {
  const listening = getConversionTable('ACADEMIC', 'LISTENING')!;

  it('raw 30 → Band 7 anchor met, Band 8 not met → range [7, 8)', () => {
    const estimate = estimateBandFromRawScore(listening, 30);
    expect(estimate.estimate).toBe(true);
    expect(estimate.minBand).toBe(7);
    expect(estimate.maxBandExclusive).toBe(8);
    expect(estimate.displayRange).toBe('7.0–7.5');
  });

  it('raw 35 → top anchor → 8.0+ with inclusive max', () => {
    const estimate = estimateBandFromRawScore(listening, 35);
    expect(estimate.minBand).toBe(8);
    expect(estimate.maxBandExclusive).toBeNull();
    expect(estimate.displayRange).toBe('8.0+');
  });

  it('raw below the lowest anchor → "Below 5.0", never clamped to a fake band', () => {
    const estimate = estimateBandFromRawScore(listening, 9);
    expect(estimate.displayRange).toBe('Below 5.0');
    expect(estimate.minBand).toBe(0);
  });

  it('anchor boundary values map deterministically', () => {
    expect(estimateBandFromRawScore(listening, 16).minBand).toBe(5);
    expect(estimateBandFromRawScore(listening, 15).displayRange).toBe('Below 5.0');
    expect(estimateBandFromRawScore(listening, 23).minBand).toBe(6);
    expect(estimateBandFromRawScore(listening, 22).minBand).toBe(5);
  });

  it('GT Reading has its own anchor set (Band 4 starts at 15)', () => {
    const gt = getConversionTable('GENERAL_TRAINING', 'READING')!;
    expect(estimateBandFromRawScore(gt, 15).minBand).toBe(4);
    expect(estimateBandFromRawScore(gt, 14).displayRange).toBe('Below 4.0');
  });
});

describe('estimateComponentBandForAttempt — subset safety', () => {
  it('a 40-question component maps to the official scale', () => {
    const result = estimateComponentBandForAttempt({
      testType: 'ACADEMIC',
      component: 'LISTENING',
      rawScore: 30,
      rawTotal: 40,
    });
    expect(isBandEstimate(result)).toBe(true);
  });

  it('a practice subset is NOT comparable and says so', () => {
    const result = estimateComponentBandForAttempt({
      testType: 'ACADEMIC',
      component: 'READING',
      rawScore: 10,
      rawTotal: 10,
    });
    expect(isBandEstimate(result)).toBe(false);
    if (!isBandEstimate(result)) {
      expect(result.reason).toContain('NOT_COMPARABLE_SUBSET');
    }
  });
});
