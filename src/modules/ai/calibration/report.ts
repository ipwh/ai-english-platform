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
