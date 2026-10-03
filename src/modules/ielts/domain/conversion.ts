// ============================================
// IELTS Raw Score → Band Conversion — VERSIONED & PROVENANCE-EXPLICIT
// ============================================
// The official source states the precise number of marks needed for each band
// "will vary slightly from test version to test version". The platform therefore
// does NOT hard-code a false universal mapping. Conversion tables store the
// OFFICIAL published averages as anchor points and conversions are reported as
// ESTIMATE RANGES, never exact bands.
//
// Source: https://www.ielts.org/take-a-test/your-results/ielts-scoring-in-detail
// Checked: 2026-10-03 (see docs/ielts/IELTS_SOURCES.md #8)
// ============================================

import type { IeltsBandEstimate, IeltsTestType } from './types';
import { formatBandRange } from './bands';

export interface IeltsConversionAnchor {
  band: number;
  marks: number;
}

export interface IeltsScoreConversionTable {
  id: string;
  testType: IeltsTestType;
  component: 'LISTENING' | 'READING';
  version: string;
  source: string;
  sourceKind: 'OFFICIAL_PUBLIC_AVERAGE';
  anchors: readonly IeltsConversionAnchor[];
  notes: string;
}

const OFFICIAL_SCORING_URL = 'https://www.ielts.org/take-a-test/your-results/ielts-scoring-in-detail';
const VARIANCE_NOTE =
  'Precise mark cut-offs vary slightly from test version to test version; this is an estimate range, not an official conversion.';

/** Anchor tables transcribed from the official scoring page (checked 2026-10-03). */
export const IELTS_CONVERSION_TABLES: readonly IeltsScoreConversionTable[] = [
  {
    id: 'listening-avg-2026-10',
    testType: 'ACADEMIC', // Listening is shared with GT; one table, resolved by component.
    component: 'LISTENING',
    version: 'official-average-2026-10',
    source: OFFICIAL_SCORING_URL,
    sourceKind: 'OFFICIAL_PUBLIC_AVERAGE',
    anchors: [
      { band: 5, marks: 16 },
      { band: 6, marks: 23 },
      { band: 7, marks: 30 },
      { band: 8, marks: 35 },
    ],
    notes: `Official average marks per band for Listening. ${VARIANCE_NOTE}`,
  },
  {
    id: 'academic-reading-avg-2026-10',
    testType: 'ACADEMIC',
    component: 'READING',
    version: 'official-average-2026-10',
    source: OFFICIAL_SCORING_URL,
    sourceKind: 'OFFICIAL_PUBLIC_AVERAGE',
    anchors: [
      { band: 5, marks: 15 },
      { band: 6, marks: 23 },
      { band: 7, marks: 30 },
      { band: 8, marks: 35 },
    ],
    notes: `Official average marks per band for Academic Reading. ${VARIANCE_NOTE}`,
  },
  {
    id: 'general-training-reading-avg-2026-10',
    testType: 'GENERAL_TRAINING',
    component: 'READING',
    version: 'official-average-2026-10',
    source: OFFICIAL_SCORING_URL,
    sourceKind: 'OFFICIAL_PUBLIC_AVERAGE',
    anchors: [
      { band: 4, marks: 15 },
      { band: 5, marks: 23 },
      { band: 6, marks: 30 },
      { band: 7, marks: 35 },
    ],
    notes: `Official average marks per band for General Training Reading. ${VARIANCE_NOTE}`,
  },
];

/**
 * Resolve the conversion table for a component. Listening is shared between
 * Academic and General Training; Reading differs.
 */
export function getConversionTable(
  testType: IeltsTestType,
  component: 'LISTENING' | 'READING',
): IeltsScoreConversionTable | null {
  if (component === 'LISTENING') {
    return IELTS_CONVERSION_TABLES.find((t) => t.component === 'LISTENING') ?? null;
  }
  return IELTS_CONVERSION_TABLES.find((t) => t.testType === testType && t.component === 'READING') ?? null;
}

