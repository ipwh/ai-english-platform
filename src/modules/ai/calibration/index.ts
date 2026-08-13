// ============================================
// R3.10-F: Calibration Module — Barrel Export
//
// AUTHORITY BOUNDARY: this module is EVALUATION INFRASTRUCTURE
// ONLY. It must never be imported by:
//   - API routes (src/app/api/**)
//   - student-facing runtime services
//   - mastery / adaptive-learning / exercise modules
// Enforced by authority contract tests.
// ============================================

// Types
export type {
  HKEAALevel,
  HKEAAPaper,
  CalibrationFixtureKind,
  ExtractionStatus,
  AuthoritativeCalibrationStatus,
  CalibrationProvenance,
  AuthoritativeCalibrationFixture,
  OfficialRubricReference,
  QuarantineRecord,
  FixtureValidationResult,
  RubricScope,
  AgreementMetrics,
  GroupAgreement,
  CalibrationComparison,
  CalibrationMetrics,
  InsufficientDataArea,
  CalibrationGatePolicy,
  CalibrationGateDecision,
  CalibrationGateResult,
  GateThresholdResult,
  CalibrationBenchmarkReport,
  HumanMarkerScoreProvenance,
  HumanMarkerCalibrationFixture,
  HumanMarkerEvidenceSetResult,
  HumanMarkerSourceClass,
  HumanMarkerSourceClassification,
  HumanMarkerSourceManifestEntry,
  HumanMarkerEvidenceClass,
  HumanMarkerEvidenceIntake,
  HumanMarkerProvenanceClass,
  HumanMarkerIntakeReport,
  IntakeFieldStatus,
} from "./types";
export { DEFAULT_CALIBRATION_GATE_POLICY } from "./types";

// Human-marker evidence contract (future genuine marker data)
export {
  buildHumanMarkerFixtureId,
  validateHumanMarkerFixture,
  validateHumanMarkerEvidenceSet,
  humanMarkerEvidenceKey,
  classifyHumanMarkerSource,
  classifyHumanMarkerEvidence,
  type SourceClassificationInput,
} from "./human-marker";

// R3.10-J: human-marker evidence intake checker (future evidence)
export {
  checkHumanMarkerEvidenceIntake,
  classifyProvenanceQuality,
} from "./intake";

// Human-marker evidence ingestion (R3.10-G / R3.10-H)
export {
  ingestHumanMarkerSources,
  writeHumanMarkerIngestionOutput,
  extractStudentScript,
  sha256OfBytes,
  buildEvidenceInventory,
  HUMAN_MARKER_SOURCES,
  type HumanMarkerIngestionResult,
  type HumanMarkerIngestionInput,
  type HumanMarkerWriteOutcome,
  type EvidenceInventoryEntry,
} from "./ingestion/ingest-human-marker";

// Provenance & validation
export {
  computeProvenanceHash,
  classifyFixtureKind,
  validateAuthoritativeFixture,
} from "./provenance";

// Metrics
export {
  mean,
  rmse,
  computeAgreementMetrics,
  computeCalibrationMetrics,
} from "./metrics";

// Gates
export { evaluateCalibrationGates } from "./gates";

// Runner
export {
  loadAuthoritativeFixtures,
  loadHumanMarkerFixtures,
  runCalibrationBenchmark,
  runHumanMarkerCalibrationBenchmark,
  DEFAULT_CALIBRATION_FIXTURES_DIR,
  type CalibrationAnalyzer,
  type CalibrationRunnerOptions,
  type HumanMarkerRunnerOptions,
} from "./runner";

// Report
export { renderCalibrationReport } from "./report";

// Ingestion
export {
  ingestHKEAAMaterials,
  type IngestionInput,
  type IngestionResult,
} from "./ingestion/ingest-hkeaa";
export {
  parseExemplarBooklet,
  type BookletParserMeta,
  type ParsedBooklet,
} from "./ingestion/parse-exemplar-booklet";
export {
  parseLevelDescriptors,
  type DescriptorParserMeta,
  type ParsedDescriptors,
} from "./ingestion/parse-level-descriptors";
export {
  parsePaper4Samples,
  type Paper4ParserMeta,
  type ParsedPaper4,
} from "./ingestion/parse-paper4-samples";
export {
  writeIngestionOutput,
  type WriteOutcome,
  type WriteOptions,
} from "./ingestion/write-ingestion-output";
