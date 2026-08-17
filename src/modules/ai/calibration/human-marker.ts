const ALLOWED_MARKER_SCORE_KEYS = new Set([
  "markerId", "contentScore", "languageScore", "organizationScore", "overallScore", "markedAt",
]);

/**
 * R3.10-K Phase 9: validate ONE marker score entry. Unknown keys are
 * rejected — AI prediction fields (aiScore/modelScore/predictedScore/
 * AI feedback) are never accepted. Returns a list of violations.
 */
export function validateMarkerScoreEntry(
  entry: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const unknownKeys = Object.keys(entry).filter(k => !ALLOWED_MARKER_SCORE_KEYS.has(k));
  if (unknownKeys.length > 0) {
    errors.push(`markerScores entries contain forbidden keys: ${unknownKeys.join(", ")} — AI prediction fields are never accepted`);
  }
  if (typeof entry.markerId !== "string" || entry.markerId.trim() === "") {
    errors.push("markerScores entries require a non-empty markerId");
  }
  for (const [name, value] of [
    ["contentScore", entry.contentScore],
    ["languageScore", entry.languageScore],
    ["organizationScore", entry.organizationScore],
    ["overallScore", entry.overallScore],
  ] as const) {
    if (value !== null && !(typeof value === "number" && Number.isFinite(value))) {
      errors.push(`markerScores ${name} must be null or a finite number`);
    }
  }
  if (entry.markedAt !== null && entry.markedAt !== undefined && typeof entry.markedAt !== "string") {
    errors.push("markerScores markedAt must be an ISO string or null");
  }
  return errors;
}

// ============================================
// R3.10-F: Human-Marker Calibration Evidence Contract
//
// Validation + evidence-set checks for FUTURE genuine
// human-marker-scored scripts. No such evidence exists yet and
// none may be fabricated. Every rule below is fail-closed:
// malformed evidence is rejected, never guessed or downgraded.
//
// Invariants enforced:
//   - publishedLevel cannot generate numeric scores
//   - overallScore cannot generate criterion scores
//   - criterion scores cannot be inferred from totals
//   - totals cannot be reconstructed from levels
//   - missing provenance = invalid
//   - missing source hash = invalid
//   - malformed scored evidence = hard failure
//   - no silent downgrade from scored → level-only
//   - synthetic fixtures can never become authoritative
//     through serialization (kind + suppliedBy must be explicit)
// ============================================

import type {
  FixtureValidationResult,
  GroundTruthClass,
  HKEAAPaper,
  HumanMarkerCalibrationFixture,
  HumanMarkerEvidenceClass,
  HumanMarkerEvidenceSetResult,
  HumanMarkerSourceClassification,
  HumanMarkerSourceClass,
} from "./types";

const VALID_PAPERS = new Set(["Paper 1", "Paper 2", "Paper 3", "Paper 4"]);

/** slug for deterministic ids: lowercase, non-alphanumerics → "-". */
function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "unknown" : slug;
}

/**
 * R3.10-K Phase 8: consolidated ground-truth classification. Composes
 * fixture kind + evidence class + verification state. Unknown input
 * maps to SYNTHETIC_PLATFORM_FIXTURE — never treated as ground truth.
 * Regression golden envelopes are identified by their explicit label.
 */
export function classifyGroundTruthClass(input: {
  kind: unknown;
  evidenceClass?: HumanMarkerEvidenceClass | null;
  verificationStatus?: "verified" | "unverified" | null;
  goldenType?: string | null;
}): GroundTruthClass {
  if (input.goldenType === "AI_AUTHORED_REGRESSION_BASELINE") {
    return "AI_AUTHORED_REGRESSION_BASELINE";
  }
  if (input.kind === "synthetic-regression") {
    return "SYNTHETIC_PLATFORM_FIXTURE";
  }
  if (input.kind === "authoritative-calibration") {
    return "HUMAN_PUBLICATION_LEVEL_ONLY";
  }
  if (input.kind === "human-marker-calibration") {
    if (input.evidenceClass === "NON_COMPARABLE_SCORE") {
      return "NON_COMPARABLE_HUMAN_EVIDENCE";
    }
    return input.verificationStatus === "verified"
      ? "HUMAN_MARKER_GROUND_TRUTH"
      : "HUMAN_MARKER_UNVERIFIED";
  }
  return "SYNTHETIC_PLATFORM_FIXTURE"; // fail-safe
}

