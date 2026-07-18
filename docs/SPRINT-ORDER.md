# 📋 Suggested Sprint Order — AI English Platform
## Sprint 0: Architecture Analysis
**Date:** 2026-07-18

---

## Sprint Sequencing Philosophy

The sprint order follows these principles:
1. **Fix critical risks first** (security, data loss, production stability)
2. **Reduce blast radius** before making large changes (add tests, add abstractions)
3. **Incremental value delivery** — each sprint produces a tangible improvement
4. **Dependency ordering** — foundational changes before dependent ones

---

## Sprint 0.5: Security Hardening (3 days)

**Goal:** Eliminate credential exposure and auth inconsistencies.

| Task | Effort | Risk Ref |
|---|---|---|
| Verify `gcp-service-account.json` and `client_secret_*.json` are gitignored and NOT in Git history | 2h | R13, R14 |
| Delete credential files from `materials/` if env vars are sufficient | 1h | R13, R14 |
| Replace hardcoded cookie names in `logout/route.ts` with `ALL_CLEARABLE_COOKIE_NAMES` | 1h | R8 |
| Replace hardcoded cookie names in `auth-next.ts` with `AUTHJS_SESSION_COOKIES` | 30m | R8 |
| Pin `next-auth` exact version in `package.json` | 15m | R3 |
| Add `export default db` to `db.ts` | 15m | R5 |
| Verify `.env.example` or documentation covers all required env vars | 2h | R6 |
| Migrate 4 import routes from deprecated `simpleHash` to `hashPasswordSync` | 4h | R9 |

**Deliverable:** Zero credential files on disk. All auth cookie handling centralized. No deprecated hash usage.

---

## Sprint 1: Foundation Stabilization (5 days)

**Goal:** Create the abstractions needed for safe refactoring of the God module.

| Task | Effort | Ref |
|---|---|---|
| Write integration tests for `generateQuestions()` with mocked LLM | 1.5d | R12 |
| Write integration tests for `analyzeAnswer()` with mocked LLM | 1d | R12 |
| Write integration tests for `analyzeWriting()` with mocked LLM | 1d | R12 |
| Add golden fixture snapshot tests for AI JSON parsing | 0.5d | R12 |
| Standardize all `process.env` access through `config.ts` | 1d | R6 |
| Add missing env vars to `config.ts`: `dseRagEnabled`, `cron.secret` | 0.5d | R6 |
| Fix duplicate type definitions in `types.ts` | 2h | R7 |
| Align `NotificationType` between `types.ts` and `notifications.ts` | 1h | R7 |
| Add `toDateKey()` helper to `utils.ts` | 0.5h | §2.3 |
| Add `escapeHtml()` helper to `utils.ts` | 0.5h | §2.4 |

**Deliverable:** AI core functions have test coverage. Config is centralized. Types are consistent. Utility deduplication complete.

---

## Sprint 2: AI Module Decomposition — Providers (5 days)

**Goal:** Extract LLM provider implementations from the God module.

| Task | Effort | Ref |
|---|---|---|
| Extract `callDeepSeek()` → `src/lib/ai/providers/deepseek.ts` | 1d | §1.1 |
| Extract `callGemini()` → `src/lib/ai/providers/gemini.ts` | 1d | §1.1 |
| Extract `callGeminiViaVertex()` → `src/lib/ai/providers/vertex.ts` | 1d | §1.1 |
| Extract `callLLM()` + fallback chain → `src/lib/ai/orchestrator.ts` | 1d | §1.1 |
| Create `src/lib/ai/index.ts` barrel file | 0.5d | §4.1 |
| Update all consumers to import from new modules | 0.5d | §1.1 |
| Keep backward-compatible re-exports from `ai-service.ts` during transition | — | §1.1 |

**Deliverable:** Provider layer is modular. Each LLM provider can be tested, monitored, and modified independently. `ai-service.ts` reduced by ~400 lines.

---

## Sprint 3: AI Module Decomposition — Domain Features (6 days)

**Goal:** Extract domain-specific AI operations from the God module.

| Task | Effort | Ref |
|---|---|---|
| Extract `generateQuestions()` + validation → `ai/question-gen.ts` | 1.5d | §1.1 |
| Extract `analyzeAnswer()` → `ai/answer-analysis.ts` | 0.5d | §1.1 |
| Extract `analyzeWriting()` + CLO → `ai/writing-analysis.ts` | 1d | §1.1 |
| Extract `generateWritingPrompt/Outline/Guide()` → `ai/writing-generation.ts` | 0.5d | §1.1 |
| Extract `generateIntegratedSkills()` + `analyzeIntegratedSkills()` → `ai/integrated-skills.ts` | 1d | §1.1 |
| Extract remaining smaller functions → respective modules | 0.5d | §1.1 |
| Extract JSON utilities → `ai/json-utils.ts` | 0.5d | §1.1 |
| Delete old monolithic `ai-service.ts` | 0.5d | §1.1 |

**Deliverable:** God module eliminated. AI features are independently testable and maintainable. Each module <500 lines.

---

## Sprint 4: Prompt Engineering Cleanup (3 days)

**Goal:** Eliminate prompt duplication and establish single sources of truth.

| Task | Effort | Ref |
|---|---|---|
| Create `src/lib/ai/shared/dse-descriptors.ts` — single source for HKDSE levels | 0.5d | §2.2 |
| Create `src/lib/ai/shared/writing-guides.ts` — PEEL, Show Don't Tell, etc. | 0.5d | §2.2 |
| Update 3 prompt files to import from shared modules (remove inline copies) | 1d | §2.2 |
| Ensure `dse-writing-data.ts` `VOCAB_UPGRADES` is imported, not inlined, in writing prompts | 0.5d | §2.2 |
| Document Chinglish dual-layer architecture (rule-based + AI-based) | 0.5d | §3.5 |

