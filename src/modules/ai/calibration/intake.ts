// ============================================
// R3.10-J: Human-Marker Evidence Intake Checker
//
// Deterministic, offline checker for future evidence candidates.
// Reports field-by-field presence, provenance quality, evidence
// class, and acceptance/rejection reasons. NEVER writes anything
// and NEVER invents missing values — a missing field is reported
// MISSING, never filled in.
//
// Acceptance requirements (ACCEPT_OVERALL_SCORE) — ALL required:
//   1. verbatim student script
//   2. task identity (year + paper + task)
//   3. explicit overall score
//   4. established scale (denominator 21 or 100)
//   5. explicit score label in the source
//   6. provenance class AUTHORITATIVE_OFFICIAL or VERIFIED_HUMAN_MARKER
//   7. stable source hash (sha256)
//   8. no OCR reconstruction affecting the score
//   9. no conflicting duplicate
//  10. no inferred score (structurally impossible — score must be explicit)
// ============================================

import type {
  HumanMarkerEvidenceClass,
  HumanMarkerEvidenceIntake,
  HumanMarkerIntakeReport,
  HumanMarkerProvenanceClass,
  IntakeFieldStatus,
} from "./types";

/**
 * Derive the provenance quality level from DECLARED fields only.
 * Never guessed: absence of declarations yields UNKNOWN.
 */
export function classifyProvenanceQuality(
  intake: HumanMarkerEvidenceIntake,
): HumanMarkerProvenanceClass {
  if (intake.ocrDerived === true) return "OCR_DERIVED";
  const org = (intake.provenanceOrganization ?? "").toLowerCase();
  const basis = intake.markerBasis ?? "unknown";
  if (org === "hkeaa" && basis === "official-marking-record") {
    return "AUTHORITATIVE_OFFICIAL";
  }
  if (basis === "official-marking-record") return "VERIFIED_HUMAN_MARKER";
  if (basis === "teacher-marking") return "TEACHER_MARKED";
  if (basis === "research-annotation") return "RESEARCH_DATASET";
  if (org !== "" && org !== "hkeaa") return "THIRD_PARTY";
  return "UNKNOWN";
}

/** Overall-score scale is established only for the two comparable denominators. */
function establishedScale(scale: number | undefined): boolean {
  return scale === 21 || scale === 100;
}

interface CheckContext {
  /** Existing evidence identity → fingerprint, for duplicate/conflict checks. */
  existingEvidence?: Array<{
    evidenceId: string;
    year: number;
    paper: string;
    task: string;
    overallScore: number | null;
    sourceHash: string;
  }>;
}

/**
 * Check ONE intake candidate. Deterministic and pure.
 * `accepted` is true ONLY when every acceptance requirement is met;
 * otherwise the candidate is classified into the appropriate
 * existing evidence class with explicit reasons.
 */
