// ============================================
// R3.10-F: Calibration Validity Gates
//
// Explicit, configurable validity gates for CI reporting.
//
// IMPORTANT: thresholds are POLICY / configuration, NOT facts.
// They encode an operational decision about when the platform may
// treat calibration evidence as sufficient. They are NOT official
// HKDSE validity standards and must never be presented as such.
//
// Decision order:
//   INSUFFICIENT_DATA — not enough authoritative samples (or no
//       scored samples) to compute meaningful agreement.
//   PASS               — data sufficient AND every threshold met.
//   FAIL               — data sufficient but a threshold is broken.
//
// The system NEVER claims marker-equivalence: PASS only means
// "current policy thresholds are met", which the report states.
// ============================================

import type {
  CalibrationBenchmarkReport,
  CalibrationGatePolicy,
  CalibrationGateResult,
  GateThresholdResult,
} from "./types";

export interface GateEvaluationInput {
  sampleCount: number;
  scoredCount: number;
  /**
   * Phase 8: number of human-marker fixtures that are VERIFIED
   * overall-comparable samples. Unverified comparable evidence NEVER
   * counts toward this requirement.
   */
  verifiedComparableCount: number;
  policy: CalibrationGatePolicy;
  report: Pick<CalibrationBenchmarkReport, "metrics">;
}

/**
 * Evaluate calibration gates against a report. Pure function.
 */
