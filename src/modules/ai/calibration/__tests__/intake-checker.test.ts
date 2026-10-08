// ============================================
// R3.10-J: Evidence Intake Checker — Adversarial & Positive Tests
//
// All synthetic inputs are TEST_ONLY and never enter the real
// calibration dataset. The real inventory must remain unchanged:
// OVERALL_COMPARABLE = 0.
// ============================================

import { describe, it, expect } from "vitest";
import { join, resolve } from "node:path";
import {
  checkHumanMarkerEvidenceIntake,
  classifyProvenanceQuality,
} from "../intake";
import { ingestHumanMarkerSources, buildEvidenceInventory } from "../ingestion/ingest-human-marker";
import { HAS_SCORED_SCRIPTS } from "./corpus-availability";
import type { HumanMarkerEvidenceIntake } from "../types";

const ROOT = resolve(__dirname, "..", "..", "..", "..", "..");
const SOURCES_DIR = join(ROOT, "materials", "_hkeaa_scored_scripts");

const SHA = "a".repeat(64);

function validIntake(overrides: Partial<HumanMarkerEvidenceIntake> = {}): HumanMarkerEvidenceIntake {
  return {
    evidenceId: "hm-test-intake-001",
    sourceDocument: "TEST_ONLY source.pdf",
    sourceHash: SHA,
    year: 2025,
    paper: "Paper 2",
    task: "P2-2025-PartB-Q1",
    scriptText: "TEST_ONLY script text — uniforms promote equality.",
    overallScore: 18,
    overallScale: 21,
    scoreLabel: "Overall: 18/21",
    provenanceOrganization: "hkeaa",
    markerBasis: "official-marking-record",
    taskPartScope: "paper-2-part-b",
    ocrDerived: false,
    notes: "TEST_ONLY synthetic intake — never real evidence",
    ...overrides,
  };
}

describe("R3.10-J — provenance quality model", () => {
  it("classifies official HKEAA marking records as AUTHORITATIVE_OFFICIAL", () => {
    expect(classifyProvenanceQuality(validIntake())).toBe("AUTHORITATIVE_OFFICIAL");
  });

  it("classifies non-HKEAA official marking records as VERIFIED_HUMAN_MARKER", () => {
    expect(classifyProvenanceQuality(
      validIntake({ provenanceOrganization: "exam-board-x" }),
    )).toBe("VERIFIED_HUMAN_MARKER");
  });

  it("classifies teacher marking as TEACHER_MARKED", () => {
    expect(classifyProvenanceQuality(
      validIntake({ markerBasis: "teacher-marking" }),
    )).toBe("TEACHER_MARKED");
  });

  it("classifies research annotations and third-party and unknown and OCR-derived", () => {
    expect(classifyProvenanceQuality(
      validIntake({ markerBasis: "research-annotation" }),
    )).toBe("RESEARCH_DATASET");
    expect(classifyProvenanceQuality(
      validIntake({ markerBasis: "unknown", provenanceOrganization: "website-y" }),
    )).toBe("THIRD_PARTY");
    expect(classifyProvenanceQuality(validIntake({
      markerBasis: "unknown", provenanceOrganization: undefined,
    }))).toBe("UNKNOWN");
    expect(classifyProvenanceQuality(validIntake({ ocrDerived: true })))
      .toBe("OCR_DERIVED");
  });
});

describe("R3.10-J — positive intake contract", () => {
  it("accepts a fully valid overall-score candidate", () => {
    const report = checkHumanMarkerEvidenceIntake(validIntake());
    expect(report.accepted).toBe(true);
    expect(report.evidenceClass).toBe("ACCEPT_OVERALL_SCORE");
    expect(report.provenanceClass).toBe("AUTHORITATIVE_OFFICIAL");
    expect(report.fields.every(f => f.status === "PRESENT")).toBe(true);
  });

  it("accepts a percentage-scale candidate with full provenance and stable hash", () => {
    const report = checkHumanMarkerEvidenceIntake(validIntake({
      overallScore: 82,
      overallScale: 100,
      scoreLabel: "Score: 82/100",
      provenanceOrganization: "exam-board-x",
    }));
    expect(report.accepted).toBe(true);
    expect(report.evidenceClass).toBe("ACCEPT_OVERALL_SCORE");
  });

  it("reports every requirement as PRESENT for a valid candidate", () => {
    const report = checkHumanMarkerEvidenceIntake(validIntake());
    const names = report.fields.map(f => f.field);
    for (const required of [
      "scriptText", "taskIdentity", "overallScore", "overallScale",
      "scoreLabel", "markerProvenance", "sourceHash", "ocrUncertainty",
      "duplicate", "conflict",
    ]) {
      expect(names).toContain(required);
    }
  });
});

