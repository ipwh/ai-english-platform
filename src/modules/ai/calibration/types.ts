// ============================================
// R3.10-F: Authoritative HKDSE Calibration — Core Types
//
// These types describe the platform's authoritative calibration
// dataset: fixtures derived from OFFICIAL HKEAA-published material
// (exemplar booklets, level descriptors, marking schemes).
//
// AUTHORITY BOUNDARIES (hard rules):
//   1. Calibration fixtures are EVALUATION INFRASTRUCTURE ONLY.
//      They are never read by student-facing runtime code, never
//      persisted to the database, and never influence scores shown
//      to students. (Enforced by authority contract tests.)
//   2. Scores are NEVER fabricated. publishedOverallScore /
//      published{Content,Language,Organization}Score are only ever
//      set from officially published numbers. The official exemplar
//      booklets publish LEVELS ONLY, so in the current dataset all
//      numeric published scores are null and
//      criterionScoresOfficiallyPublished is false.
//   3. Published levels are official; the platform's internal
//      dseLevel estimate is NOT an official HKEAA grade.
// ============================================

/** Official HKDSE performance level (1-5). */
export type HKEAALevel = 1 | 2 | 3 | 4 | 5;

/** HKDSE English Language paper. */
export type HKEAAPaper = "Paper 1" | "Paper 2" | "Paper 3" | "Paper 4";

/**
 * Discriminator between fixture categories. A fixture is
 * authoritative HKEAA evidence ONLY when its provenance declares
 * HKEAA as the source organization. Human-marker calibration
 * evidence declares its own explicit kind. Synthetic regression
 * fixtures never carry either marker, so no fixture can silently
 * transition between categories.
 */
export type CalibrationFixtureKind =
  | "synthetic-regression"
  | "authoritative-calibration"
  | "human-marker-calibration";

/** How completely the source text was captured from the PDF extraction. */
export type ExtractionStatus =
  | "complete-script-text"        // candidate script text fully present
  | "script-not-in-extraction"    // handwritten scan; no text layer
  | "video-no-transcript";        // performance captured as video only

/** Lifecycle status of an ingested authoritative fixture. */
export type AuthoritativeCalibrationStatus =
  /** Validated, provenance-complete, and runnable (script text + published value). */
  | "ingested"
  /**
   * Official level (or published value) recorded, but no runnable script
   * text exists in the extraction. Contributes to coverage/distribution
   * reporting only — never to score-agreement metrics.
   */
  | "ingested-level-only"
  /** Extraction was ambiguous or malformed — quarantined, never guessed. */
  | "quarantined-needs-manual-verification"
  /** Same source sample appears more than once in the source material. */
  | "quarantined-duplicate-source";

/** Immutable provenance for every authoritative fixture. */
export interface CalibrationProvenance {
  /** Publishing authority. Only "hkeaa" makes a fixture authoritative. */
  sourceOrganization: "hkeaa";
  /** Official document title, e.g. "Paper 2 Samples_HKDSE English 2020-2025.pdf". */
  sourceDocument: string;
  /** Examination year published by HKEAA (e.g. 2024). */
  sourceYear: number;
  /** Paper the sample belongs to. */
  paper: HKEAAPaper;
  /** Machine-stable task reference, e.g. "P2-2024-PartB-Q2". */
  taskId: string;
  /** Human-facing section reference from the document, e.g. "Level 5 exemplar 1". */
  sectionId: string;
  /** Extracted text file this fixture was parsed from (relative to project root). */
  sourceFile: string;
  /** Page range in the source PDF (1-based), when determinable. */
  sourcePageRange?: string;
  /**
   * SHA-256 over the canonical source text slice. Answers
   * "where did this expected value come from?" with an exact,
   * verifiable source reference.
   */
  sourceHash: string;
  /** How much of the candidate response text is present. */
  extractionStatus: ExtractionStatus;
  /** Optional link to the official rubric reference applied. */
  rubricReferenceId?: string;
}

/**
 * An authoritative calibration fixture derived from HKEAA-published
 * material. Immutable after ingestion: if the source changes, a NEW
 * fixture version is created — existing fixtures are never mutated.
 */
