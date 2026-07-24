# ADR-020: Load Testing, Capacity Planning & Scalability

**Date**: 2026-07-24  
**Status**: Accepted  
**Sprint**: 97

## Context

With the architecture frozen (Sprint 95) and benchmark/performance baseline in place (Sprint 96), Sprint 97 adds runtime scalability infrastructure: load testing, capacity planning, stress testing, and saturation detection.

## Decision

### 1. Load Testing Framework

`platform/load-testing/` module:

| File | Purpose |
|---|---|
| `load-test-types.ts` | `LoadScenario`, `LoadResult`, `LoadSuite` with latency/throughput/memory stats |
| `load-test-scenarios.ts` | 4 pre-configured scenarios (single, burst-10, sustained-5, mixed-8) |
| `load-test-runner.ts` | Concurrent execution engine with burst/sustained/mixed patterns |
| `load-test-report.ts` | Markdown + JSON report generation |
| `stress-test.ts` | Predefined stress levels: 10/25/50/100 concurrent requests |
| `index.ts` | Barrel exports |

### 2. Capacity Planner

`ai/runtime/capacity-planner.ts`:
- Estimates max concurrent requests per provider (Little's Law)
- Queue depth, retry amplification, fallback amplification
- Monthly cost estimate
- `getCapacityPlan()` returns `CapacityPlan`

### 3. Saturation Detector

`ai/runtime/saturation-detector.ts`:
- Provider saturation detection (>80% = critical)
- Retry storm detection (>15% = critical)
- Fallback cascade detection (>10% = critical)
- Circuit breaker cascade detection (>20% = critical)
- Memory pressure detection (>500MB = critical)
- `detectSaturation()` returns `SaturationReport`

### 4. CLI

`scripts/load-test.ts` — `npx tsx scripts/load-test.ts`  
Outputs `load-reports/load-report.{json,md}`, `capacity-report.{json,md}`, `stress-report.json`

### 5. Health Endpoint

`GET /api/health?type=runtime` now includes `capacity`, `saturation`, and `load` fields.

## Capacity Model

| Metric | Formula |
|---|---|
| Max concurrent | `floor((1000 / avgLatencyMs) * 0.8 * 60)` per provider |
| Queue depth | `arrivalRate × avgServiceTime` (Little's Law) |
| Retry amplification | `retryCount / totalCalls` |
| Cost estimate | `totalCalls × $0.002 × 30` (monthly) |

## Results

| Metric | Sprint 96 | Sprint 97 |
|---|---|---|
| Architecture tests | 92 | **99** |
| Total tests | 1026 | **1033** |
| New files | 8 | **7** |
| ADRs | 19 | **20** |
