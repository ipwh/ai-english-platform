// ============================================
// R3.10-K Phase 9 — R3: Blind Marking & Adjudication Tooling
//
// - buildMarkerPack: deterministic blinded marker pack. Contains ONLY
//   task / script / rubric / scope / instructions / anonymous fixture id.
//   NO AI scores, predictions, feedback, model info, calibration results,
//   other marker scores, or adjudication results — enforced by the pack
//   shape itself.
// - appendMarkerScore: append-only marker score intake. Never mutates
//   the script, never mutates other markers, never collapses disagreement.
// - applyAdjudication: append-only adjudication record. Original marker
//   scores are always preserved; resolvedScores are decision output only.
// ============================================

import {
  validateMarkerScoreEntry,
  validateHumanMarkerFixture,
} from "./human-marker";
import type {
  AdjudicationRecord,
  HumanMarkerCalibrationFixture,
  HumanMarkerScoreEntry,
} from "./types";

export const MARKER_PACK_VERSION = "MARKER_PACK_V1";

export interface MarkerPack {
  packVersion: string;
  fixtureId: string;
  taskId: string;
  taskPartScope: string | null;
  scriptText: string;
  rubricVersion: string;
  rubricText: string | null;
  instructions: string[];
  markerIndex: number;
}

export class MarkingRejectedError extends Error {
  constructor(public reasons: string[]) {
    super(`MARKING_REJECTED: ${reasons.join("; ")}`);
    this.name = "MarkingRejectedError";
  }
}

/**
 * Build a blinded marker pack. Deterministic: identical inputs produce
 * byte-identical output. The pack contains no AI/score/prediction fields
 * by construction.
 */
export function buildMarkerPack(
  fixture: HumanMarkerCalibrationFixture,
  options: { markerIndex?: number; rubricText?: string } = {},
): MarkerPack {
  const markerIndex = options.markerIndex ?? 1;
  return {
    packVersion: MARKER_PACK_VERSION,
    fixtureId: fixture.id,
    taskId: fixture.provenance.taskId,
    taskPartScope: fixture.taskPartScope ?? null,
    scriptText: fixture.studentScript,
    rubricVersion: fixture.rubricVersion,
    rubricText: options.rubricText ?? null,
    instructions: [
      "Mark ONLY the script text below against the declared rubric version.",
      "You must NOT consult, receive, or record any AI score, AI feedback, prediction, model information, pedagogical target level, calibration result, or another marker's scores.",
      "Record markerId, markedAt (ISO), per-dimension C/L/O scores, and overall score where applicable.",
      "Mark independently — disagreement with other markers is expected and preserved.",
    ],
    markerIndex,
  };
}

/** Deterministic serialization of a marker pack (stable key order). */
export function serializeMarkerPack(pack: MarkerPack): string {
  return `${JSON.stringify(pack, null, 2)}\n`;
}

/**
 * Append ONE independent marker score to a fixture. Append-only: the
 * script text and all existing marker scores are preserved untouched.
 * AI prediction fields are rejected via validateMarkerScoreEntry.
 */
export function appendMarkerScore(
  fixture: HumanMarkerCalibrationFixture,
  entry: HumanMarkerScoreEntry,
): HumanMarkerCalibrationFixture {
  const errors = validateMarkerScoreEntry(entry as unknown as Record<string, unknown>);
  if (errors.length > 0) {
    throw new MarkingRejectedError(errors);
  }
  // A marker may not see or duplicate another marker's submission — same
  // markerId appending again would overwrite history, so it is rejected.
  if ((fixture.markerScores ?? []).some(m => m.markerId === entry.markerId)) {
    throw new MarkingRejectedError([
      `marker ${entry.markerId} has already submitted for this fixture — submissions are append-only and never overwritten`,
    ]);
  }
  const updated: HumanMarkerCalibrationFixture = {
    ...fixture,
    markerScores: [...(fixture.markerScores ?? []), entry],
  };
  const validation = validateHumanMarkerFixture(updated);
  if (!validation.ok) {
    throw new MarkingRejectedError(validation.errors);
  }
  return updated;
}

/**
 * Record an adjudication. The original markerScores and top-level scores
 * are NEVER mutated; resolvedScores are decision output only.
 * A resolved adjudication is immutable.
 */
export function applyAdjudication(
  fixture: HumanMarkerCalibrationFixture,
  record: AdjudicationRecord,
): HumanMarkerCalibrationFixture {
  if (fixture.adjudication?.status === "resolved") {
    throw new MarkingRejectedError([
      "adjudication already resolved — adjudication records are immutable",
    ]);
  }
  const updated: HumanMarkerCalibrationFixture = {
    ...fixture,
    adjudication: record,
  };
  const validation = validateHumanMarkerFixture(updated);
  if (!validation.ok) {
    throw new MarkingRejectedError(validation.errors);
  }
  return updated;
}