/**
 * Classify ONE piece of human-marker evidence (a candidate script).
 * Exactly one class per candidate — the R3.10-H taxonomy:
 *
 *   ACCEPT_OVERALL_SCORE  — explicit overall score with established scale
 *   ACCEPT_CRITERION_ONLY — direct criterion scores, no comparable overall
 *   LEVEL_ONLY            — a level and nothing numeric
 *   NON_COMPARABLE_SCORE  — numeric marks on an unestablished/other scale
 *   TEACHING_REFERENCE    — source document is teaching material
 *   IMAGE_ONLY_UNREADABLE — no readable script text
 *   CONFLICT              — conflicting evidence for the same script
 *
 * Derived purely from the fixture's declared content — never guessed.
 */
export function classifyHumanMarkerEvidence(
  fixture: HumanMarkerCalibrationFixture,
): HumanMarkerEvidenceClass {
  const hasScript = typeof fixture.studentScript === "string"
    && fixture.studentScript.trim() !== "";
  if (!hasScript) return "IMAGE_ONLY_UNREADABLE";
  if (fixture.calibrationStatus === "quarantined-needs-manual-verification") {
    return "IMAGE_ONLY_UNREADABLE";
  }
  if (fixture.overallScore !== null) return "ACCEPT_OVERALL_SCORE";
  const hasCriterion =
    fixture.contentScore !== null
    || fixture.languageScore !== null
    || fixture.organizationScore !== null;
  if (hasCriterion) return "ACCEPT_CRITERION_ONLY";
  const hasSubScores =
    fixture.publishedSubScores !== undefined
    && fixture.publishedSubScores.length > 0;
  if (hasSubScores) return "NON_COMPARABLE_SCORE";
  return "LEVEL_ONLY";
}

/**
 * Deterministic human-marker fixture id. Same input always yields
 * the same id; different evidence yields different ids.
 */