export interface AuthoritativeCalibrationFixture {
  kind: "authoritative-calibration";
  /** Stable fixture id, e.g. "hkeaa-p2-2024-level5-exemplar1". */
  id: string;
  /** Schema version of this fixture shape. */
  schemaVersion: 1;
  provenance: CalibrationProvenance;
  /**
   * Candidate script text. null when the source only publishes a
   * scanned script without a text layer. null ⇒ the fixture can
   * never contribute to score-agreement metrics.
   */
  studentScript: string | null;
  /** Officially published level, when the source publishes one. */
  publishedLevel: HKEAALevel | null;
  /** Officially published overall score (never estimated). */
  publishedOverallScore: number | null;
  /** Officially published criterion scores. */
  publishedContentScore: number | null;
  publishedLanguageScore: number | null;
  publishedOrganizationScore: number | null;
  /**
   * true ONLY when the official source itself publishes criterion-level
   * scores. While false, all published*Criterion scores MUST be null
   * (enforced by validation — fail closed).
   */
  criterionScoresOfficiallyPublished: boolean;
  /** Rubric reference used to interpret the published value (official source id). */
  rubricVersion: string;
  calibrationStatus: AuthoritativeCalibrationStatus;
  /** Machine-generated extraction facts only. Never editorial judgment. */
  notes: string;
}

/** Rubric scope of an official rubric reference. */
export type RubricScope =
  | "level-descriptors-writing"
  | "level-descriptors-subject"
  | "level-descriptors-reading"
  | "level-descriptors-listening"
  | "level-descriptors-speaking"
  | "marking-scheme-paper2";

/**
 * Immutable official rubric text (HKEAA level descriptors or marking
 * scheme criteria) with full provenance. Reference data only.
 */
export interface OfficialRubricReference {
  kind: "official-rubric-reference";
  id: string;
  schemaVersion: 1;
  sourceOrganization: "hkeaa";
  sourceDocument: string;
  /** Year the rubric document applies to, when published with a year. */
  sourceYear: number | null;
  paper: HKEAAPaper | "General";
  rubricScope: RubricScope;
  /** Level this reference describes (level descriptors), else null. */
  level: HKEAALevel | null;
  /** CLO dimension this reference describes, else null. */
  dimension: "content" | "language" | "organization" | null;
  /** Mark band this reference describes (marking scheme), else null. */
  mark: number | null;
  /** Verbatim official descriptor text as extracted. */
  descriptorText: string;
  sourceFile: string;
  sourceHash: string;
}

/** A source sample that failed ingestion and was quarantined. */
export interface QuarantineRecord {
  /** Stable id derived from the source location. */
  id: string;
  reason:
    | "ambiguous-year"
    | "ambiguous-level"
    | "missing-exemplar-boundary"
    | "duplicate-source-sample"
    | "unparseable-section"
    | "corrupt-overall-score";
  sourceFile: string;
  /** Human-readable detail of what could not be verified. */
  detail: string;
}

/** Validation outcome for a candidate fixture (fail closed). */
export interface FixtureValidationResult {
  ok: boolean;
  errors: string[];
}

// ============================================
// Calibration metrics & reports
// ============================================

/** Agreement statistics for one numeric comparison series. */
export interface AgreementMetrics {
  /** Number of comparable pairs. */
  n: number;
  /** Mean absolute error (actual - published), null when n = 0. */
  mae: number | null;
  /** Root mean squared error, null when n = 0. */
  rmse: number | null;
  /** Mean signed bias (actual - published); positive = over-scoring. */
  meanBias: number | null;
  /** Fraction of exact agreements (0-1), null when n = 0. */
  exactAgreementRate: number | null;
  /** Fraction within ±1 of the published value, null when n = 0. */
  withinOneAgreementRate: number | null;
  /** Fraction where actual > published, null when n = 0. */
  overScoringRate: number | null;
  /** Fraction where actual < published, null when n = 0. */
  underScoringRate: number | null;
}

/**
 * R3.10-K Phase 7: Ordinal level agreement metrics.
 * HKDSE levels are ORDINAL — a Level 4→Level 1 error is not the same
 * as a Level 4→Level 5 error. Distance is computed on the platform's
 * 1-5 ordinal index; published star-levels ("5*", "5**") fold onto
 * index 5 for distance purposes while string-exact level agreement
 * remains available via CalibrationComparison.levelExactMatch.
 */
export interface LevelAgreementMetrics {
  /** Number of pairs where both sides carry a parseable level. */
  n: number;
  /** Mean absolute level distance (0 = exact, >0 = distance). */
  meanAbsoluteDistance: number | null;
  /** Largest absolute level distance observed. */
  maxAbsoluteDistance: number | null;
  /** Fraction of pairs with absolute distance ≤ 1. */
  withinOneLevelRate: number | null;
}

