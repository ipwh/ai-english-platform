// ============================================
// R3.10-K Phase 9 — R1: Safe External Evidence Intake
//
// Converts an EXTERNAL submission (manifest + verbatim script) into an
// UNVERIFIED human-marker fixture — fail-closed:
//   - scriptAuthorship must be explicitly "HUMAN_AUTHORED"
//     (AI_AUTHORED / UNKNOWN / omitted → rejected)
//   - the existing intake checker runs for overall-scored submissions
//   - criterion-only submissions are validated against the CLO contract
//   - level-only submissions are REJECTED (never human-marker evidence)
//   - output is ALWAYS unverified — intake never verifies
//   - no LLM / AI pipeline is involved anywhere
// ============================================

import { createHash } from "node:crypto";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkHumanMarkerEvidenceIntake } from "./intake";
import {
  buildHumanMarkerFixtureId,
  validateHumanMarkerFixture,
} from "./human-marker";
import type {
  HKEAAPaper,
  HumanMarkerCalibrationFixture,
} from "./types";

export type ScriptAuthorship = "HUMAN_AUTHORED" | "AI_AUTHORED" | "UNKNOWN";

export interface ExternalEvidenceSubmission {
  evidenceId: string;
  sourceDocument?: string;
  /** File whose exact bytes become sourceHash (never normalized/OCR). */
  sourceFilePath?: string;
  /** SHA-256 of the exact source artifact — required when no file given. */
  sourceHash?: string;
  year: number;
  paper: HKEAAPaper;
  /** Machine-stable task reference, e.g. "P2-2024-PartB-Q2". */
  task: string;
  taskPartScope?: string;
  scriptText: string;
  scriptAuthorship: ScriptAuthorship;
  overallScore?: number;
  overallScale?: number;
  scoreLabel?: string;
  contentScore?: number;
  languageScore?: number;
  organizationScore?: number;
  publishedLevel?: string;
  markerBasis?: "official-marking-record" | "teacher-marking" | "research-annotation" | "unknown";
  provenanceOrganization?: string;
  comparabilityNotes?: string;
  notes?: string;
}

export class IntakeRejectedError extends Error {
  constructor(public reasons: string[]) {
    super(`INTAKE_REJECTED: ${reasons.join("; ")}`);
    this.name = "IntakeRejectedError";
  }
}

function sha256OfBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function resolveSourceHash(submission: ExternalEvidenceSubmission): string {
  if (submission.sourceFilePath) {
    if (!existsSync(submission.sourceFilePath)) {
      throw new IntakeRejectedError([`source file not found: ${submission.sourceFilePath}`]);
    }
    return sha256OfBytes(readFileSync(submission.sourceFilePath));
  }
  if (submission.sourceHash && /^[0-9a-f]{64}$/.test(submission.sourceHash)) {
    return submission.sourceHash;
  }
  throw new IntakeRejectedError([
    "sourceHash (sha256 of the exact source artifact) or sourceFilePath is REQUIRED",
  ]);
}

function hasCriterionScores(s: ExternalEvidenceSubmission): boolean {
  return (
    s.contentScore !== undefined
    || s.languageScore !== undefined
    || s.organizationScore !== undefined
  );
}

/**
 * Convert one external submission into an UNVERIFIED human-marker fixture.
 * Throws IntakeRejectedError on ANY rejection — no partial output.
 */