**Deliverable:** All prompt constants have one source of truth. Updating curriculum descriptors requires one file change.

---

## Sprint 5: Data Access Layer — Phase 1 (5 days)

**Goal:** Create repository layer for stable, well-defined domains.

| Task | Effort | Ref |
|---|---|---|
| Create `src/lib/repositories/vocabulary-repo.ts` | 1d | §2.1 |
| Create `src/lib/repositories/mistake-repo.ts` | 0.5d | §2.1 |
| Create `src/lib/repositories/class-repo.ts` | 1d | §2.1 |
| Create `src/lib/repositories/notification-repo.ts` | 0.5d | §2.1 |
| Migrate vocabulary routes to use vocab-repo | 1d | §2.1 |
| Migrate mistake routes to use mistake-repo | 0.5d | §2.1 |
| Add `src/lib/repositories/index.ts` barrel | 0.5d | §2.1 |

**Deliverable:** 4 domain repositories created. Related API routes no longer call Prisma directly.

---

## Sprint 6: Data Access Layer — Phase 2 (5 days)

**Goal:** Complete repository migration for remaining domains.

| Task | Effort | Ref |
|---|---|---|
| Create `src/lib/repositories/user-repo.ts` | 1d | §2.1 |
| Create `src/lib/repositories/assignment-repo.ts` | 1d | §2.1 |
| Create `src/lib/repositories/writing-repo.ts` | 0.5d | §2.1 |
| Migrate remaining API routes to repositories | 1.5d | §2.1 |
| Add query caching in repositories where beneficial | 1d | §2.1 |

**Deliverable:** Complete repository layer. Zero direct Prisma calls from route handlers. Standardized data access patterns.

---

## Sprint 7: Route Cleanup & Quality (4 days)

**Goal:** Extract business logic from route files and eliminate remaining duplication.

| Task | Effort | Ref |
|---|---|---|
| Extract `daily-challenge-service.ts` from route | 1d | §3.3 |
| Extract `grammar-diagnostic.ts` from route | 0.5d | §3.3 |
| Extract `csv-utils.ts` for shared CSV logic | 0.5d | §3.3 |
| Replace all `toISOString().slice(0,10)` with `toDateKey()` | 0.5d | §2.3 |
| Replace all HTML entity escape chains with `escapeHtml()` | 0.5d | §2.4 |
| Route `rag-service.ts` embeddings through shared AI error handling | 0.5d | R11 |
| Add idempotency to Google Sheets sync | 0.5d | R15 |

**Deliverable:** All route files are thin wrappers. All business logic in `lib/`. No duplicated utility code.

---

## Sprint 8: Test Coverage Expansion (Ongoing)

**Goal:** Establish comprehensive test coverage across all domains.

| Task | Effort |
|---|---|
| Add auth integration tests (login, JWT, NextAuth, role switching) | 2d |
| Add notification unit tests | 0.5d |
| Add streak-service unit tests | 0.5d |
| Add plagiarism detection unit tests | 0.5d |
| Add chinglish detection unit tests | 0.5d |
| Add rag-service tests (mocked embeddings) | 1d |
| Expand e2e test coverage for critical user journeys | 2d |
| Add CI pipeline with test coverage thresholds | 1d |

---

## Sprint Timeline Overview

```
Week 1:  Sprint 0.5 ── Security Hardening
Week 1:  Sprint 1   ── Foundation Stabilization
Week 2:  Sprint 2   ── AI Providers Decomposition
Week 2-3: Sprint 3 ── AI Domain Decomposition
Week 3:  Sprint 4   ── Prompt Engineering Cleanup
Week 4:  Sprint 5   ── Data Access Layer Phase 1
Week 4-5: Sprint 6 ── Data Access Layer Phase 2
Week 5:  Sprint 7   ── Route Cleanup
Week 6+: Sprint 8   ── Test Coverage (ongoing)
```

**Total: ~6 weeks for full architectural remediation.**

---

## Parallelization Opportunities

| Sprints | Can Run In Parallel? | Notes |
|---|---|---|
| 0.5 + 1 | ✅ Yes | Different areas (security vs. testing) |
| 2 + 5 | ✅ Yes | AI refactor vs. repository creation — different files |
| 3 + 4 | ⚠️ Sequential | Sprint 3 must complete before Sprint 4 (prompt cleanup depends on new module structure) |
| 5 + 7 | ⚠️ Partial | Route cleanup can start after repo migration for specific domains |
| 8 | ✅ Parallel | Can run alongside any sprint |

---

## Success Metrics

After completing all sprints, the codebase should achieve:

| Metric | Current | Target |
|---|---|---|
| Largest file in `src/lib/` | ~3,700 lines | ≤ 800 lines |
| Files >300 LOC | 6 | ≤ 2 (i18n dictionary only) |
| Direct Prisma calls from routes | 56 files | 0 files |
| Prompt duplication instances | 5 | 0 |
| `process.env` accesses outside `config.ts`/`db.ts`/`logger.ts` | ~50 | 0 |
| Unit test coverage (critical paths) | ~15% | ≥ 60% |
| Cyclic dependencies | 0 | 0 ✅ |
| Config entries missing from `config.ts` | 5 | 0 |