/** Per-group agreement summary (level / year / task). */
export interface GroupAgreement {
  group: string;
  n: number;
  exact: number;
  withinOne: number;
  mae: number | null;
}

/** One model-vs-published comparison for a single fixture. */
export interface CalibrationComparison {
  fixtureId: string;
  year: number;
  taskId: string;
  paper: HKEAAPaper;
  /** Published level as the source states it (e.g. "5", "5**"). */
  publishedLevel: string | null;
  /** Platform-internal level estimate (NOT an official grade). */
  predictedLevel: string | null;
  levelExactMatch: boolean | null;
  publishedOverall: number | null;
  predictedOverall: number | null;
  overallError: number | null;
  criterion: {
    content: { published: number | null; predicted: number | null; error: number | null };
    language: { published: number | null; predicted: number | null; error: number | null };
    organization: { published: number | null; predicted: number | null; error: number | null };
  };
  /** Marker policy, when the comparison comes from human-marker evidence. */
  markerPolicy?: string;
  /**
   * Phase 8: verification state of the evidence that produced this
   * comparison ("verified" | "unverified" | null). Sufficiency counts
   * ACTUAL comparable pairs, and verified pairs require this field.
   */
  verificationStatus: string | null;
  /** Fixture failed to analyze (provider/parse error) — not silently dropped. */
  analysisFailure: string | null;
}

/** Full agreement statistics, synthetic and authoritative never mixed. */
export interface CalibrationMetrics {
  overall: AgreementMetrics;
  /** Only populated where official criterion scores exist. */
  perCriterion: {
    content: AgreementMetrics;
    language: AgreementMetrics;
    organization: AgreementMetrics;
  };
  perLevel: GroupAgreement[];
  perYear: GroupAgreement[];
  perTask: GroupAgreement[];
  /** Agreement grouped by marker policy (human-marker evidence only). */
  perMarkerPolicy: GroupAgreement[];
  /** Ordinal level distance metrics (Phase 7) — never conflated with exact. */
  levelMetrics: LevelAgreementMetrics;
}

/** Insufficient-data area identified in the report. */
export interface InsufficientDataArea {
  area: string;
  detail: string;
}

// ============================================
// Calibration gates (policy, not facts)
// ============================================

export type CalibrationGateDecision = "PASS" | "FAIL" | "INSUFFICIENT_DATA";

export interface GateThresholdResult {
  name: string;
  metricValue: number | null;
  threshold: number;
  required: "gte" | "lte";
  met: boolean;
}

/**
 * Validity gate policy. Every field is CONFIGURATION, not a fact:
 * thresholds are operational policy for CI reporting and must never
 * be presented as HKDSE validity claims. Adjust via configuration;
 * defaults below are intentionally conservative.
 */
export interface CalibrationGatePolicy {
  minAuthoritativeSamples: number;
  minScoredSamples: number;
  maxOverallMAE: number;
  maxOverallRMSE: number;
  maxAbsBias: number;
  minExactAgreementRate: number;
  minWithinOneAgreementRate: number;
  /**
   * R3.10-K Phase 7: per-dimension (C/L/O) ceilings. POLICY_DEFINED,
   * NOT official HKDSE tolerances — no official dimension-level
   * tolerance exists. Evaluated ONLY when criterion data exists
   * (n > 0); absence is reported, never silently passed.
   */
  maxContentMAE: number;
  maxLanguageMAE: number;
  maxOrganizationMAE: number;
  /**
   * R3.10-K Phase 8: minimum VERIFIED overall-comparable human-marker
   * samples required before any PASS is possible. An operational
   * engineering threshold — NOT a statistical validity threshold.
   * Unverified comparable evidence never satisfies this gate.
   */
  minVerifiedComparableSamples: number;
}

/**
 * Default gate policy. Marked POLICY: these numbers encode an
 * operational decision about when the platform may claim that
 * calibration evidence is sufficient, NOT an official HKDSE
 * validity standard.
 */
