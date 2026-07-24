# ADR-021: Operational Reliability — SLO, Error Budgets & Runbooks

**Date**: 2026-07-24  
**Status**: Accepted  
**Sprint**: 98

## Context

With architecture frozen (Sprint 95), benchmarks (96), load testing (97), the platform needs production operational governance: SLO tracking, error budgets, incident classification, and operational runbooks.

## Decision

### 1. SLO Manager

3 default SLOs registered on module load:
- `ai-availability`: 99.5% target
- `ai-latency`: P95 under 3s, 95% target
- `ai-success-rate`: 99% target

Functions: `registerSLO()`, `evaluate()`, `evaluateAll()`, `getStatus()`, `exportSnapshot()`

### 2. Error Budget

Daily/weekly/monthly tracking with `consume()`, `remaining()`, `percentage()`, `isExceeded()`.

### 3. Reliability Score

Weighted components (0-100 → A+/A/B/C/D):
- SLO Compliance (30%)
- Provider Health (25%)
- System Saturation (15%)
- Regression Status (15%)
- Capacity Headroom (10%)
- Cache Efficiency (5%)

### 4. Incident Classifier

8 categories: `ProviderFailure`, `HighLatency`, `RetryStorm`, `FallbackCascade`, `CircuitBreakerOpen`, `ValidationFailure`, `MemoryPressure`, `Unknown`. 4 severities: `Critical`/`High`/`Medium`/`Low`.

### 5. Operational Runbooks

Each incident type maps to: Diagnosis → Immediate Actions → Escalation → Recovery → Verification → Prevention.

### 6. Reliability Dashboard

`PlatformReliabilityDashboard` combines all SRE metrics. `getFullRuntimeReport()` provides complete runtime state for health endpoint.

## Results

| Metric | Sprint 97 | Sprint 98 |
|---|---|---|
| Architecture tests | 99 | **106** |
| Total tests | 1033 | **1040** |
| New files | 7 | **8** (SRE module) + 1 (CLI) |
| ADRs | 20 | **21** |
