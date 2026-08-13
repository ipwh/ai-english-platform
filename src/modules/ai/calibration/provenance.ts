// ============================================
// R3.10-F: Provenance & Validation (fail closed)
//
// - computeProvenanceHash: SHA-256 over canonical source slices so
//   every expected value can answer "where did this come from?"
// - classifyFixtureKind: synthetic vs authoritative discrimination.
//   A fixture becomes authoritative ONLY through explicit HKEAA
//   provenance — never silently.
// - validateAuthoritativeFixture: fail-closed validation enforcing
//   provenance completeness and the no-fabricated-criterion-scores
//   rule.
// ============================================

import { createHash } from "node:crypto";
import type {
  AuthoritativeCalibrationFixture,
  CalibrationFixtureKind,
  FixtureValidationResult,
} from "./types";

/** SHA-256 hex digest over the given canonical parts (joined with "\n"). */
export function computeProvenanceHash(parts: string[]): string {
  return createHash("sha256").update(parts.join("\n"), "utf8").digest("hex");
}

/**
 * Discriminate a fixture between the three categories.
 *
 * - human-marker-calibration: object explicitly declaring
 *   kind === "human-marker-calibration" (future marker evidence).
 * - authoritative-calibration: object with provenance declaring
 *   sourceOrganization === "hkeaa".
 * - synthetic-regression: anything else (existing GoldenFixture /
 *   calibration-draft fixtures).
 *
 * Transitions are one-way by construction: synthetic fixtures never
 * carry the explicit markers above, and gaining them creates a NEW
 * fixture, never a mutation of the synthetic one. Serialization does
 * not change the category.
 */
export function classifyFixtureKind(input: unknown): CalibrationFixtureKind {
  if (
    typeof input === "object"
    && input !== null
    && (input as { kind?: unknown }).kind === "human-marker-calibration"
  ) {
    return "human-marker-calibration";
  }
  if (
    typeof input === "object"
    && input !== null
    && "provenance" in input
    && typeof (input as { provenance: unknown }).provenance === "object"
    && (input as { provenance: unknown }).provenance !== null
    && (input as { provenance: { sourceOrganization?: unknown } }).provenance
      .sourceOrganization === "hkeaa"
  ) {
    return "authoritative-calibration";
  }
  return "synthetic-regression";
}

const HKEAA_PAPERS = new Set(["Paper 1", "Paper 2", "Paper 3", "Paper 4"]);
const VALID_LEVELS = new Set([1, 2, 3, 4, 5]);
const VALID_STATUSES = new Set([
  "ingested",
  "ingested-level-only",
  "quarantined-needs-manual-verification",
  "quarantined-duplicate-source",
]);
const VALID_EXTRACTION = new Set([
  "complete-script-text",
  "script-not-in-extraction",
  "video-no-transcript",
]);

/**
 * Fail-closed validation of an authoritative calibration fixture.
 *
 * Enforces (among others):
 *   - full provenance present and well-formed
 *   - published numeric values are finite numbers
 *   - criterion scores may exist ONLY when
 *     criterionScoresOfficiallyPublished is true (no fabricated
 *     criterion splits of an official total)
 *   - a runnable fixture ("ingested") must have script text
 *   - level-only fixtures must have a published level
 */