export const DEFAULT_CALIBRATION_GATE_POLICY: CalibrationGatePolicy = {
  // POLICY: minimum authoritative samples before any validity claim
  minAuthoritativeSamples: 10,
  // POLICY: minimum scored samples for agreement statistics
  minScoredSamples: 8,
  // POLICY: agreement quality ceilings
  maxOverallMAE: 1.5,
  maxOverallRMSE: 2.0,
  maxAbsBias: 1.0,
  minExactAgreementRate: 0.5,
  minWithinOneAgreementRate: 0.8,
  // POLICY_DEFINED (Phase 7): dimension ceilings mirror the overall
  // ceiling on the 0-7 C/L/O scale. NOT official HKDSE tolerances.
  maxContentMAE: 1.5,
  maxLanguageMAE: 1.5,
  maxOrganizationMAE: 1.5,
  // POLICY (Phase 8): operational engineering minimum of VERIFIED
  // overall-comparable human-marker samples. NOT a statistical
  // validity threshold and never presented as one.
  minVerifiedComparableSamples: 8,
};

export interface CalibrationGateResult {
  decision: CalibrationGateDecision;
  policy: CalibrationGatePolicy;
  thresholds: GateThresholdResult[];
  reasons: string[];
}

/**
 * R3.10-K Phase 7: Execution attribution metadata for one calibration
 * run. A run must be answerable afterwards: which scoring version,
 * which prompt version, which provider/model/temperature, which
 * dataset, which calibration version, which commit. Values that cannot
 * be known are NEVER fabricated — they are "unknown"/"unavailable"/null
 * and the report renders them verbatim.
 */
export interface CalibrationRunMetadata {
  /** Version of the calibration machinery itself. */
  calibrationVersion: string;
  /** Version of the calibration dataset (human-marker + authoritative). */
  datasetVersion: string;
  /** Canonical scoring version (writing-score-policy SCORING_VERSION). */
  scoringVersion: string;
  /** Prompt version from the canonical prompt registry (AnalyzeWriting). */
  promptVersion: string;
  /** Provider that produced the predictions ("unavailable" if unknown). */
  provider: string;
  /** Model that produced the predictions ("unavailable" if unknown). */
  model: string;
  /** Temperature of the scoring calls, null when unknown. */
  temperature: number | null;
  /** Git commit of the run, null when unknown (never fabricated). */
  commitSha: string | null;
  /** Deterministic fingerprint over fixture ids + source hashes. */
  datasetFingerprint: string | null;
}

/** The authoritative calibration benchmark report. */
export interface CalibrationBenchmarkReport {
  /** Authoritative fixtures discovered/loaded. */
  sampleCount: number;
  /** Fixtures with script text + published values actually compared. */
  scoredCount: number;
  /** Authoritative fixtures that cannot be scored (no script text). */
  unscorableCount: number;
  /** Quarantined source samples (ambiguous or duplicate). */
  quarantinedCount: number;
  metrics: CalibrationMetrics;
  comparisons: CalibrationComparison[];
  insufficientAreas: InsufficientDataArea[];
  gate: CalibrationGateResult;
  generatedAt: string;
  /** Execution attribution (Phase 7). Populated by both runners. */
  runMetadata?: CalibrationRunMetadata;
  /**
   * Human-marker evidence verification state (Phase 7). Never conflated
   * with evidence counts; a fixture with verificationRequired=true and
   * verificationStatus=unverified is NOT "verified ground truth".
   */
  evidenceVerification?: {
    verified: number;
    unverified: number;
    total: number;
  };
  /**
   * Evidence-category breakdown (populated only by the human-marker
   * runner). NEVER collapsed into a single count — each category is
   * reported separately.
   */
  evidenceBreakdown?: {
    overallComparable: number;
    criterionOnly: number;
    nonComparable: number;
    levelOnly: number;
    quarantined: number;
  };
}

// ============================================
// R3.10-F: Human-Marker Calibration Evidence Contract
//
// Reserved for FUTURE genuine human-marker-scored scripts. No such
// evidence currently exists in this repository, and none may be
// fabricated for testing. These types define the ONLY shape that
// scored evidence will be accepted in, once real marked scripts are
// available.
//
// Hard rules encoded by validation (human-marker.ts):
//   - verbatim script text is REQUIRED (no script → invalid)
//   - every numeric score must be directly scored by the marker
//     (no score may be inferred from a level or a total)
//   - level-only evidence is NOT human-marker evidence
//   - missing provenance or source hash → invalid
//   - these fixtures are never conflated with HKEAA authoritative
//     level-only fixtures or with synthetic regression fixtures
// ============================================

