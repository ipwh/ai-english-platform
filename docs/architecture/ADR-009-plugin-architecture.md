# ADR-009: Plugin Architecture & Extension Points

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 86

## Context

After Sprint 85, the platform had strong runtime governance, event bus, and modular architecture. However, extending the platform (adding new AI providers, learning strategies, or analytics) required modifying core runtime code. This violated the Open/Closed Principle.

## Decision

Convert the platform from a **modular architecture** into an **extensible platform** via a canonical Plugin Architecture:

```
Route → Facade → Platform Runtime → Plugin Registry
                                      ├── AI Provider Plugins
                                      ├── Learning Strategy Plugins
                                      ├── Analytics Plugins
                                      └── Platform Plugins
```

**Rules**:
1. All plugins implement `PlatformPlugin` (id, version, dependencies, initialize, dispose)
2. `PluginRegistry` is the single canonical registry — `register()`, `unregister()`, `getPlugin()`, `getPluginsByTag()`
3. Plugins receive `PluginContext` (eventBus, logger, config, registry) — never import concrete services
4. Plugin initialization resolves dependencies topologically
5. Plugins cannot import Prisma, Routes, or Facades directly

## Extension Points

| Domain | Plugin Interface | Location |
|---|---|---|
| AI Providers | `ProviderPlugin` (capabilities, call) | `ai/plugins/provider-plugin.ts` |
| Learning Strategies | `LearningStrategyPlugin` (weight, evaluate) | `learning/plugins/learning-strategy.ts` |
| Analytics | `AnalyticsPlugin` (category, consume, getMetrics) | `analytics/plugins/analytics-plugin.ts` |

## Alternatives Considered

- **DI container (Inversify/TSyringe)**: Rejected — over-engineering; simple registry + topological sort sufficient.
- **No plugin system (keep monolithic)**: Rejected — prevents extensibility; violates Open/Closed Principle.

## Consequences

- New AI providers: register via `pluginRegistry.register(providerPlugin)` — zero core code changes
- New learning strategies: register via `pluginRegistry.register(strategyPlugin)` with weight
- New analytics: register via `pluginRegistry.register(analyticsPlugin)` + auto-subscribe to events
- Plugin loader supports lazy loading and dependency resolution

## Ownership

`platform/plugins/` — canonical plugin infrastructure  
`ai/plugins/` — AI provider plugin interface  
`learning/plugins/` — learning strategy plugin interface  
`analytics/plugins/` — analytics plugin interface