/**
 * Estimate a band RANGE from a raw score using official anchor points.
 * Never returns a single "exact" band; always `estimate: true`.
 */
export function estimateBandFromRawScore(
  table: IeltsScoreConversionTable,
  rawScore: number,
): IeltsBandEstimate {
  const anchors = [...table.anchors].sort((a, b) => a.band - b.band);
  const lowest = anchors[0];
  const highest = anchors[anchors.length - 1];

  // Determine the highest anchor band whose mark threshold is met.
  let metBand: number | null = null;
  let nextBand: number | null = null;
  for (const anchor of anchors) {
    if (rawScore >= anchor.marks) metBand = anchor.band;
    else {
      nextBand = anchor.band;
      break;
    }
  }

  if (metBand === null) {
    // Below the lowest published anchor.
    return {
      estimate: true,
      scoringMethod: 'DETERMINISTIC_OBJECTIVE',
      component: table.component,
      minBand: 0,
      maxBandExclusive: lowest.band,
      displayRange: `Below ${lowest.band.toFixed(1)}`,
      rawScore,
      rawTotal: 40,
      tableId: table.id,
      tableVersion: table.version,
      source: table.source,
      sourceKind: table.sourceKind,
      officialNote: `${table.notes} Fewer than ${lowest.marks}/40 marks is below the lowest published band anchor.`,
    };
  }

  if (metBand >= highest.band) {
    return {
      estimate: true,
      scoringMethod: 'DETERMINISTIC_OBJECTIVE',
      component: table.component,
      minBand: highest.band,
      maxBandExclusive: null, // 9.0 inclusive upper end
      displayRange: formatBandRange(highest.band, null),
      rawScore,
      rawTotal: 40,
      tableId: table.id,
      tableVersion: table.version,
      source: table.source,
      sourceKind: table.sourceKind,
      officialNote: table.notes,
    };
  }

  // metBand is below the highest anchor; `nextBand` is the next anchor above.
  const upper = nextBand ?? metBand + 1;
  return {
    estimate: true,
    scoringMethod: 'DETERMINISTIC_OBJECTIVE',
    component: table.component,
    minBand: metBand,
    maxBandExclusive: upper,
    displayRange: formatBandRange(metBand, upper),
    rawScore,
    rawTotal: 40,
    tableId: table.id,
    tableVersion: table.version,
    source: table.source,
    sourceKind: table.sourceKind,
    officialNote: table.notes,
  };
}

/** Full-length shape required before a raw score may be compared to the official scale. */
export const IELTS_FULL_COMPONENT_QUESTION_COUNT = 40;

/**
 * Convert an attempt raw score into a band estimate.
 * Practice subsets (≠ 40 questions) are NOT comparable to the official scale —
 * the result explains why instead of pretending a small set maps to a band.
 */
export function estimateComponentBandForAttempt(args: {
  testType: IeltsTestType;
  component: 'LISTENING' | 'READING';
  rawScore: number;
  rawTotal: number;
}): IeltsBandEstimate | { notComparable: true; reason: string; rawScore: number; rawTotal: number } {
  if (args.rawTotal !== IELTS_FULL_COMPONENT_QUESTION_COUNT) {
    return {
      notComparable: true,
      reason: `NOT_COMPARABLE_SUBSET: this practice set has ${args.rawTotal} questions; the official scale applies to the full 40-question component.`,
      rawScore: args.rawScore,
      rawTotal: args.rawTotal,
    };
  }
  const table = getConversionTable(args.testType, args.component);
  if (!table) {
    return {
      notComparable: true,
      reason: `NO_CONVERSION_TABLE: no published anchor table for ${args.testType} ${args.component}.`,
      rawScore: args.rawScore,
      rawTotal: args.rawTotal,
    };
  }
  return estimateBandFromRawScore(table, args.rawScore);
}

export function isBandEstimate(
  value: IeltsBandEstimate | { notComparable: true; reason: string },
): value is IeltsBandEstimate {
  return (value as IeltsBandEstimate).estimate === true;
}