/**
 * Explicit declaration of who supplied the scores and how.
 * Every numeric score in a human-marker fixture must be directly
 * scored by the marker; derived or inferred values are rejected.
 */
export interface HumanMarkerScoreProvenance {
  /** MUST be "human-marker" — any other value fails validation. */
  suppliedBy: "human-marker";
  /**
   * true only when overallScore was directly scored by the marker.
   * overallScore present + false ⇒ invalid (no inferred totals).
   */
  overallScoreDirectlyScored: boolean;
  /**
   * true only when every present criterion score was directly
   * scored by the marker. Criterion score present + false ⇒ invalid
   * (no criterion values split from a total).
   */
  criterionScoresDirectlyScored: boolean;
  /**
   * Declared scale of overallScore. REQUIRED whenever overallScore
   * is present — a score without a declared scale cannot be
   * compared to model output safely.
   *   "clo-total-0-21"    — HKDSE P2 CLO total (Content+Language+Organization)
   *   "percentage-0-100"  — percentage score
   */
  overallScoreBasis: "clo-total-0-21" | "percentage-0-100" | null;
  /**
   * Declared scale of criterion scores. REQUIRED whenever any
   * criterion score is present. Only "clo-0-7" is comparable to the
   * platform's C/L/O analysis (0-7 per dimension).
   */
  criterionScoreBasis: "clo-0-7" | null;
  /**
   * Scoring method description, e.g.
   * "HKDSE P2 C/L/O rubric 0-7, single marking".
   */
  scoringMethod: string;
}

/**
 * R3.10-K Phase 8: one independent human-marker score entry.
 * Contains NO AI prediction fields by design (no aiScore / modelScore /
 * predictedLevel / AI feedback / target level) — independent human
 * evidence only.
 */
export interface HumanMarkerScoreEntry {
  /** Anonymized marker id — required per entry. */
  markerId: string;
  contentScore: number | null;
  languageScore: number | null;
  organizationScore: number | null;
  overallScore: number | null;
  /** Scoring timestamp (ISO); null when unavailable. */
  markedAt: string | null;
}

/**
 * R3.10-K Phase 9: explicit verification record. A fixture is verified
 * ONLY through an explicit verify act by a named human actor — intake,
 * runners, and calibration runs NEVER set this to "verified".
 */
export interface VerificationRecord {
  status: "unverified" | "verified";
  /** Human identifier of the verifier — REQUIRED when status is verified. */
  verifiedBy?: string;
  /** ISO timestamp of the verification act — REQUIRED when status is verified. */
  verifiedAt?: string;
  /** SHA-256 the verifier confirmed against the source artifact. */
  confirmedSourceHash?: string;
  /** Confirmation that the verbatim script identity was re-checked. */
  scriptIdentityConfirmed?: boolean;
  /** Confirmation that the score/source transcription was re-checked. */
  scoreSourceConfirmed?: boolean;
}

/**
 * R3.10-K Phase 8: adjudication record. Kept SEPARATE from original
 * marks — original marker scores are never mutated by adjudication.
 */
export interface AdjudicationRecord {
  status: "not-required" | "pending" | "resolved" | "disagreement-visible";
  adjudicatorId: string | null;
  resolvedAt: string | null;
  notes: string | null;
  /** Phase 9: reason the adjudication was opened (traceability). */
  reason?: string;
  /** Phase 9: written resolution summary. */
  resolution?: string;
  /**
   * Phase 9: adjudicator's final scores (decision output). These NEVER
   * replace the original marker scores on the fixture.
   */
  resolvedScores?: {
    contentScore: number | null;
    languageScore: number | null;
    organizationScore: number | null;
    overallScore: number | null;
  };
}

/**
 * A genuine human-marker-scored candidate script. The ONLY fixture
 * category that may carry numeric marker scores. Immutable after
 * ingestion: a changed source is a NEW fixture, never a mutation.
 */