describe("R3.10-J — negative cases (no invalid evidence crosses the boundary)", () => {
  function rejects(name: string, intake: HumanMarkerEvidenceIntake, expectClass?: string) {
    it(name, () => {
      const report = checkHumanMarkerEvidenceIntake(intake);
      expect(report.accepted).toBe(false);
      if (expectClass) expect(report.evidenceClass).toBe(expectClass);
    });
  }

  rejects("level-only evidence", validIntake({
    overallScore: undefined, overallScale: undefined, scoreLabel: undefined,
  }), "LEVEL_ONLY");

  rejects("C/L/O-only evidence", validIntake({
    overallScore: undefined, overallScale: undefined, scoreLabel: undefined,
    notes: "TEST_ONLY C/L/O only",
  }), "LEVEL_ONLY");

  rejects("M1/M2 without established comparable scale", validIntake({
    overallScale: 42, scoreLabel: "M1:21 M2:19 40/42",
  }), "NON_COMPARABLE_SCORE");

  rejects("total score without established denominator", validIntake({
    overallScale: undefined,
  }), "NON_COMPARABLE_SCORE");

  rejects("score inferred from percentage (no label)", validIntake({
    scoreLabel: undefined,
  }), "NON_COMPARABLE_SCORE");

  rejects("OCR-corrupted / OCR-derived score", validIntake({
    ocrDerived: true,
  }), "NON_COMPARABLE_SCORE");

  rejects("missing provenance", validIntake({
    provenanceOrganization: undefined,
    markerBasis: undefined,
  }), "NON_COMPARABLE_SCORE");

  rejects("missing script", validIntake({ scriptText: "   " }), "IMAGE_ONLY_UNREADABLE");

  rejects("missing source hash", validIntake({ sourceHash: undefined }), "NON_COMPARABLE_SCORE");

  rejects("third-party score with unknown marking provenance", validIntake({
    provenanceOrganization: "website-y", markerBasis: "unknown",
  }), "NON_COMPARABLE_SCORE");

  rejects("teacher score (policy requires authoritative marker evidence)", validIntake({
    markerBasis: "teacher-marking",
  }), "NON_COMPARABLE_SCORE");

  rejects("malformed score", validIntake({ overallScore: Number.NaN }), "NON_COMPARABLE_SCORE");

  rejects("impossible score above denominator", validIntake({ overallScore: 25 }), "NON_COMPARABLE_SCORE");

  rejects("score outside established scale", validIntake({
    overallScore: 18, overallScale: 42,
  }), "NON_COMPARABLE_SCORE");

  rejects("teaching material", validIntake({ isTeachingMaterial: true }), "TEACHING_REFERENCE");

  rejects("synthetic fixture masquerading", validIntake({
    markerBasis: undefined,
    provenanceOrganization: undefined,
    notes: "generated by AI",
  }), "NON_COMPARABLE_SCORE");

  it("an otherwise valid score whose source hash changes conflicts with existing evidence", () => {
    const existing = [{
      evidenceId: "existing-1",
      year: 2025,
      paper: "Paper 2",
      task: "P2-2025-PartB-Q1",
      overallScore: 18,
      sourceHash: SHA,
    }];
    const report = checkHumanMarkerEvidenceIntake(validIntake({
      sourceHash: "b".repeat(64),
    }), { existingEvidence: existing });
    expect(report.accepted).toBe(false);
    expect(report.fields.find(f => f.field === "conflict")?.status).toBe("INVALID");
  });

  it("an identical duplicate is detected and never counted as a new sample", () => {
    const existing = [{
      evidenceId: "existing-1",
      year: 2025,
      paper: "Paper 2",
      task: "P2-2025-PartB-Q1",
      overallScore: 18,
      sourceHash: SHA,
    }];
    const report = checkHumanMarkerEvidenceIntake(validIntake(), { existingEvidence: existing });
    expect(report.accepted).toBe(false);
    expect(report.fields.find(f => f.field === "duplicate")?.status).toBe("INVALID");
  });

  it("missing fields are reported MISSING, never filled in", () => {
    const bare: HumanMarkerEvidenceIntake = { evidenceId: "bare-1" };
    const report = checkHumanMarkerEvidenceIntake(bare);
    expect(report.accepted).toBe(false);
    for (const f of report.fields) {
      if (f.status !== "PRESENT") expect(f.status === "MISSING" || f.status === "INVALID").toBe(true);
    }
  });
});

describe("R3.10-J — deterministic + isolation", () => {
  it("checker output is deterministic", () => {
    const a = checkHumanMarkerEvidenceIntake(validIntake());
    const b = checkHumanMarkerEvidenceIntake(validIntake());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it.skipIf(!HAS_SCORED_SCRIPTS)("synthetic TEST_ONLY inputs never change the real inventory", () => {
    checkHumanMarkerEvidenceIntake(validIntake());
    checkHumanMarkerEvidenceIntake(validIntake({ evidenceId: "hm-test-intake-002" }));
    const result = ingestHumanMarkerSources({ sourcesDir: SOURCES_DIR });
    const inventory = buildEvidenceInventory(result);
    expect(inventory.summary.ledger.OVERALL_COMPARABLE).toBe(0);
    expect(inventory.summary.ledger.ACCEPTED).toBe(3);
    expect(inventory.summary.ledger.DISCOVERED).toBe(3);
    expect(inventory.summary.inferredScores).toBe(0);
    expect(inventory.candidates.some(c => c.fixtureId === "hm-test-intake-001")).toBe(false);
  });

  it.skipIf(!HAS_SCORED_SCRIPTS)("the ledger never collapses categories", () => {
    const inventory = buildEvidenceInventory(
      ingestHumanMarkerSources({ sourcesDir: SOURCES_DIR }),
    );
    expect(inventory.summary.ledger).toEqual({
      DISCOVERED: 3,
      ACCEPTED: 3,
      REJECTED: 0,
      QUARANTINED: 0,
      DUPLICATE: 0,
      CONFLICT: 0,
      TEACHING_REFERENCE: 1,
      CRITERION_ONLY: 2,
      LEVEL_ONLY: 0,
      NON_COMPARABLE: 1,
      OVERALL_COMPARABLE: 0,
    });
  });
});
