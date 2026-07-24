# ADR-007: AI Runtime Governance

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 84

## Context

After Sprint 83, the AI platform had:
- Pipeline orchestration (`ai/pipeline/`)
- Provider registry (`ai/providers/`)
- Retry, context builder, response parser
- Runtime metrics and observability

But execution policies (timeouts, retries, provider selection, budgets, circuit breaking) were scattered across multiple files with duplicated defaults.

## Decision

Introduce a canonical AI Runtime Governance layer at `ai/runtime/`:

| Component | Owner | Responsibility |
|---|---|---|
| `execution-policy.ts` | `ai/runtime/` | Canonical execution parameters: retries, timeout, temperature, maxTokens |
| `provider-policy.ts` | `ai/runtime/` | Provider selection, fallback chain, blacklist |
| `timeout-policy.ts` | `ai/runtime/` | Centralized timeouts: default, JSON mode, streaming, per-provider |
| `budget-policy.ts` | `ai/runtime/` | Token budget, cost budget, exceeded detection |
| `circuit-breaker.ts` | `ai/runtime/` | Provider health: open/closed/half-open states |

**Rules**:
1. Only `ai/runtime/` owns execution policies
2. Pipeline cannot hardcode timeouts, retries, or provider selection
3. ProviderRegistry is execution-only — no routing logic
4. Budget checks happen before provider execution
5. Circuit breakers automatically skip unhealthy providers

## Alternatives Considered

- **Keep policies scattered**: Rejected — led to duplicated defaults and inconsistent behavior.
- **External policy service**: Rejected — over-engineering; in-memory policies are sufficient.

## Consequences

- Execution policies: 6 scattered locations → 1 canonical location
- Provider routing: `providerRegistry` delegated to `provider-policy.ts`
- Circuit breaker: New resilience pattern prevents cascading failures
- Health endpoint: Extended with `runtime.policy`, `runtime.circuitBreakers`, `runtime.budgets`

## Ownership

`ai/runtime/` — canonical runtime governance  
`ai/providers/provider-registry.ts` — execution only (no routing logic)
