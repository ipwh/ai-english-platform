# ADR-004: Cache Ownership

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 76

## Context

Two independent cache implementations existed:
1. `cache/cache-service.ts` — generic TTL cache (Map, namespace, stats, pruning)
2. `ai/services/ai-cache.ts` — AI-specific cache (Map, SHA-256, Vercel KV, feature flag)

Both implemented: TTL, Map storage, eviction, cleanup. This duplicated logic and created two sources of truth for cache behavior.

## Decision

`cache/` becomes the single canonical runtime cache implementation.

`ai/services/ai-cache.ts` becomes a thin wrapper that delegates in-memory operations to `cache/cache-service.ts`, keeping only AI-specific concerns (SHA-256 key hashing, Vercel KV backend, feature flag).

```
ai-cache.ts (thin wrapper: SHA-256 + KV + feature flag)
    ↓
cache/cache-service.ts (canonical: Map, TTL, namespace, stats, prune)
```

**Rules**:
1. Only `cache/` module owns cache implementation
2. No other module may implement `Map<string, CacheEntry>` pattern
3. All caches must have TTL and eviction

## Alternatives Considered

- **Merge ai-cache into cache-service directly**: Rejected — ai-cache has Vercel KV support and feature flags that are AI-specific.
- **Use Redis for all caching**: Deferred — Vercel KV already used for multi-instance, in-memory for dev.

## Consequences

- Duplicate cache implementations: 2 → 1
- Architecture enforcement: no duplicate caches allowed (test v7)
- `ai-cache.ts`: ~180 → ~70 lines (thin wrapper)

## Ownership

`cache/cache-service.ts` — canonical cache implementation  
`ai/services/ai-cache.ts` — AI-specific thin wrapper
