// ============================================
// R3.10-F: Calibration Report Renderer
//
// Renders the calibration benchmark as Markdown with TWO clearly
// separated concepts:
//
//   REGRESSION:     software behavior status (synthetic fixtures)
//   CALIBRATION:    agreement with authoritative published samples
//
// The report NEVER claims marker-equivalence. When authoritative
// data is insufficient it says so explicitly:
// "INSUFFICIENT AUTHORITATIVE DATA".
// ============================================

import type {
  AgreementMetrics,
  CalibrationBenchmarkReport,
  GroupAgreement,
} from "./types";
import type { BenchmarkReport } from "@/modules/ai/evaluation/golden-runner";

function fmt(v: number | null, digits = 2): string {
  return v === null ? "n/a" : v.toFixed(digits);
}

function fmtRate(v: number | null): string {
  return v === null ? "n/a" : `${(v * 100).toFixed(1)}%`;
}

function metricsTable(title: string, m: AgreementMetrics): string {
  const rows = [
    `| ${title} | ${m.n} | ${fmt(m.mae)} | ${fmt(m.rmse)} | ${fmt(m.meanBias)} | ${fmtRate(m.exactAgreementRate)} | ${fmtRate(m.withinOneAgreementRate)} | ${fmtRate(m.overScoringRate)} | ${fmtRate(m.underScoringRate)} |`,
  ];
  return rows.join("\n");
}

function groupTable(title: string, groups: GroupAgreement[]): string {
  if (groups.length === 0) return `### ${title}\n\n(no data)\n`;
  const lines = [
    `### ${title}`,
    "",
    "| group | n | exact | ±1 | MAE |",
    "|-------|---|-------|----|-----|",
    ...groups.map(g =>
      `| ${g.group} | ${g.n} | ${fmtRate(g.exact)} | ${fmtRate(g.withinOne)} | ${fmt(g.mae)} |`),
  ];
  return lines.join("\n");
}

function renderRegression(regression: BenchmarkReport | undefined): string {
  if (!regression) {
    return [
      "## REGRESSION (software behavior)",
      "",
      "Not run in this invocation. Synthetic regression fixtures are evaluated "
      + "separately from authoritative calibration fixtures.",
      "",
    ].join("\n");
  }
  return [
    "## REGRESSION (software behavior)",
    "",
    `- fixtures: ${regression.count}`,
    `- scored: ${regression.scored}`,
    `- overall MAE: ${fmt(regression.overallMAE)}`,
    `- overall RMSE: ${fmt(regression.overallRMSE)}`,
    `- overall bias: ${fmt(regression.overallBias)}`,
    "",
  ].join("\n");
}

function renderCriterionMetrics(
  m: CalibrationBenchmarkReport["metrics"],
  unavailableMessage?: string,
): string {
  const hasData = m.perCriterion.content.n > 0
    || m.perCriterion.language.n > 0
    || m.perCriterion.organization.n > 0;
  if (!hasData) {
    return [
      "### Criterion-level (Content / Language / Organization)",
      "",
      unavailableMessage
        ?? "No official criterion-level scores exist for any ingested sample. "
          + "Criterion statistics are NOT manufactured from overall scores.",
      "",
    ].join("\n");
  }
  const header = "| criterion | n | MAE | RMSE | bias | exact | ±1 | over | under |";
  const sep = "|-----------|---|-----|------|------|-------|----|------|-------|";
  const row = (name: string, m: AgreementMetrics) =>
    `| ${name} | ${m.n} | ${fmt(m.mae)} | ${fmt(m.rmse)} | ${fmt(m.meanBias)} | `
    + `${fmtRate(m.exactAgreementRate)} | ${fmtRate(m.withinOneAgreementRate)} | `
    + `${fmtRate(m.overScoringRate)} | ${fmtRate(m.underScoringRate)} |`;
  return [
    "### Criterion-level (Content / Language / Organization)",
    "",
    header,
    sep,
    row("Content", m.perCriterion.content),
    row("Language", m.perCriterion.language),
    row("Organization", m.perCriterion.organization),
    "",
  ].join("\n");
}

/**
 * Render the full calibration report plus an optional regression
 * section. Synthetic and scored numbers are never combined into a
 * single validity metric.
 *
 * options.datasetDescription replaces the "authoritative published
 * samples" phrasing for other scored datasets (e.g. human-marker
 * evidence); options.criterionUnavailableMessage replaces the
 * criterion-section wording when criterion scores were legitimately
 * not supplied.
 */