export function buildHumanMarkerFixtureId(input: {
  year: number;
  paper: HKEAAPaper;
  taskId: string;
  sectionId: string;
}): string {
  const paperNo = input.paper.slice(-1);
  return `hm-${input.year}-p${paperNo}-${slugify(input.taskId)}-${slugify(input.sectionId)}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Fail-closed validation of a single human-marker fixture.
 * Collects ALL violations; `ok` is true only when none exist.
 */
export function validateHumanMarkerFixture(
  fixture: HumanMarkerCalibrationFixture,
): FixtureValidationResult {
  const errors: string[] = [];
  const push = (msg: string) => errors.push(msg);

  // Category: must be explicit — never assumed.
  if (fixture.kind !== "human-marker-calibration") {
    push(`kind must be "human-marker-calibration" (got ${JSON.stringify(fixture.kind)})`);
  }
  if (typeof fixture.id !== "string" || fixture.id.trim() === "") {
    push("id must be a non-empty string");
  }
  if (fixture.schemaVersion !== 1) {
    push(`schemaVersion must be 1 (got ${JSON.stringify(fixture.schemaVersion)})`);
  }

  // Script text: REQUIRED. Evidence without script text is invalid
  // and never silently downgraded to level-only.
  if (typeof fixture.studentScript !== "string" || fixture.studentScript.trim() === "") {
    push("studentScript is REQUIRED — human-marker evidence without script text is invalid");
  }

  // Provenance: all required fields.
  if (!fixture.provenance || typeof fixture.provenance !== "object") {
    push("provenance is required for human-marker fixtures");
    return { ok: false, errors };
  }
  const p = fixture.provenance;
  if (typeof p.sourceOrganization !== "string" || p.sourceOrganization.trim() === "") {
    push("provenance.sourceOrganization must be a non-empty string");
  }
  if (typeof p.sourceDocument !== "string" || p.sourceDocument.trim() === "") {
    push("provenance.sourceDocument must be a non-empty string");
  }
  if (!Number.isInteger(p.sourceYear) || p.sourceYear < 2010 || p.sourceYear > 2100) {
    push(`provenance.sourceYear must be a plausible integer (got ${JSON.stringify(p.sourceYear)})`);
  }
  if (!VALID_PAPERS.has(p.paper)) {
    push(`provenance.paper must be Paper 1-4 (got ${JSON.stringify(p.paper)})`);
  }
  if (typeof p.taskId !== "string" || p.taskId.trim() === "") {
    push("provenance.taskId must be a non-empty string");
  }
  if (typeof p.sectionId !== "string" || p.sectionId.trim() === "") {
    push("provenance.sectionId must be a non-empty string");
  }
  if (typeof p.sourceHash !== "string" || !/^[0-9a-f]{64}$/.test(p.sourceHash)) {
    push("provenance.sourceHash is REQUIRED and must be a sha256 hex digest over the ORIGINAL source artifact");
  }
  if (p.sourcePageRange !== undefined && typeof p.sourcePageRange !== "string") {
    push("provenance.sourcePageRange must be a string when present");
  }
  if (p.sourceFile !== undefined && typeof p.sourceFile !== "string") {
    push("provenance.sourceFile must be a string when present");
  }

  // Extraction provenance (Phase 6): never claim verbatim fidelity
  // unless established.
  const VALID_EXTRACTION_METHODS = new Set(["native-text", "ocr", "manual-transcription"]);
  const VALID_EXTRACTION_QUALITY = new Set(["manual-reviewed", "ocr-only", "unknown"]);
  if (!VALID_EXTRACTION_METHODS.has(p.extractionMethod)) {
    push(`provenance.extractionMethod invalid: ${JSON.stringify(p.extractionMethod)}`);
  }
  if (!VALID_EXTRACTION_QUALITY.has(p.extractionQuality)) {
    push(`provenance.extractionQuality invalid: ${JSON.stringify(p.extractionQuality)}`);
  }
  if (p.extractionMethod === "manual-transcription" && p.extractionQuality === "unknown") {
    push("manual transcription must record extractionQuality 'manual-reviewed' — 'unknown' makes no verbatim claim");
  }

  // Source authority assertion (Phase 4): provenance metadata ONLY.
  // It never bypasses any other validation rule in this function.
  const assertion = p.sourceAuthorityAssertion;
  if (!assertion || typeof assertion !== "object") {
    push("provenance.sourceAuthorityAssertion is REQUIRED (owner assertion, e.g. assertedBy 'repository-owner')");
  } else {
    if (typeof assertion.assertedBy !== "string" || assertion.assertedBy.trim() === "") {
      push("sourceAuthorityAssertion.assertedBy must be a non-empty string");
    }
    if (typeof assertion.authority !== "string" || assertion.authority.trim() === "") {
      push("sourceAuthorityAssertion.authority must be a non-empty string");
    }
    if (typeof assertion.acquisitionMethod !== "string" || assertion.acquisitionMethod.trim() === "") {
      push("sourceAuthorityAssertion.acquisitionMethod must be a non-empty string");
    }
    if (typeof assertion.verificationRequired !== "boolean") {
      push("sourceAuthorityAssertion.verificationRequired must be a boolean");
    }
  }

  // Marker policy + identity.
  if (typeof fixture.rubricVersion !== "string" || fixture.rubricVersion.trim() === "") {
    push("rubricVersion must be a non-empty string");
  }
  if (typeof fixture.markerPolicy !== "string" || fixture.markerPolicy.trim() === "") {
    push("markerPolicy is REQUIRED (scoring policy, e.g. 'single marking')");
  }
  if (
    fixture.markerId !== null
    && (typeof fixture.markerId !== "string" || fixture.markerId.trim() === "")
  ) {
    push("markerId must be a non-empty string, or null when no individual marker identity is available");
  }

  // Explicit human-marker score provenance.
  if (
    !fixture.scoreProvenance
    || typeof fixture.scoreProvenance !== "object"
    || fixture.scoreProvenance.suppliedBy !== "human-marker"
  ) {
    push("scoreProvenance.suppliedBy must be 'human-marker' — scores without marker provenance are invalid");
  }
  const sp = fixture.scoreProvenance;
  if (sp && typeof sp.scoringMethod !== "string" && typeof sp.scoringMethod !== "undefined") {
    push("scoreProvenance.scoringMethod must be a string when present");
  }
  if (sp && typeof sp.scoringMethod === "string" && sp.scoringMethod.trim() === "") {
    push("scoreProvenance.scoringMethod must be non-empty when present");
  }
  if (sp && typeof sp.overallScoreDirectlyScored !== "boolean") {
    push("scoreProvenance.overallScoreDirectlyScored must be a boolean");
  }
  if (sp && typeof sp.criterionScoresDirectlyScored !== "boolean") {
    push("scoreProvenance.criterionScoresDirectlyScored must be a boolean");
  }
  // Declared score scales: without a declared scale, a numeric score
  // cannot be compared to model output safely.
  if (sp && sp.overallScoreBasis !== null
    && sp.overallScoreBasis !== "clo-total-0-21"
    && sp.overallScoreBasis !== "percentage-0-100"
    && sp.overallScoreBasis !== undefined) {
    push("scoreProvenance.overallScoreBasis must be 'clo-total-0-21', 'percentage-0-100', or null");
  }
  if (sp && sp.criterionScoreBasis !== null
    && sp.criterionScoreBasis !== "clo-0-7"
    && sp.criterionScoreBasis !== undefined) {
    push("scoreProvenance.criterionScoreBasis must be 'clo-0-7' or null");
  }

  // Numeric fields: null or finite only.
  for (const [name, value] of [
    ["overallScore", fixture.overallScore],
    ["contentScore", fixture.contentScore],
    ["languageScore", fixture.languageScore],
    ["organizationScore", fixture.organizationScore],
  ] as const) {
    if (value !== null && !isFiniteNumber(value)) {
      push(`${name} must be null or a finite number (got ${JSON.stringify(value)})`);
    }
  }

  // Level: null or an exact DSE level string ("5**", "5*", "5", "4", ... "U").
  // NEVER a source of numeric scores.
  if (
    fixture.publishedLevel !== null
    && !/^([1-5]\*{0,2}|[uU])$/.test(fixture.publishedLevel)
  ) {
    push(`publishedLevel must be an exact DSE level string (1-5, 5*, 5**, U) or null (got ${JSON.stringify(fixture.publishedLevel)})`);
  }

  // Verbatim published sub-scores (Phase 3): provenance records ONLY.
  if (fixture.publishedSubScores !== undefined) {
    if (!Array.isArray(fixture.publishedSubScores)) {
      push("publishedSubScores must be an array when present");
    } else {
      for (const sub of fixture.publishedSubScores) {
        if (typeof sub.label !== "string" || sub.label.trim() === "") {
          push("publishedSubScores entries require a non-empty label");
        }
        const valueOk =
          (typeof sub.value === "number" && Number.isFinite(sub.value))
          || (typeof sub.value === "string" && sub.value.trim() !== "");
        if (!valueOk) {
          push(`publishedSubScores entry ${JSON.stringify(sub)} has an invalid value`);
        }
      }
    }
  }

  // R3.10-K Phase 8/9: independent marker scores (multi-marker support).
  // NO AI prediction fields exist in this schema by design — validation
  // strictly rejects any undeclared key (e.g. aiScore / modelScore /
  // predictedLevel / AI feedback / target level).
  if (fixture.markerScores !== undefined) {
    if (!Array.isArray(fixture.markerScores)) {
      push("markerScores must be an array when present");
    } else {
      for (const entry of fixture.markerScores) {
        for (const err of validateMarkerScoreEntry(entry as unknown as Record<string, unknown>)) {
          push(err);
        }
      }
    }
  }

  // Phase 8: adjudication is SEPARATE from original marks.
  if (fixture.adjudication !== undefined) {
    const a = fixture.adjudication;
    const validStatuses = ["not-required", "pending", "resolved", "disagreement-visible"];
    if (typeof a !== "object" || a === null || !validStatuses.includes((a as { status?: unknown }).status as string)) {
      push("adjudication.status must be one of not-required | pending | resolved | disagreement-visible");
    } else {
      for (const [name, value] of [
        ["adjudicatorId", a.adjudicatorId],
        ["resolvedAt", a.resolvedAt],
        ["notes", a.notes],
        ["reason", a.reason],
        ["resolution", a.resolution],
      ] as const) {
        if (value !== null && value !== undefined && typeof value !== "string") {
          push(`adjudication.${name} must be a string, null, or absent`);
        }
      }
      if (a.resolvedScores !== undefined) {
        for (const [name, value] of [
          ["contentScore", a.resolvedScores.contentScore],
          ["languageScore", a.resolvedScores.languageScore],
          ["organizationScore", a.resolvedScores.organizationScore],
          ["overallScore", a.resolvedScores.overallScore],
        ] as const) {
          if (value !== null && !(typeof value === "number" && Number.isFinite(value))) {
            push(`adjudication.resolvedScores.${name} must be null or a finite number`);
          }
        }
      }
    }
  }

  // Phase 9: explicit verification record. "verified" REQUIRES a named
  // human actor + timestamp; confirmedSourceHash must match the fixture's
  // source hash when present. Intake/runners never set "verified".
  if (fixture.verification !== undefined) {
    const v = fixture.verification;
    if (v.status !== "unverified" && v.status !== "verified") {
      push(`verification.status must be "unverified" or "verified" (got ${JSON.stringify(v.status)})`);
    } else if (v.status === "verified") {
      if (typeof v.verifiedBy !== "string" || v.verifiedBy.trim() === "") {
        push("verification.status 'verified' requires verifiedBy (explicit human actor)");
      }
      if (typeof v.verifiedAt !== "string" || v.verifiedAt.trim() === "") {
        push("verification.status 'verified' requires verifiedAt (ISO timestamp)");
      }
      if (
        v.confirmedSourceHash !== undefined
        && v.confirmedSourceHash !== fixture.provenance.sourceHash
      ) {
        push("verification.confirmedSourceHash must equal provenance.sourceHash — verification cannot bypass the source hash");
      }
    }
    if (v.scriptIdentityConfirmed !== undefined && typeof v.scriptIdentityConfirmed !== "boolean") {
      push("verification.scriptIdentityConfirmed must be a boolean when present");
    }
    if (v.scoreSourceConfirmed !== undefined && typeof v.scoreSourceConfirmed !== "boolean") {
      push("verification.scoreSourceConfirmed must be a boolean when present");
    }
  }

  // Phase 9: authorship declaration. AI-authored / unknown authorship is
  // NEVER acceptable calibration evidence — fail closed.
  if (fixture.scriptAuthorship !== undefined) {
    if (fixture.scriptAuthorship !== "HUMAN_AUTHORED") {
      push(`scriptAuthorship must be "HUMAN_AUTHORED" (got ${JSON.stringify(fixture.scriptAuthorship)}) — AI-authored/unknown evidence is rejected`);
    }
  }

  // Phase 8: task/part scope + comparability notes are optional strings.
  if (fixture.taskPartScope !== undefined && typeof fixture.taskPartScope !== "string") {
    push("taskPartScope must be a string when present");
  }
  if (fixture.comparabilityNotes !== undefined && typeof fixture.comparabilityNotes !== "string") {
    push("comparabilityNotes must be a string when present");
  }

  // Status validity.
  if (
    fixture.calibrationStatus !== "ingested"
    && fixture.calibrationStatus !== "quarantined-needs-manual-verification"
  ) {
    push(`calibrationStatus invalid: ${JSON.stringify(fixture.calibrationStatus)}`);
  }

  // Score-derivation guards (fail closed):
  // 1. overallScore present ⇒ directly scored (no inferred totals).
  if (fixture.overallScore !== null && sp?.overallScoreDirectlyScored !== true) {
    push("overallScore is present but scoreProvenance.overallScoreDirectlyScored is not true — inferred totals are forbidden");
  }
  // 2. criterion score present ⇒ directly scored (no split from total).
  const hasCriterionScore =
    fixture.contentScore !== null
    || fixture.languageScore !== null
    || fixture.organizationScore !== null;
  if (hasCriterionScore && sp?.criterionScoresDirectlyScored !== true) {
    push("criterion scores are present but scoreProvenance.criterionScoresDirectlyScored is not true — criterion values inferred from totals are forbidden");
  }
  // 2a. overall score present ⇒ declared scale (safe comparison requires it).
  if (fixture.overallScore !== null && sp?.overallScoreBasis == null) {
    push("overallScore is present but scoreProvenance.overallScoreBasis is not declared — scores without a declared scale cannot be compared safely");
  }
  // 2b. criterion score present ⇒ declared CLO scale (the only scale the
  //     platform analysis outputs are comparable against).
  if (hasCriterionScore && sp?.criterionScoreBasis !== "clo-0-7") {
    push("criterion scores are present but scoreProvenance.criterionScoreBasis is not 'clo-0-7' — criterion scores on undeclared scales cannot be compared safely");
  }
  // 3. A marker-supplied level alone is level-only evidence and must
  //    NOT masquerade as scored human-marker evidence. Verbatim
  //    published sub-scores (e.g. "M1:21 M2:19 40/42") DO count as
  //    genuine published scores — but never as comparable metrics.
  const hasComparableScore =
    fixture.overallScore !== null
    || fixture.contentScore !== null
    || fixture.languageScore !== null
    || fixture.organizationScore !== null;
  const hasSubScores =
    fixture.publishedSubScores !== undefined
    && fixture.publishedSubScores.length > 0;
  const hasAnyScore = hasComparableScore || hasSubScores;
  if (fixture.calibrationStatus === "ingested" && !hasAnyScore) {
    push("status 'ingested' requires at least one human-marker supplied score — level-only evidence is not human-marker evidence");
  }
  // 4. Level never generates scores: a level without any directly
  //    scored value cannot be the sole basis of an ingested fixture.
  if (
    fixture.calibrationStatus === "ingested"
    && fixture.publishedLevel !== null
    && !hasAnyScore
  ) {
    push("publishedLevel cannot generate numeric scores — level-only evidence must remain an HKEAA authoritative fixture");
  }

  if (typeof fixture.notes !== "string") {
    push("notes must be a string");
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Evidence identity: two fixtures describing the SAME marked script
 * share (year, paper, taskId, sectionId). Duplicates and conflicts
 * are reported — never silently merged or resolved.
 */
export function humanMarkerEvidenceKey(
  fixture: HumanMarkerCalibrationFixture,
): string {
  return [
    fixture.provenance.sourceYear,
    fixture.provenance.paper,
    fixture.provenance.taskId,
    fixture.provenance.sectionId,
  ].join("|");
}

/**
 * R3.10-K Phase 9: effective verification status of a fixture.
 * Priority: explicit verification record → legacy sourceAuthorityAssertion
 * status → "unverified" (fail-safe). Never inferred as verified.
 */
export function effectiveVerificationStatus(
  fixture: HumanMarkerCalibrationFixture,
): "unverified" | "verified" {
  if (fixture.verification?.status === "verified") return "verified";
  if (fixture.provenance.sourceAuthorityAssertion?.verificationStatus === "verified") return "verified";
  return "unverified";
}

/** Score-relevant content fingerprint for duplicate/conflict checks.
 *  Phase 8 Step 4 (P2-B): includes the FULL evidence identity —
 *  markerScores (order-invariant), adjudication, taskPartScope,
 *  verificationStatus, comparabilityNotes — so semantically distinct
 *  records are never collapsed into duplicates. Array order alone never
 *  creates a false duplicate. */
function evidenceFingerprint(fixture: HumanMarkerCalibrationFixture): string {
  const markerScores = fixture.markerScores
    ? [...fixture.markerScores]
      .map(m => ({
        markerId: m.markerId,
        contentScore: m.contentScore,
        languageScore: m.languageScore,
        organizationScore: m.organizationScore,
        overallScore: m.overallScore,
        markedAt: m.markedAt,
      }))
      .sort((a, b) => `${a.markerId}|${a.markedAt}`.localeCompare(`${b.markerId}|${b.markedAt}`))
    : null;
  const subScores = fixture.publishedSubScores
    ? [...fixture.publishedSubScores]
      .map(s => [s.label, String(s.value)] as const)
      .sort((a, b) => a[0].localeCompare(b[0]))
    : null;
  return JSON.stringify({
    overallScore: fixture.overallScore,
    contentScore: fixture.contentScore,
    languageScore: fixture.languageScore,
    organizationScore: fixture.organizationScore,
    publishedLevel: fixture.publishedLevel,
    markerPolicy: fixture.markerPolicy,
    rubricVersion: fixture.rubricVersion,
    sourceHash: fixture.provenance.sourceHash,
    verificationStatus: effectiveVerificationStatus(fixture),
    verification: fixture.verification ?? null,
    scriptAuthorship: fixture.scriptAuthorship ?? null,
    taskPartScope: fixture.taskPartScope ?? null,
    comparabilityNotes: fixture.comparabilityNotes ?? null,
    markerScores,
    adjudication: fixture.adjudication ?? null,
    subScores,
  });
}

/**
 * Validate a SET of human-marker fixtures as a whole:
 *   - every fixture must individually validate (fail closed)
 *   - the same evidence appearing twice with identical content is
 *     reported as a duplicate (idempotent re-ingestion)
 *   - the same evidence appearing twice with conflicting scores or
 *     conflicting marker policies is a HARD error (never merged)
 */
export function validateHumanMarkerEvidenceSet(
  fixtures: HumanMarkerCalibrationFixture[],
): HumanMarkerEvidenceSetResult {
  const errors: string[] = [];
  const duplicates: string[] = [];
  const conflicts: string[] = [];
  const seen = new Map<string, string>();

  for (const fixture of fixtures) {
    const single = validateHumanMarkerFixture(fixture);
    if (!single.ok) {
      errors.push(`${fixture.id ?? "(unknown)"}: ${single.errors.join("; ")}`);
      continue;
    }
    const key = humanMarkerEvidenceKey(fixture);
    const fingerprint = evidenceFingerprint(fixture);
    const existing = seen.get(key);
    if (existing !== undefined) {
      if (existing === fingerprint) {
        duplicates.push(key);
      } else {
        conflicts.push(key);
        errors.push(
          `conflicting evidence for ${key}: the same marked script appears with different scores/policy/hash — never merged`,
        );
      }
    } else {
      seen.set(key, fingerprint);
    }
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    duplicates: [...new Set(duplicates)].sort(),
    conflicts: [...new Set(conflicts)].sort(),
  };
}

// ============================================
// R3.10-G: Source Classification (Phase 1)
//
// Authority is NEVER inferred from a filename. Classification is
// derived only from machine-verifiable content facts.
// ============================================

export interface SourceClassificationInput {
  /** Extracted text contains actual candidate script prose. */
  hasScriptText: boolean;
  /** Extracted text contains published numeric scores (C/L/O, M1/M2, totals). */
  hasPublishedScore: boolean;
  /** Extracted text contains a published level (Lv 5, Lv 5**, ...). */
  hasPublishedLevel: boolean;
  /** Extracted text contains task/question provenance (year/paper/part/question). */
  hasTaskProvenance: boolean;
  /** Document is a teaching/vocabulary compilation (annotations, tips). */
  isTeachingCompilation: boolean;
  /** Document is an official rubric/descriptor text. */
  isRubricDocument: boolean;
}

/**
 * Classify a source document. Deterministic: same facts → same class.
 *
 * human-marker-scored REQUIRES all of: script text, a published
 * score OR level, and task provenance. Teaching compilations default
 * to teaching-reference even when they embed copies of scored work
 * (the embedded copies are duplicates of the primary source).
 */
export function classifyHumanMarkerSource(
  facts: SourceClassificationInput,
): HumanMarkerSourceClassification {
  const reasons: string[] = [];
  let sourceClass: HumanMarkerSourceClass;

  if (facts.isRubricDocument) {
    sourceClass = "official-rubric-reference";
    reasons.push("document contains rubric/descriptor text");
  } else if (facts.isTeachingCompilation) {
    sourceClass = "teaching-reference";
    reasons.push("teaching/vocabulary compilation — never calibration evidence by default");
  } else if (facts.hasScriptText && facts.hasTaskProvenance && (facts.hasPublishedScore || facts.hasPublishedLevel)) {
    sourceClass = "human-marker-scored";
    reasons.push(
      "contains candidate script text",
      "contains published score or level",
      "contains task/question provenance",
    );
  } else {
    sourceClass = "non-authoritative-reference";
    if (!facts.hasScriptText) reasons.push("no extractable script text");
    if (!facts.hasTaskProvenance) reasons.push("no task/question provenance");
    if (!facts.hasPublishedScore && !facts.hasPublishedLevel) {
      reasons.push("no published score or level");
    }
  }
  return { sourceClass, reasons };
}