export interface HumanMarkerCalibrationFixture {
  kind: "human-marker-calibration";
  /** Deterministic id (see buildHumanMarkerFixtureId). */
  id: string;
  schemaVersion: 1;
  /**
   * Verbatim candidate script. REQUIRED — evidence without script
   * text is invalid and never silently downgraded.
   */
  studentScript: string;
  provenance: {
    /**
     * Organization that supplied the marked script (e.g. a school).
     * Unlike HKEAA fixtures, this does NOT need to be "hkeaa": the
     * SCORE authority here is the human marker, documented below.
     */
    sourceOrganization: string;
    /** Document the script was extracted from (e.g. class exam booklet). */
    sourceDocument: string;
    /** Examination year. */
    sourceYear: number;
    /** Paper the task belongs to. */
    paper: HKEAAPaper;
    /** Machine-stable task reference (e.g. "P2-2024-PartB-Q2"). */
    taskId: string;
    /** Section/candidate reference, e.g. "Class 5A candidate 07". */
    sectionId: string;
    /** Optional page range in the source document. */
    sourcePageRange?: string;
    /** Optional machine source file (manual transcription may lack one). */
    sourceFile?: string;
    /**
     * SHA-256 over the EXACT ORIGINAL SOURCE ARTIFACT bytes
     * (e.g. the source PDF) — never a normalized/OCR-only
     * representation. REQUIRED — answers "where did this score
     * come from?" with a verifiable reference.
     */
    sourceHash: string;
    /**
     * How the script text was extracted from the source artifact.
     *   "native-text"         — machine text layer present in the source
     *   "ocr"                 — text produced by OCR of scanned pages
     *   "manual-transcription" — transcribed by a person
     */
    extractionMethod: "native-text" | "ocr" | "manual-transcription";
    /**
     * Fidelity assurance of the extracted text. "unknown" means NO
     * verbatim-fidelity claim is made. Never claim verbatim fidelity
     * unless it is established.
     */
    extractionQuality: "manual-reviewed" | "ocr-only" | "unknown";
    /**
     * EXPLICIT OWNER ASSERTION about the source's authority. This is
     * provenance metadata only — it NEVER bypasses score-provenance,
     * source-hash, script-text, marker-policy, category, or conflict
     * validation.
     */
    sourceAuthorityAssertion: {
      /** Who asserts the source's authority. */
      assertedBy: string;
      /** Asserted authority, e.g. "HKEAA". */
      authority: string;
      /** How the source was acquired, e.g. "direct-source". */
      acquisitionMethod: string;
      /** Whether independent verification is required for ingestion. */
      verificationRequired: boolean;
      /**
       * Phase 7: declared verification state. "unverified" unless the
       * source has been independently verified by a human. NEVER claim
       * "verified" without evidence. Required when verificationRequired.
       */
      verificationStatus?: "verified" | "unverified";
    };
  };
  /** Rubric version the marker applied (platform or official reference id). */
  rubricVersion: string;
  /** Scoring policy, e.g. "single marking" / "double marking, moderated". */
  markerPolicy: string;
  /**
   * Marker identity, or an anonymized marker id where legally
   * appropriate. null when no individual marker identity is
   * available (e.g. officially published composite marking).
   */
  markerId: string | null;
  /**
   * Published level EXACTLY as the source states it, e.g. "5**",
   * "5*", "5", "4", "U". NEVER converted into numeric scores.
   */
  publishedLevel: string | null;
  /**
   * R3.10-K Phase 9: explicit verification record. Absent/legacy
   * fixtures default to unverified (see effectiveVerificationStatus).
   */
  verification?: VerificationRecord;
  /**
   * R3.10-K Phase 9: script authorship declaration. Only
   * "HUMAN_AUTHORED" is acceptable calibration evidence; intake
   * rejects AI-authored and unknown authorship fail-closed. Legacy
   * fixtures without the field are reported as legacy-declared.
   */
  scriptAuthorship?: "HUMAN_AUTHORED" | "AI_AUTHORED" | "UNKNOWN";
  /**
   * R3.10-K Phase 8: independent marker scores (multi-marker support).
   * Backward-compatible optional — existing single published marker
   * representation remains valid. NO AI prediction fields allowed.
   */
  markerScores?: HumanMarkerScoreEntry[];
  /**
   * R3.10-K Phase 8: adjudication state. Separate from original marks;
   * disagreement is never silently collapsed.
   */
  adjudication?: AdjudicationRecord;
  /**
   * R3.10-K Phase 8: task/part scope of the human score, e.g.
   * "paper-2-part-b", "paper-2-part-a", "full-paper". Required for
   * clo-total-0-21 comparability (see comparabilityNotes).
   */
  taskPartScope?: string;
  /**
   * R3.10-K Phase 8: explicit comparability caveats (rounding,
   * penalties, single-part vs full-paper, incomplete scripts). Never
   * inferred — declared by the ingesting party.
   */
  comparabilityNotes?: string;
  /**
   * Verbatim published sub-scores that do not fit the overall/criterion
   * fields (e.g. double marking "M1:21 M2:19 40/42"). These are
   * provenance records ONLY — they never enter metric comparison.
   */
  publishedSubScores?: Array<{ label: string; value: number | string }>;
  /** Explicit statement that scores are human-marker supplied. */
  scoreProvenance: HumanMarkerScoreProvenance;
  /** Overall score — ONLY when genuinely supplied by the marker. */
  overallScore: number | null;
  /** Criterion scores — ONLY when genuinely supplied by the marker. */
  contentScore: number | null;
  languageScore: number | null;
  organizationScore: number | null;
  calibrationStatus:
    | "ingested"
    | "quarantined-needs-manual-verification";
  /** Machine facts only; never editorial score judgment. */
  notes: string;
}