export function ingestExternalEvidence(
  submission: ExternalEvidenceSubmission,
): HumanMarkerCalibrationFixture {
  const reasons: string[] = [];

  // 1. Authorship: only explicit HUMAN_AUTHORED is acceptable.
  if (submission.scriptAuthorship !== "HUMAN_AUTHORED") {
    reasons.push(
      `scriptAuthorship must be "HUMAN_AUTHORED" (got ${JSON.stringify(submission.scriptAuthorship)}) `
      + "— AI-authored / unknown authorship is rejected fail-closed",
    );
  }

  // 2. Verbatim script required.
  if (typeof submission.scriptText !== "string" || submission.scriptText.trim() === "") {
    reasons.push("scriptText is REQUIRED (verbatim candidate script)");
  }

  const sourceHash = resolveSourceHash(submission);
  const hasOverall = submission.overallScore !== undefined;

  // 3. Overall-scored submissions go through the canonical intake checker.
  if (hasOverall) {
    const check = checkHumanMarkerEvidenceIntake({
      evidenceId: submission.evidenceId,
      sourceDocument: submission.sourceDocument ?? "external-evidence.pdf",
      sourceHash,
      year: submission.year,
      paper: submission.paper,
      task: submission.task,
      taskPartScope: submission.taskPartScope,
      scriptText: submission.scriptText,
      overallScore: submission.overallScore,
      overallScale: submission.overallScale,
      scoreLabel: submission.scoreLabel,
      markerBasis: submission.markerBasis ?? "unknown",
      provenanceOrganization: submission.provenanceOrganization ?? "external-evidence",
      verificationRequired: true,
      notes: submission.notes,
    });
    if (!check.accepted) {
      reasons.push(...check.reasons);
    }
  } else if (hasCriterionScores(submission)) {
    // Criterion-only evidence — validated against the CLO contract directly.
    for (const [name, value] of [
      ["contentScore", submission.contentScore],
      ["languageScore", submission.languageScore],
      ["organizationScore", submission.organizationScore],
    ] as const) {
      if (value !== undefined && !(typeof value === "number" && Number.isFinite(value))) {
        reasons.push(`${name} must be a finite number when present`);
      }
    }
  } else {
    // Level-only / scoreless submissions are NOT human-marker evidence.
    reasons.push(
      "level-only submissions are rejected — human-marker evidence requires at least one directly supplied score",
    );
  }

  if (reasons.length > 0) {
    throw new IntakeRejectedError([...new Set(reasons)].sort());
  }

  const overallScore = submission.overallScore ?? null;
  const criterionScored = hasCriterionScores(submission);

  const fixture: HumanMarkerCalibrationFixture = {
    kind: "human-marker-calibration",
    id: buildHumanMarkerFixtureId({
      year: submission.year,
      paper: submission.paper,
      taskId: submission.task,
      sectionId: submission.evidenceId,
    }),
    schemaVersion: 1,
    studentScript: submission.scriptText,
    provenance: {
      sourceOrganization: submission.provenanceOrganization ?? "external-evidence",
      sourceDocument: submission.sourceDocument ?? "external-evidence.pdf",
      sourceYear: submission.year,
      paper: submission.paper,
      taskId: submission.task,
      sectionId: submission.evidenceId,
      sourceHash,
      extractionMethod: "manual-transcription",
      extractionQuality: "manual-reviewed",
      sourceAuthorityAssertion: {
        assertedBy: "intake-submitter",
        authority: submission.provenanceOrganization ?? "external-evidence",
        acquisitionMethod: "external-submission",
        verificationRequired: true,
        verificationStatus: "unverified",
      },
    },
    rubricVersion: "intake-pending-marker-rubric",
    markerPolicy: "intake: awaiting independent blind marking",
    markerId: null,
    publishedLevel: submission.publishedLevel ?? null,
    scoreProvenance: {
      suppliedBy: "human-marker",
      overallScoreDirectlyScored: hasOverall,
      criterionScoresDirectlyScored: criterionScored,
      overallScoreBasis: hasOverall
        ? submission.overallScale === 21
          ? "clo-total-0-21"
          : submission.overallScale === 100
            ? "percentage-0-100"
            : null
        : null,
      criterionScoreBasis: criterionScored ? "clo-0-7" : null,
      scoringMethod: hasOverall
        ? `published source score (${submission.scoreLabel ?? "overall"})`
        : "published source criterion scores (C/L/O)",
    },
    overallScore,
    contentScore: submission.contentScore ?? null,
    languageScore: submission.languageScore ?? null,
    organizationScore: submission.organizationScore ?? null,
    taskPartScope: submission.taskPartScope,
    comparabilityNotes: submission.comparabilityNotes,
    scriptAuthorship: "HUMAN_AUTHORED",
    // R2: intake ALWAYS produces unverified evidence. Verification is a
    // separate explicit human act — never automatic.
    verification: { status: "unverified" },
    calibrationStatus: "ingested",
    notes: submission.notes ?? "External evidence intake — UNVERIFIED until an explicit verification act.",
  };

  const validation = validateHumanMarkerFixture(fixture);
  if (!validation.ok) {
    throw new IntakeRejectedError([...new Set(validation.errors)].sort());
  }

  return fixture;
}

/**
 * Deterministic, immutable intake output writer. Existing artifacts are
 * never mutated: identical content is a no-op; differing content under
 * the same id FAILS CLOSED.
 */
export function writeIntakeOutput(
  fixtures: HumanMarkerCalibrationFixture[],
  outDir: string,
): { written: string[]; unchanged: string[] } {
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  const unchanged: string[] = [];
  for (const fixture of fixtures) {
    const fileName = `${fixture.id}.json`;
    const target = join(outDir, fileName);
    const body = `${JSON.stringify(fixture, null, 2)}\n`;
    if (existsSync(target)) {
      const existing = readFileSync(target, "utf-8");
      if (existing === body) {
        unchanged.push(fileName);
        continue;
      }
      throw new IntakeRejectedError([
        `${fileName}: content conflict — existing evidence is never mutated in place`,
      ]);
    }
    writeFileSync(target, body, "utf-8");
    written.push(fileName);
  }
  return { written, unchanged };
}
