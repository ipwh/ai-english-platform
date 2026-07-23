# ADR-005: Provider Isolation

**Date**: 2026-07-23  
**Status**: Accepted  
**Sprint**: 77

## Context

The AI orchestration layer (`ai/services/ai-service.ts`, ~3400 lines) contained:
- Provider-specific fetch logic (`_callDeepSeek`, `_callGemini`, `_callGeminiViaVertex`)
- Provider-specific payload construction (`toGeminiPayload`, `adaptMessagesForGemini`)
- Provider-specific API key references (`config.deepseek.apiKey`, `config.gemini.apiKey`)
- Business use cases (question generation, writing analysis, etc.)

This violated separation of concerns and made provider changes difficult.

## Decision

All provider-specific logic lives exclusively under `ai/providers/`.

```
ai/providers/
    provider-registry.ts    ← Fallback chain: DS→Vertex→Gemini→Claude→OpenAI
    deepseek-provider.ts
    vertex-gemini-provider.ts
    gemini-provider.ts
    claude-provider.ts
    openai-provider.ts
```

**Rules**:
1. No service outside `providers/` may contain provider-specific API keys or fetch calls
2. Services request capabilities from `providerRegistry.call()` — never call providers directly
3. Prompt templates live exclusively in `ai/prompts/`
4. Deprecated legacy code extracted to `ai/services/ai-legacy.ts` (0 consumers)

## Alternatives Considered

- **Provider abstraction layer (separate module)**: Rejected — providers are tightly coupled to AI module; separate module adds complexity without benefit.
- **Single provider only**: Rejected — fallback chain (5 providers) is a core platform requirement for reliability.

## Consequences

- Provider-specific code removed from `ai-service.ts` (~200 lines extracted to `ai-legacy.ts`)
- Architecture enforcement: provider code only in `providers/` or `ai-legacy` (test v8)
- 25 external consumers unchanged — all use `callLLM()` which delegates to `providerRegistry`

## Ownership

`ai/providers/provider-registry.ts` — canonical provider orchestration  
`ai/prompts/` — canonical prompt templates