/**
 * Classification of a piece of human-marker evidence (one per
 * candidate script). Exactly one class per candidate — the same
 * taxonomy the R3.10-H evidence inventory uses.
 */
export type HumanMarkerEvidenceClass =
  /** Verbatim script + explicit numeric overall score + established scale. The ONLY class entering overall-score comparisons. */
  | "ACCEPT_OVERALL_SCORE"
  /** Verbatim script + directly published criterion scores, no comparable overall. */
  | "ACCEPT_CRITERION_ONLY"
  /** Level only (e.g. "5**") — never converted into scores. */
  | "LEVEL_ONLY"
  /** Published marks that are not on a scale comparable to the AI calibration target (e.g. M1/M2, unestablished scale). */
  | "NON_COMPARABLE_SCORE"
  /** Teaching/reference material — never calibration evidence by default. */
  | "TEACHING_REFERENCE"
  /** Scan without readable text; manual transcription required. */
  | "IMAGE_ONLY_UNREADABLE"
  /** Conflicting authoritative scores for the same script. */
  | "CONFLICT";

/**
 * R3.10-K Phase 8: consolidated ground-truth class. Composes existing
 * concepts (fixture kind + evidence class + verification state) — it
 * does NOT replace them. Unknown input maps to
 * SYNTHETIC_PLATFORM_FIXTURE (fail-safe: never treated as ground truth).
 */
export type GroundTruthClass =
  /** Human-marker evidence, verified, with comparable scores. */
  | "HUMAN_MARKER_GROUND_TRUTH"
  /** Human-marker evidence whose verificationStatus is not "verified". */
  | "HUMAN_MARKER_UNVERIFIED"
  /** HKEAA publication evidence that carries levels only. */
  | "HUMAN_PUBLICATION_LEVEL_ONLY"
  /** Platform-generated / synthetic fixtures (regression fixtures). */
  | "SYNTHETIC_PLATFORM_FIXTURE"
  /** Regression goldens saved from AI output (--update-golden). */
  | "AI_AUTHORED_REGRESSION_BASELINE"
  /** Human evidence with scores on non-comparable scales. */
  | "NON_COMPARABLE_HUMAN_EVIDENCE";

/** Outcome of validating a set of human-marker fixtures. */
export interface HumanMarkerEvidenceSetResult {
  ok: boolean;
  errors: string[];
  /** Evidence identity keys appearing more than once with identical content. */
  duplicates: string[];
  /** Evidence identity keys appearing more than once with conflicting content. */
  conflicts: string[];
}

// ============================================
// R3.10-G: Human-Marker Source Classification
// ============================================

/**
 * Explicit classification of a source document. Authority is NEVER
 * inferred from a filename — classification is derived only from
 * the extracted content facts.
 */
export type HumanMarkerSourceClass =
  /** Contains actual student scripts + published scores/levels + task provenance. */
  | "human-marker-scored"
  /** Official rubric/descriptor text (handled by the authoritative rubric pipeline). */
  | "official-rubric-reference"
  /** Teaching/reference compilation — never calibration evidence by default. */
  | "teaching-reference"
  /** Present but not authoritative marker evidence (e.g. image-only scans). */
  | "non-authoritative-reference";

/** Classification outcome with machine-derived reasons (auditable). */
export interface HumanMarkerSourceClassification {
  sourceClass: HumanMarkerSourceClass;
  reasons: string[];
}