export function validateAuthoritativeFixture(
  fixture: AuthoritativeCalibrationFixture,
): FixtureValidationResult {
  const errors: string[] = [];
  const push = (msg: string) => errors.push(msg);

  if (fixture.kind !== "authoritative-calibration") {
    push(`kind must be "authoritative-calibration" (got ${JSON.stringify(fixture.kind)})`);
  }
  if (typeof fixture.id !== "string" || fixture.id.trim() === "") {
    push("id must be a non-empty string");
  }
  if (fixture.schemaVersion !== 1) {
    push(`schemaVersion must be 1 (got ${JSON.stringify(fixture.schemaVersion)})`);
  }
  if (!fixture.provenance || typeof fixture.provenance !== "object") {
    push("provenance is required for authoritative fixtures");
    return { ok: false, errors };
  }
  const p = fixture.provenance;
  if (p.sourceOrganization !== "hkeaa") {
    push(`provenance.sourceOrganization must be "hkeaa" (got ${JSON.stringify(p.sourceOrganization)})`);
  }
  if (typeof p.sourceDocument !== "string" || p.sourceDocument.trim() === "") {
    push("provenance.sourceDocument must be a non-empty string");
  }
  if (!Number.isInteger(p.sourceYear) || p.sourceYear < 2010 || p.sourceYear > 2100) {
    push(`provenance.sourceYear must be a plausible integer (got ${JSON.stringify(p.sourceYear)})`);
  }
  if (!HKEAA_PAPERS.has(p.paper)) {
    push(`provenance.paper must be one of Paper 1-4 (got ${JSON.stringify(p.paper)})`);
  }
  if (typeof p.taskId !== "string" || p.taskId.trim() === "") {
    push("provenance.taskId must be a non-empty string");
  }
  if (typeof p.sectionId !== "string" || p.sectionId.trim() === "") {
    push("provenance.sectionId must be a non-empty string");
  }
  if (typeof p.sourceFile !== "string" || p.sourceFile.trim() === "") {
    push("provenance.sourceFile must be a non-empty string");
  }
  if (typeof p.sourceHash !== "string" || !/^[0-9a-f]{64}$/.test(p.sourceHash)) {
    push("provenance.sourceHash must be a sha256 hex digest");
  }
  if (!VALID_EXTRACTION.has(p.extractionStatus)) {
    push(`provenance.extractionStatus invalid: ${JSON.stringify(p.extractionStatus)}`);
  }

  const isFiniteNumber = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const isNullOrFinite = (v: unknown) => v === null || isFiniteNumber(v);

  for (const [name, value] of [
    ["publishedOverallScore", fixture.publishedOverallScore],
    ["publishedContentScore", fixture.publishedContentScore],
    ["publishedLanguageScore", fixture.publishedLanguageScore],
    ["publishedOrganizationScore", fixture.publishedOrganizationScore],
  ] as const) {
    if (!isNullOrFinite(value)) {
      push(`${name} must be null or a finite number (got ${JSON.stringify(value)})`);
    }
  }

  if (fixture.publishedLevel !== null && !VALID_LEVELS.has(fixture.publishedLevel)) {
    push(`publishedLevel must be 1-5 or null (got ${JSON.stringify(fixture.publishedLevel)})`);
  }

  if (
    !fixture.criterionScoresOfficiallyPublished
    && (
      fixture.publishedContentScore !== null
      || fixture.publishedLanguageScore !== null
      || fixture.publishedOrganizationScore !== null
    )
  ) {
    push(
      "criterion scores present but criterionScoresOfficiallyPublished is false — "
      + "criterion scores may not be derived or split from an official total",
    );
  }

  if (!VALID_STATUSES.has(fixture.calibrationStatus)) {
    push(`calibrationStatus invalid: ${JSON.stringify(fixture.calibrationStatus)}`);
  }

  if (fixture.calibrationStatus === "ingested") {
    if (fixture.studentScript === null || fixture.studentScript.trim() === "") {
      push('status "ingested" requires non-null studentScript (runnable fixture)');
    }
    const hasPublishedValue = fixture.publishedLevel !== null || fixture.publishedOverallScore !== null;
    if (!hasPublishedValue) {
      push('status "ingested" requires a published level or published overall score');
    }
  }

  if (
    fixture.calibrationStatus === "ingested-level-only"
    && fixture.publishedLevel === null
    && fixture.publishedOverallScore === null
  ) {
    push('status "ingested-level-only" requires a published level or published overall score');
  }

  if (
    fixture.provenance.extractionStatus === "script-not-in-extraction"
    && fixture.studentScript !== null
  ) {
    push(
      'extractionStatus "script-not-in-extraction" conflicts with non-null studentScript',
    );
  }

  if (typeof fixture.rubricVersion !== "string" || fixture.rubricVersion.trim() === "") {
    push("rubricVersion must be a non-empty string (official source reference)");
  }
  if (typeof fixture.notes !== "string") {
    push("notes must be a string");
  }

  return { ok: errors.length === 0, errors };
}