export function checkHumanMarkerEvidenceIntake(
  intake: HumanMarkerEvidenceIntake,
  context: CheckContext = {},
): HumanMarkerIntakeReport {
  const fields: IntakeFieldStatus[] = [];
  const reasons: string[] = [];
  const mark = (field: string, ok: boolean, detail?: string) => {
    fields.push({ field, status: ok ? "PRESENT" : "MISSING", detail });
    if (!ok) reasons.push(`${field}: missing`);
  };
  const invalid = (field: string, detail: string) => {
    fields.push({ field, status: "INVALID", detail });
    reasons.push(`${field}: ${detail}`);
  };

  // 1. Verbatim script.
  const hasScript = typeof intake.scriptText === "string" && intake.scriptText.trim() !== "";
  mark("scriptText", hasScript);

  // 2. Task identity.
  const hasYear = Number.isInteger(intake.year);
  const hasPaper = intake.paper === "Paper 1" || intake.paper === "Paper 2"
    || intake.paper === "Paper 3" || intake.paper === "Paper 4";
  const hasTask = typeof intake.task === "string" && intake.task.trim() !== "";
  if (hasYear && hasPaper && hasTask) {
    fields.push({ field: "taskIdentity", status: "PRESENT" });
  } else {
    fields.push({
      field: "taskIdentity",
      status: "MISSING",
      detail: `year=${hasYear ? "ok" : "missing"} paper=${hasPaper ? "ok" : "missing"} task=${hasTask ? "ok" : "missing"}`,
    });
    reasons.push("taskIdentity: incomplete");
  }

  // 3. Explicit overall score.
  const hasScore = typeof intake.overallScore === "number" && Number.isFinite(intake.overallScore);
  if (intake.overallScore === undefined) {
    mark("overallScore", false);
  } else if (!hasScore) {
    invalid("overallScore", "not a finite number");
  } else {
    fields.push({ field: "overallScore", status: "PRESENT" });
  }

  // 4. Established scale.
  if (intake.overallScale === undefined) {
    mark("overallScale", false);
  } else if (!establishedScale(intake.overallScale)) {
    invalid("overallScale", "scale not established (only 21 or 100 are comparable)");
  } else {
    fields.push({ field: "overallScale", status: "PRESENT" });
  }

  // 4a. Score within the established scale (no impossible scores).
  const scoreInRange = hasScore
    && establishedScale(intake.overallScale)
    && (intake.overallScore as number) <= (intake.overallScale as number);
  if (hasScore && establishedScale(intake.overallScale) && !scoreInRange) {
    invalid("overallScore", "score exceeds the established denominator");
  }

  // 5. Explicit score label.
  mark("scoreLabel", typeof intake.scoreLabel === "string" && intake.scoreLabel.trim() !== "");

  // 6. Marker provenance.
  const provenanceClass = classifyProvenanceQuality(intake);
  fields.push({ field: "markerProvenance", status: "PRESENT", detail: provenanceClass });
  const provenanceAcceptable =
    provenanceClass === "AUTHORITATIVE_OFFICIAL"
    || provenanceClass === "VERIFIED_HUMAN_MARKER";

  // 7. Stable source hash.
  if (intake.sourceHash === undefined) {
    mark("sourceHash", false);
  } else if (!/^[0-9a-f]{64}$/.test(intake.sourceHash)) {
    invalid("sourceHash", "must be a sha256 hex digest");
  } else {
    fields.push({ field: "sourceHash", status: "PRESENT" });
  }

  // 8. No OCR reconstruction.
  const ocrClean = intake.ocrDerived !== true;
  fields.push({
    field: "ocrUncertainty",
    status: ocrClean ? "PRESENT" : "INVALID",
    detail: ocrClean ? "none declared" : "OCR-derived — score not authoritative",
  });
  if (!ocrClean) reasons.push("ocrUncertainty: OCR reconstruction is not authoritative evidence");

  // 9/10. Duplicate + conflict against existing evidence.
  let duplicate = false;
  let conflict = false;
  if (hasYear && hasPaper && hasTask && context.existingEvidence) {
    for (const existing of context.existingEvidence) {
      if (existing.year === intake.year && existing.paper === intake.paper && existing.task === intake.task) {
        if (
          hasScore
          && existing.overallScore === intake.overallScore
          && intake.sourceHash === existing.sourceHash
        ) {
          duplicate = true;
        } else {
          conflict = true;
        }
      }
    }
  }
  fields.push({ field: "duplicate", status: duplicate ? "INVALID" : "PRESENT", detail: duplicate ? "identical evidence already exists" : "none" });
  fields.push({ field: "conflict", status: conflict ? "INVALID" : "PRESENT", detail: conflict ? "conflicting score for the same script" : "none" });
  if (duplicate) reasons.push("duplicate: identical evidence already exists — not a new sample");
  if (conflict) reasons.push("conflict: conflicting score for the same script — never merged");

  // Teaching material can never be accepted.
  const teaching = intake.isTeachingMaterial === true;
  if (teaching) reasons.push("teaching/reference material is not calibration evidence");

  // Determine classification.
  let evidenceClass: HumanMarkerEvidenceClass | "ACCEPT_OVERALL_SCORE";
  if (duplicate) evidenceClass = "ACCEPT_OVERALL_SCORE"; // existing accepted sample (ledger marks duplicate)
  else if (conflict) evidenceClass = "CONFLICT";
  else if (teaching) evidenceClass = "TEACHING_REFERENCE";
  else if (!hasScript) evidenceClass = "IMAGE_ONLY_UNREADABLE";
  else if (hasScore && scoreInRange && establishedScale(intake.overallScale) && hasTask && hasPaper && hasYear
    && provenanceAcceptable && ocrClean && intake.sourceHash && /^[0-9a-f]{64}$/.test(intake.sourceHash)
    && typeof intake.scoreLabel === "string" && intake.scoreLabel.trim() !== ""
    && !teaching && !conflict && !duplicate) {
    evidenceClass = "ACCEPT_OVERALL_SCORE";
  } else if (hasScore) {
    evidenceClass = "NON_COMPARABLE_SCORE";
  } else if (
    intake.overallScore !== undefined
    || intake.overallScale !== undefined
    || intake.scoreLabel !== undefined
  ) {
    // Score-like material present but unusable — never level-only.
    evidenceClass = "NON_COMPARABLE_SCORE";
  } else {
    evidenceClass = "LEVEL_ONLY";
  }

  const accepted = evidenceClass === "ACCEPT_OVERALL_SCORE" && !duplicate;
  if (accepted) {
    reasons.push(
      "accepted under the configured evidence contract — policy thresholds still apply",
    );
  }

  reasons.sort();
  return {
    evidenceId: intake.evidenceId,
    source: intake.sourceDocument ?? null,
    sourceHash: intake.sourceHash ?? null,
    taskIdentity: {
      year: hasYear ? (intake.year as number) : null,
      paper: hasPaper ? (intake.paper as string) : null,
      task: hasTask ? (intake.task as string) : null,
    },
    provenanceClass,
    evidenceClass,
    fields,
    accepted,
    reasons,
  };
}