/** External-source manifest entry (Phase 10). */
export interface HumanMarkerSourceManifestEntry {
  sourceFilename: string;
  sourceUrl: string;
  sha256: string;
  acquisitionDate: string;
  authorityAssertion: {
    assertedBy: string;
    authority: string;
    acquisitionMethod: string;
    verificationRequired: boolean;
    /** Phase 7: "unverified" unless independently verified by a human. */
    verificationStatus?: "verified" | "unverified";
  };
  extractionMethod: "native-text" | "ocr" | "manual-transcription" | "image-only-no-text-layer";
  sourceClass: HumanMarkerSourceClass;
  fixtureCount: number;
  notes: string;
}

// ============================================
// R3.10-J: Human-Marker Evidence Intake Contract
//
// Machine-readable intake shape for FUTURE genuine evidence.
// Infrastructure only — no evidence values are invented. Every
// field is optional at intake time; the checker reports exactly
// which requirements are unmet and why acceptance is denied.
// ============================================

/** Provenance quality levels. Acceptance policy is separate — these
 *  only DESCRIBE the evidence; they never auto-accept anything. */
export type HumanMarkerProvenanceClass =
  /** Official HKEAA marking record (published marks / official exemplar with scores). */
  | "AUTHORITATIVE_OFFICIAL"
  /** Independently verified human-marker scoring record. */
  | "VERIFIED_HUMAN_MARKER"
  /** Teacher-marked school script (not official marking record). */
  | "TEACHER_MARKED"
  /** Annotated research dataset entry. */
  | "RESEARCH_DATASET"
  /** Third-party (e.g. educational website) score. */
  | "THIRD_PARTY"
  /** No usable provenance information. */
  | "UNKNOWN"
  /** Score/text derived from OCR reconstruction of a scan. */
  | "OCR_DERIVED";

/** A raw evidence candidate as supplied by an external party. */
export interface HumanMarkerEvidenceIntake {
  evidenceId: string;
  sourceDocument?: string;
  sourcePath?: string;
  /** SHA-256 of the exact source artifact, if known at intake time. */
  sourceHash?: string;
  year?: number;
  paper?: HKEAAPaper;
  task?: string;
  question?: string;
  scriptText?: string;
  /** Explicitly published overall score (number only — never derived). */
  overallScore?: number;
  /** Established denominator: 21 or 100 are the only comparable scales. */
  overallScale?: number;
  /** Verbatim score label from the source, e.g. "Overall: 18/21". */
  scoreLabel?: string;
  markerSource?: string;
  markerType?: string;
  provenance?: string;
  publicationReference?: string;
  acquisitionDate?: string;
  /** Declared origin of the document (e.g. "HKEAA", "school-x", "website-y"). */
  provenanceOrganization?: string;
  /** Declared marking basis. */
  markerBasis?: "official-marking-record" | "teacher-marking" | "research-annotation" | "unknown";
  /**
   * Phase 7: whether the submitting party declares independent
   * verification is required. Third-party-hosted sources SHOULD
   * declare true; the checker reports a warning/rejection when a
   * third-party source omits it.
   */
  verificationRequired?: boolean;
  /**
   * R3.10-K Phase 8: task/part scope of the human overall score
   * ("paper-2-part-a" / "paper-2-part-b" / "full-paper"). Required
   * whenever an overall score with an established scale is supplied.
   */
  taskPartScope?: string;
  /** R3.10-K Phase 8: declared comparability caveats. */
  comparabilityNotes?: string;
  /** True when the text/score comes from OCR reconstruction. */
  ocrDerived?: boolean;
  /** True when the document is teaching/reference material. */
  isTeachingMaterial?: boolean;
  notes?: string;
}

/** Field-level status in an intake check. */
export interface IntakeFieldStatus {
  field: string;
  status: "PRESENT" | "MISSING" | "INVALID";
  detail?: string;
}

/** Deterministic result of checking an intake candidate. */
export interface HumanMarkerIntakeReport {
  evidenceId: string;
  source: string | null;
  sourceHash: string | null;
  taskIdentity: {
    year: number | null;
    paper: string | null;
    task: string | null;
  };
  provenanceClass: HumanMarkerProvenanceClass;
  /** Existing evidence class if the candidate maps to one. */
  evidenceClass: HumanMarkerEvidenceClass | "ACCEPT_OVERALL_SCORE";
  fields: IntakeFieldStatus[];
  /** True only when the candidate meets EVERY acceptance requirement. */
  accepted: boolean;
  reasons: string[];
}
