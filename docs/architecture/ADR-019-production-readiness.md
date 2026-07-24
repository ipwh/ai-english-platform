# ADR-019: Production Readiness & Performance Baseline

**Date**: 2026-07-24  
**Status**: Accepted  
**Sprint**: 96

## Context

The architecture is frozen (Sprint 95). Sprint 96 adds production hardening: benchmark framework, performance baselining, regression detection, and automated health checks — without changing any public API, workflow, or provider.

## Decision

### 1. AI Benchmark Framework

`ai/benchmark/` module providing:
- **`benchmark-types.ts`**: `BenchmarkScenario`, `BenchmarkResult`, `RunMetrics`, `AggregateMetrics`, `BenchmarkSuite`
- **`benchmark-scenarios.ts`**: Pre-configured scenarios for 4 core use cases
- **`benchmark-runner.ts`**: Executes scenarios against usecase functions, collects metrics from `runtime-metrics.ts`
- **`benchmark-report.ts`**: Generates Markdown and JSON reports
- **`index.ts`**: Barrel exports

### 2. Performance Baseline

`ai/services/performance-baseline.ts`:
- `capturePerformanceBaseline()`: Snapshots current runtime metrics
- `getPerformanceBaseline()`: Returns saved baseline
- `getPerformanceBaselineReport()`: Returns current vs baseline comparison

### 3. Regression Detector

`ai/runtime/regression-detector.ts`:
- `detectRegressions()`: Compares current metrics vs saved baseline
- `runRegressionCheck()`: Captures baseline on first call, detects regressions on subsequent calls
- Severity levels: `none`, `warning` (≥25% latency increase), `critical` (≥50% latency increase)

### 4. Benchmark CLI

`scripts/benchmark-ai.ts`:
- Command: `npx tsx scripts/benchmark-ai.ts`
- Runs all 4 scenarios, writes `benchmark-reports/benchmark.json` and `benchmark-summary.md`

### 5. Health Endpoint Extension

`GET /api/health?type=runtime` now returns:
```json
{
  "performance": { "totalCalls": ..., "avgLatencyMs": ..., ... },
  "baseline": { "baseline": {...}, "current": {...}, "comparison": {...} },
  "regressions": { "hasRegressions": false, "checks": [...], ... },
  "benchmarks": { "status": "available", "cli": "npm run benchmark:ai" }
}
```

## Performance Targets

| Metric | Warning | Critical |
|---|---|---|
| Latency increase | ≥25% | ≥50% |
| Cache hit ratio decrease | ≥10% | N/A |
| Validation failure increase | ≥5% | ≥15% |

## Results

| Metric | Sprint 95 | Sprint 96 |
|---|---|---|
| Architecture tests | 85 | **92** |
| Total tests | 1019 | **1026** |
| New files | 0 | **8** |
| ADRs | 18 | **19** |