export function renderCalibrationReport(
  report: CalibrationBenchmarkReport,
  regression?: BenchmarkReport,
  options: {
    datasetDescription?: string;
    criterionUnavailableMessage?: string;
  } = {},
): string {
  const datasetDescription = options.datasetDescription
    ?? "agreement with authoritative published samples";
  const sections: string[] = [];

  sections.push("# HKDSE Calibration & Regression Report");
  sections.push("");
  sections.push(`Generated at: ${report.generatedAt}`);
  sections.push("");
  sections.push(
    "> Calibration data is evaluation infrastructure ONLY. "
    + "It never influences student scores, mastery, or adaptive learning state.",
  );
  sections.push("");

  // Phase 7: execution attribution — a run must be answerable afterwards.
  // Heading intentionally avoids the "## CALIBRATION" prefix so section
  // ordering tests can still locate the calibration agreement section.
  sections.push("## RUN METADATA");
  sections.push("");
  if (report.runMetadata) {
    const md = report.runMetadata;
    sections.push("| field | value |");
    sections.push("|-------|-------|");
    sections.push(`| calibrationVersion | ${md.calibrationVersion} |`);
    sections.push(`| datasetVersion | ${md.datasetVersion} |`);
    sections.push(`| datasetFingerprint | ${md.datasetFingerprint ?? "n/a"} |`);
    sections.push(`| scoringVersion | ${md.scoringVersion} |`);
    sections.push(`| promptVersion | ${md.promptVersion} |`);
    sections.push(`| provider | ${md.provider} |`);
    sections.push(`| model | ${md.model} |`);
    sections.push(`| temperature | ${md.temperature === null ? "unavailable" : String(md.temperature)} |`);
    sections.push(`| commitSha | ${md.commitSha ?? "unavailable"} |`);
    sections.push("");
    sections.push(
      "> Values marked `unavailable` are genuinely unknown — they are NEVER fabricated.",
    );
  } else {
    sections.push("(metadata unavailable for this run)");
  }
  sections.push("");

  sections.push(renderRegression(regression));
  sections.push("");

  sections.push("## CALIBRATION (agreement with authoritative published samples)".replace(
    "agreement with authoritative published samples",
    datasetDescription,
  ));
  sections.push("");
  sections.push(`- authoritative samples: ${report.sampleCount}`);
  sections.push(`- scored samples: ${report.scoredCount}`);
  sections.push(`- unscorable samples (no script text): ${report.unscorableCount}`);
  sections.push(`- quarantined source samples: ${report.quarantinedCount}`);
  sections.push("");

  // Evidence-category breakdown (human-marker datasets) — never collapsed.
  if (report.evidenceBreakdown) {
    const b = report.evidenceBreakdown;
    sections.push("### Evidence categories (never collapsed)");
    sections.push("");
    sections.push("| category | count |");
    sections.push("|----------|-------|");
    sections.push(`| overall-comparable (ACCEPT_OVERALL_SCORE) | ${b.overallComparable} |`);
    sections.push(`| criterion-only (ACCEPT_CRITERION_ONLY) | ${b.criterionOnly} |`);
    sections.push(`| non-comparable (NON_COMPARABLE_SCORE) | ${b.nonComparable} |`);
    sections.push(`| level-only (LEVEL_ONLY) | ${b.levelOnly} |`);
    sections.push(`| quarantined | ${b.quarantined} |`);
    sections.push("");
  }

  // Phase 7: evidence verification state — unverified is NEVER "verified".
  if (report.evidenceVerification) {
    const v = report.evidenceVerification;
    sections.push("### HUMAN EVIDENCE VERIFICATION");
    sections.push("");
    sections.push(`- total fixtures: ${v.total}`);
    sections.push(`- independently verified: ${v.verified}`);
    sections.push(`- unverified (owner-asserted): ${v.unverified}`);
    if (v.unverified > 0) {
      sections.push("");
      sections.push(
        "> Unverified fixtures are owner-asserted sources and are NOT "
        + "described as verified/official ground truth. They remain usable "
        + "as evidence but their authority is explicitly unverified.",
      );
    }
    sections.push("");
  }

  // Phase 7: per-fixture results — analysis failures are NEVER silently dropped.
  if (report.comparisons.length > 0) {
    sections.push("### Fixture results (failures never silently dropped)");
    sections.push("");
    sections.push("| fixture | status | detail |");
    sections.push("|---------|--------|--------|");
    for (const c of report.comparisons) {
      if (c.analysisFailure !== null) {
        sections.push(`| ${c.fixtureId} | analysisFailure | ${c.analysisFailure.replace(/\|/g, "/")} |`);
      } else {
        sections.push(`| ${c.fixtureId} | analyzed | ok |`);
      }
    }
    sections.push("");
  }

  if (report.scoredCount === 0) {
    sections.push("### INSUFFICIENT AUTHORITATIVE DATA");
    sections.push("");
    sections.push(
      "The current authoritative dataset contains official LEVEL labels only; "
      + "no candidate script text is extractable from the published handwritten "
      + "scans, and no numeric marks are published for these samples. "
      + "Score-agreement statistics therefore cannot be computed. "
      + "The platform makes NO claim that the AI is HKDSE marker-equivalent.",
    );
    sections.push("");
  } else {
    const header = "| metric | n | MAE | RMSE | bias | exact | ±1 | over | under |";
    const sep = "|--------|---|-----|------|------|-------|----|------|-------|";
    sections.push(header);
    sections.push(sep);
    sections.push(metricsTable("overall", report.metrics.overall));
    sections.push("");
    sections.push(renderCriterionMetrics(report.metrics, options.criterionUnavailableMessage));
    if (report.metrics.perMarkerPolicy.length > 0) {
      sections.push(groupTable("Per-marker-policy agreement", report.metrics.perMarkerPolicy));
      sections.push("");
    }
    sections.push(groupTable("Per-level agreement", report.metrics.perLevel));
    sections.push("");
    sections.push(groupTable("Per-year agreement", report.metrics.perYear));
    sections.push("");
    sections.push(groupTable("Per-task agreement", report.metrics.perTask));
    sections.push("");
  }

  // Phase 7: ordinal level metrics — distance, never conflated with exact.
  sections.push("### Ordinal level metrics (platform 1-5 scale)");
  sections.push("");
  const lm = report.metrics.levelMetrics;
  if (lm.n === 0) {
    sections.push("(no comparable level pairs — n/a)");
  } else {
    sections.push("| metric | n | value |");
    sections.push("|--------|---|-------|");
    sections.push(`| mean absolute level distance | ${lm.n} | ${fmt(lm.meanAbsoluteDistance)} |`);
    sections.push(`| max absolute level distance | ${lm.n} | ${lm.maxAbsoluteDistance === null ? "n/a" : String(lm.maxAbsoluteDistance)} |`);
    sections.push(`| within ±1 level rate | ${lm.n} | ${fmtRate(lm.withinOneLevelRate)} |`);
    sections.push("");
    sections.push(
      "> Level 4→Level 5 (distance 1) and Level 4→Level 1 (distance 3) are "
      + "DIFFERENT errors. Star-levels (5*/5**) fold onto index 5 for distance "
      + "purposes; string-exact agreement remains available in the level columns. "
      + "**Platform scale limitation:** the platform estimates on the 1-5 scale "
      + "only and CANNOT represent publication star distinctions (5*/5**) — "
      + "exact string equality is therefore NOT a valid equivalence test for "
      + "starred publications; the ordinal distance above is the correct "
      + "comparison for those labels.",
    );
  }
  sections.push("");

  // Phase 7: score distributions (human vs AI side by side).
  sections.push("### Score distributions (human vs AI)");
  sections.push("");
  const distRows = report.comparisons.filter(
    c => c.publishedOverall !== null || c.predictedOverall !== null || c.publishedLevel !== null || c.predictedLevel !== null,
  );
  if (distRows.length === 0) {
    sections.push("(no score distributions available)");
  } else {
    sections.push("| fixture | human overall | AI overall | human level | AI level |");
    sections.push("|---------|---------------|------------|-------------|----------|");
    for (const c of distRows) {
      sections.push(
        `| ${c.fixtureId} | ${c.publishedOverall === null ? "—" : c.publishedOverall} `
        + `| ${c.predictedOverall === null ? "—" : c.predictedOverall} `
        + `| ${c.publishedLevel ?? "—"} | ${c.predictedLevel ?? "—"} |`,
      );
    }
  }
  sections.push("");

  sections.push("## CALIBRATION GATE");
  sections.push("");
  sections.push(`Decision: **${report.gate.decision}**`);
  sections.push("");
  sections.push(
    "Thresholds are POLICY configuration (see calibration/gates.ts), "
    + "NOT official HKEAA validity standards.",
  );
  sections.push("");
  sections.push("| gate | value | threshold | met |");
  sections.push("|------|-------|-----------|-----|");
  for (const t of report.gate.thresholds) {
    sections.push(
      `| ${t.name} | ${t.metricValue === null ? "n/a" : t.metricValue} | ${t.threshold} | ${t.met ? "yes" : "no"} |`,
    );
  }
  sections.push("");
  for (const reason of report.gate.reasons) {
    sections.push(`- ${reason}`);
  }
  sections.push("");

  sections.push("## INSUFFICIENT DATA AREAS");
  sections.push("");
  if (report.insufficientAreas.length === 0) {
    sections.push("(none)");
  } else {
    for (const area of report.insufficientAreas) {
      sections.push(`- **${area.area}**: ${area.detail}`);
    }
  }
  sections.push("");

  sections.push("## LIMITATIONS");
  sections.push("");
  sections.push(
    "- Published exemplars carry LEVEL labels only; no criterion-level "
    + "or numeric scores are published for these samples.",
  );
  sections.push(
    "- Candidate scripts are handwritten scans without a text layer in "
    + "the PDF extraction; transcript creation would require manual "
    + "source verification (status: needs-manual-source-verification).",
  );
  sections.push(
    "- `published*Score` fields are only ever set from officially "
    + "published numbers. They are null in the current dataset.",
  );
  sections.push("");

  return sections.join("\n");
}