export function evaluateCalibrationGates(
  input: GateEvaluationInput,
): CalibrationGateResult {
  const { sampleCount, scoredCount, verifiedComparableCount, policy, report } = input;
  const m = report.metrics;
  const thresholds: GateThresholdResult[] = [];
  const reasons: string[] = [];

  // 1. Data sufficiency (hard requirement before any PASS).
  if (sampleCount < policy.minAuthoritativeSamples) {
    thresholds.push({
      name: "minAuthoritativeSamples",
      metricValue: sampleCount,
      threshold: policy.minAuthoritativeSamples,
      required: "gte",
      met: false,
    });
    reasons.push(
      `authoritative sample count ${sampleCount} < required ${policy.minAuthoritativeSamples}`,
    );
  } else {
    thresholds.push({
      name: "minAuthoritativeSamples",
      metricValue: sampleCount,
      threshold: policy.minAuthoritativeSamples,
      required: "gte",
      met: true,
    });
  }

  if (scoredCount < policy.minScoredSamples) {
    thresholds.push({
      name: "minScoredSamples",
      metricValue: scoredCount,
      threshold: policy.minScoredSamples,
      required: "gte",
      met: false,
    });
    reasons.push(
      `scored sample count ${scoredCount} < required ${policy.minScoredSamples}`,
    );
  } else {
    thresholds.push({
      name: "minScoredSamples",
      metricValue: scoredCount,
      threshold: policy.minScoredSamples,
      required: "gte",
      met: true,
    });
  }

  const sufficiencyFailed = thresholds.some(t => !t.met);
  if (sufficiencyFailed) {
    return {
      decision: "INSUFFICIENT_DATA",
      policy,
      thresholds,
      reasons: [
        "insufficient-authoritative-data",
        ...reasons,
        "The platform makes NO claim of marker-equivalence; more authoritative "
        + "samples with published values are required before any PASS is possible.",
      ],
    };
  }

  // P1-F2 (Phase 8): VERIFIED overall-comparable human-marker evidence is
  // required before any validity judgment. Unverified comparable evidence
  // NEVER satisfies this gate; absence yields INSUFFICIENT_DATA (never PASS,
  // never FAIL merely because evidence is absent).
  if (verifiedComparableCount < policy.minVerifiedComparableSamples) {
    thresholds.push({
      name: "minVerifiedComparableSamples",
      metricValue: verifiedComparableCount,
      threshold: policy.minVerifiedComparableSamples,
      required: "gte",
      met: false,
    });
    return {
      decision: "INSUFFICIENT_DATA",
      policy,
      thresholds,
      reasons: [
        "insufficient-verified-comparable-samples",
        `verified comparable samples ${verifiedComparableCount} < required ${policy.minVerifiedComparableSamples}`,
        ...(verifiedComparableCount > 0
          ? []
          : ["unverified comparable evidence does NOT satisfy this gate — never convert unverified into verified"]),
        "This is an operational engineering threshold, NOT a statistical validity threshold.",
        "ASSESSMENT VALIDITY NOT ESTABLISHED.",
      ],
    };
  }
  thresholds.push({
    name: "minVerifiedComparableSamples",
    metricValue: verifiedComparableCount,
    threshold: policy.minVerifiedComparableSamples,
    required: "gte",
    met: true,
  });

  // P3-A (Phase 7): sufficient counts but ZERO overall-comparable pairs
  // cannot support a validity judgment — this is INSUFFICIENT_DATA,
  // never FAIL (and never PASS).
  if (m.overall.n === 0) {
    return {
      decision: "INSUFFICIENT_DATA",
      policy,
      thresholds,
      reasons: [
        "insufficient-overall-comparable-pairs",
        "sample and scored counts meet policy minimums, but 0 overall-comparable "
        + "pairs exist — assessment validity cannot be judged from criterion-only "
        + "or level-only evidence. ASSESSMENT VALIDITY NOT ESTABLISHED.",
      ],
    };
  }

  // 2. Agreement quality thresholds (only meaningful with data).
  const metricChecks: Array<{
    name: string;
    value: number | null;
    threshold: number;
    required: "gte" | "lte";
  }> = [
    { name: "maxOverallMAE", value: m.overall.mae, threshold: policy.maxOverallMAE, required: "lte" },
    { name: "maxOverallRMSE", value: m.overall.rmse, threshold: policy.maxOverallRMSE, required: "lte" },
    { name: "maxAbsBias", value: m.overall.meanBias === null ? null : Math.abs(m.overall.meanBias), threshold: policy.maxAbsBias, required: "lte" },
    { name: "minExactAgreementRate", value: m.overall.exactAgreementRate, threshold: policy.minExactAgreementRate, required: "gte" },
    { name: "minWithinOneAgreementRate", value: m.overall.withinOneAgreementRate, threshold: policy.minWithinOneAgreementRate, required: "gte" },
  ];

  // P2-B (Phase 7): dimension-level (C/L/O) gates. POLICY_DEFINED
  // thresholds. Evaluated ONLY when criterion data exists; absence is
  // recorded as "not applicable" (never silently passed, never blocking).
  const criterionChecks: Array<{
    name: string;
    value: number | null;
    threshold: number;
  }> = [
    { name: "maxContentMAE", value: m.perCriterion.content.mae, threshold: policy.maxContentMAE },
    { name: "maxLanguageMAE", value: m.perCriterion.language.mae, threshold: policy.maxLanguageMAE },
    { name: "maxOrganizationMAE", value: m.perCriterion.organization.mae, threshold: policy.maxOrganizationMAE },
  ];
  for (const check of criterionChecks) {
    const missing = check.value === null;
    if (missing) {
      thresholds.push({
        name: check.name,
        metricValue: null,
        threshold: check.threshold,
        required: "lte",
        met: true,
      });
      reasons.push(`${check.name}: not applicable — no criterion-level comparable pairs`);
      continue;
    }
    const met = (check.value as number) <= check.threshold;
    thresholds.push({
      name: check.name,
      metricValue: check.value,
      threshold: check.threshold,
      required: "lte",
      met,
    });
    if (!met) {
      reasons.push(`${check.name}: ${check.value} > ${check.threshold} (POLICY_DEFINED, NOT official HKDSE tolerance)`);
    }
  }

  for (const check of metricChecks) {
    const missing = check.value === null;
    const met = !missing
      && (check.required === "lte" ? (check.value as number) <= check.threshold : (check.value as number) >= check.threshold);
    thresholds.push({
      name: check.name,
      metricValue: check.value,
      threshold: check.threshold,
      required: check.required,
      met,
    });
    if (missing) {
      reasons.push(`${check.name}: metric unavailable (no comparable pairs)`);
    } else if (!met) {
      reasons.push(
        `${check.name}: ${check.value} ${check.required === "lte" ? ">" : "<"} ${check.threshold}`,
      );
    }
  }

  const allMet = thresholds.every(t => t.met);
  return {
    decision: allMet ? "PASS" : "FAIL",
    policy,
    thresholds,
    reasons: allMet
      ? [
        "all policy thresholds met — NOTE: this is a POLICY gate result, "
        + "NOT a claim that the AI is HKDSE marker-equivalent",
        ...reasons.filter(r => r.includes("not applicable")),
      ]
      : reasons,
  };
}
