# Technical Debt Register

**Generated**: 2026-07-23 | **Sprint**: 79

---

## Category: Large Files

| # | File | Lines | Impact | Priority | Recommended Sprint |
|---|---|---|---|---|---|
| T1 | `ai/services/ai-service.ts` | 2936 | High — difficult to maintain, slow to test | 🟡 Medium | 80-82 (decompose into usecases/) |
| T2 | `writing-coach/services/writing-coach.ts` | 894 | Medium — single responsibility violation | 🟡 Medium | 83-84 |
| T3 | `experiment/services/experiment-engine.ts` | 750 | Medium — in-memory state, not persistent | 🟡 Medium | 85-86 |
| T4 | `ai/services/rag-service.ts` | 653 | Low — RAG retrieval, stable code | 🟢 Low | 87+ |
| T5 | `analytics/services/learning-analytics.ts` | 589 | Low — analytics computation | 🟢 Low | 87+ |

---

## Category: Deprecated APIs

| # | Location | API | Impact | Priority | Recommended Sprint |
|---|---|---|---|---|---|
| D1 | `ai/services/ai-legacy.ts` | `_callDeepSeek`, `_callGemini`, `_callGeminiViaVertex` | None — 0 consumers | 🟢 Low | 80 (delete file) |
| D2 | `learning/index.ts:17` | `learningEngine` export | None — 0 consumers, backward compat | 🟢 Low | 81 |
| D3 | `learning/services/dse-adaptive-path.ts:15` | `getDSEWeight` | Internal consumer only | 🟢 Low | 81 |
| D4 | `shared/auth/crypto.ts:97` | `hashPassword` | Public API, still consumed | 🟡 Medium | 85+ |
| D5 | `shared/types/types.ts:602` | `SkillItem` type | Public type, still used | 🟢 Low | 85+ |

---

## Category: Whitelisted Services (Size Governance)

| # | File | Lines | Reason | Priority | Recommended Sprint |
|---|---|---|---|---|---|
| W1 | `ai/services/ai-service.ts` | 2936 | Multi-use-case facade; decomposition in progress | 🟡 Medium | 80-82 |
| W2 | `experiment/services/experiment-engine.ts` | 750 | Experimental module; low churn | 🟢 Low | 85-86 |

---

## Category: Future Persistence Work

| # | Item | Impact | Priority | Recommended Sprint |
|---|---|---|---|---|
| P1 | `experiment-engine.ts` — in-memory experiment state | Data loss on restart | 🟡 Medium | 85-86 |
| P2 | `topic-selector.ts` — session blacklist not persisted | Minor UX issue on restart | 🟢 Low | 87+ |

---

## Category: Performance Opportunities

| # | Item | Impact | Priority | Recommended Sprint |
|---|---|---|---|---|
| O1 | `ai-service.ts` prompt construction on every call | Repeated string building | 🟢 Low | 87+ |
| O2 | `knowledge-graph.ts` graph algorithms O(n²) | Scale concern for >1000 nodes | 🟢 Low | 88+ |
| O3 | `rag-service.ts` embedding cache not warmed | Cold start latency | 🟢 Low | 88+ |

---

## Category: Experimental Code

| # | Location | Impact | Priority |
|---|---|---|---|
| E1 | `experiment/` module | Low — isolated, feature-flagged | 🟢 Low |
| E2 | `llm-eval/` module | Low — offline evaluation only | 🟢 Low |

---

## Summary

| Priority | Count | Items |
|---|---|---|
| 🟡 Medium | 8 | T1-T3, D4, W1, P1, O1, O2 |
| 🟢 Low | 9 | T4-T5, D1-D3, D5, W2, P2, O3, E1-E2 |
| **Total** | **17** | |

**Recommended next sprints**: 80-82 (AI decomposition), 83-86 (writing-coach + experiment persistence), 87+ (performance optimization)
