# 🔧 Refactoring Plan — AI English Platform
## Sprint 0: Architecture Analysis
**Date:** 2026-07-18

---

## Priority Legend

| Icon | Priority | Criteria |
|---|---|---|
| 🔴 | **P0 — Critical** | Production risk, data loss, security, or blocks other work |
| 🟠 | **P1 — High** | Significant tech debt, developer productivity impact |
| 🟡 | **P2 — Medium** | Code quality, maintainability |
| 🟢 | **P3 — Low** | Nice-to-have, cosmetic |

---

## 1. P0 — Critical Refactorings

### 1.1 🔴 Split `ai-service.ts` God Module (~3,700 lines → ~10 modules)

**Current state:** One file contains all AI operations: 3 provider implementations, fallback orchestration, question generation, MCQ normalization, listening validation, answer analysis, writing analysis, mistake explanation, word analysis, progress analysis, study help, material analysis, writing outline/guide generation, integrated skills generation/analysis, JSON repair utilities, and retry engine.

**Target structure:**
```
src/lib/ai/
├── providers/
│   ├── deepseek.ts         (~200 lines — callDeepSeek)
│   ├── gemini.ts           (~200 lines — callGemini)
│   └── vertex.ts           (~200 lines — callGeminiViaVertex)
├── orchestrator.ts          (~250 lines — callLLM, fallback chain, caching, logging)
├── question-gen.ts          (~800 lines — generateQuestions, validateAndFixQuestion, normalizeXxx)
├── answer-analysis.ts       (~200 lines — analyzeAnswer)
├── writing-analysis.ts      (~600 lines — analyzeWriting, CLO scoring)
├── mistake-explanation.ts   (~80 lines — explainMistake)
├── word-analysis.ts         (~80 lines — analyzeWord)
├── progress-analysis.ts     (~100 lines — analyzeProgress)
├── study-help.ts            (~120 lines — answerStudyHelp)
├── material-analysis.ts     (~100 lines — analyzeMaterial)
├── writing-generation.ts    (~350 lines — generateWritingPrompt/Outline/Guide)
├── integrated-skills.ts     (~350 lines — generateIntegratedSkills, analyzeIntegratedSkills)
├── json-utils.ts            (~80 lines — repairTruncatedJSON, parseAIJSON)
├── types.ts                 (existing — re-export all AI types)
├── index.ts                 (barrel re-export)
├── prompts/                 (existing — 10 files, unchanged)
├── dse-topics.ts            (existing)
├── dse-writing-data.ts      (existing)
├── mcq-filters.ts           (existing)
├── sanitizer.ts             (existing)
├── topic-selector.ts        (existing)
└── integrated-skills-config.ts (existing)
```

**Risk:** High (touches every AI feature). Mitigation: extract one provider/file at a time, keep old re-exports from `ai-service.ts` during transition.

### 1.2 🔴 Add `export default db` to `db.ts`

**Problem:** `db.ts` exports `db` as named export only, but 5 library files (`auth.ts`, `auth-next.ts`, `rag-service.ts`, `notifications.ts`, `streak-service.ts`) use default import syntax. This relies on `esModuleInterop` behavior and could break in strict ESM.

**Fix:**
```typescript
// In db.ts, add:
export default db;
```
**OR** convert the 5 consumers to `import { db } from '@/lib/db'`.

**Risk:** Very low. Adding a default export is backward-compatible.

---

## 2. P1 — High Priority Refactorings

### 2.1 🟠 Extract Data Access Layer (Repository Pattern)

**Current state:** 63 files call Prisma directly. No abstraction between routes and database.

**Recommended approach:** Domain-based repository modules:

```
src/lib/repositories/
├── user-repo.ts
├── class-repo.ts
├── assignment-repo.ts
├── vocabulary-repo.ts
├── writing-repo.ts
├── mistake-repo.ts
├── notification-repo.ts
└── index.ts
```

**Phase 1** (low risk): Create repositories for stable, well-defined domains (vocabulary, mistakes, classes).
**Phase 2**: Migrate remaining domains.
**Phase 3**: Add caching/optimization layers in repositories.

**Risk:** Medium. Incremental migration is safe; routes keep working during transition.

### 2.2 🟠 Consolidate Duplicated Prompts

**Problem:** HKDSE Level Descriptors duplicated in `explain-mistake.ts`, `progress-analysis.ts`, and `integrated-skills-analysis.ts`. Vocabulary upgrade pairs duplicated in `writing-clo-grammar.ts` and `writing-clo-style.ts`. PEEL/Show-Don't-Tell techniques duplicated.

**Fix:**
1. Create `src/lib/ai/shared/dse-descriptors.ts` — single source of truth for HKDSE level descriptors
2. Create `src/lib/ai/shared/writing-guides.ts` — extract PEEL, Show Don't Tell, etc.
3. Update existing prompts to import from shared modules
4. `dse-writing-data.ts` already has `VOCAB_UPGRADES` — prompts should `import` not inline

### 2.3 🟠 Deduplicate Business Logic: Date Formatting

**Problem:** `toISOString().slice(0, 10)` used **13+ times** across 7 files.

**Fix:** Add to `utils.ts`:
```typescript
export function toDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
```
Replace all occurrences.

### 2.4 🟠 Deduplicate Business Logic: HTML Entity Escaping

**Problem:** Identical 4-chained `.replace()` for HTML entities duplicated in `tts-service.ts` and `vocabulary/export-pdf/route.ts`.

**Fix:** Add `escapeHtml(str: string): string` to `utils.ts`.

---

## 3. P2 — Medium Priority Refactorings

### 3.1 🟡 Fix Inconsistent Cookie Name References

**Files:** `auth/logout/route.ts`, `auth-next.ts` — hardcode cookie names instead of using `auth-cookies.ts` constants.

**Fix:** Replace hardcoded strings with `ALL_CLEARABLE_COOKIE_NAMES` and `AUTHJS_SESSION_COOKIES`.

### 3.2 🟡 Fix Duplicate Type Definitions in `types.ts`

**Problem:** `Familiarity`, `MasteryLevel`, and `VocabItem` defined twice. `NotificationType` inconsistent with `notifications.ts`.

**Fix:** Remove duplicates. Align `NotificationType` to include all values from both files (add `'curriculum-update'` to `notifications.ts` or remove from `types.ts`).

### 3.3 🟡 Extract Business Logic from Route Files

| Route | Logic to Extract | Destination |
|---|---|---|
| `api/daily-challenge/route.ts` | `DAILY_TOPICS` array, `getDailySeed()`, question rotation | `lib/daily-challenge-service.ts` |
| `api/diagnostic/grammar/route.ts` | `GRAMMAR_POINTS` array, grammar→diagnostic mapping | `lib/grammar-diagnostic.ts` |
| `api/admin/export/stream/students/route.ts` | CSV sanitization, quoting | `lib/csv-utils.ts` |

### 3.4 🟡 Standardize `process.env` Access Through `config.ts`

**Files to update:** `ai-cache.ts`, `ai-service.ts`, `auth-next.ts`, `jwt.ts`, `rag-service.ts`

**Add to `config.ts`:**
- `config.ai.cacheEnabled` / `config.ai.cacheTTLMs` (already defined but unused)
- `config.rag.dseRagEnabled`
- `config.cron.secret`
- `config.auth.nextAuthSecret`

### 3.5 🟡 Resolve Chinglish Dual Detection

**Problem:** Chinglish patterns detected by BOTH rule-based regex (`chinglish.ts`) and AI prompt (`writing-clo-grammar.ts`). Two mechanisms may produce inconsistent results.

**Recommendation:** Keep rule-based for fast pre-check. AI-based for contextual/nuanced detection. Document the dual-layer architecture clearly. Ensure `chinglish-rules.json` and the AI prompt checklist stay synchronized.

### 3.6 🟡 Migrate `simpleHash` → `hashPasswordSync`

**Affected files:** 4 import route files still use deprecated `simpleHash`.
**Deadline:** 2026-09-01 (from code comments).

---

## 4. P3 — Low Priority Improvements

### 4.1 🟢 Add Barrel `index.ts` Files

```
src/lib/index.ts           → re-export all lib/ modules
src/lib/ai/index.ts        → re-export all ai/ modules
src/lib/ai/prompts/index.ts → re-export all prompts
```

### 4.2 🟢 Consolidate PDF/Word Libraries

Currently using: `pdf-parse`, `pdfkit`, `jspdf`, `docx`, `mammoth`, `sharp`.
Consider: `pdfkit` OR `jspdf` (not both), `docx` OR `mammoth` (not both).

### 4.3 🟢 Add Memory Bounds to `topic-selector.ts` Global Map

The `Map`-based topic blacklist in `topic-selector.ts` could grow unbounded in long-running serverless functions. Add a size cap or periodic cleanup.

### 4.4 🟢 Increase Test Coverage

**Current:** 7 unit test files covering: `ai-service` (JSON parsing, schemas), `answer-consistency`, `gamification`, `i18n`, `rate-limiter`, `srs`, `vocabulary`.

**Missing coverage:** `ai-service` core functions (`generateQuestions`, `analyzeAnswer`, `analyzeWriting`), `auth` (login flow), `notifications`, `streak-service`, `rag-service`, `plagiarism`, `chinglish`.

---

## 5. Estimated Effort

| # | Refactoring | Est. Effort | Risk |
|---|---|---|---|
| 1.1 | Split `ai-service.ts` | **5-8 days** | 🔴 High |
| 1.2 | Add default export to `db.ts` | **15 minutes** | 🟢 Low |
| 2.1 | Repository pattern (phased) | **8-12 days** | 🟡 Medium |
| 2.2 | Consolidate duplicated prompts | **2-3 days** | 🟢 Low |
| 2.3 | Deduplicate date formatting | **1 day** | 🟢 Low |
| 2.4 | Deduplicate HTML escaping | **30 minutes** | 🟢 Low |
| 3.1 | Fix cookie references | **1 hour** | 🟢 Low |
| 3.2 | Fix duplicate types | **2 hours** | 🟢 Low |
| 3.3 | Extract route business logic | **2-3 days** | 🟡 Medium |
| 3.4 | Standardize config access | **1-2 days** | 🟡 Medium |
| 3.5 | Document Chinglish dual-layer | **2 hours** | 🟢 Low |
| 3.6 | Migrate simpleHash | **1 day** | 🟢 Low |
| 4.1 | Add barrel files | **1 hour** | 🟢 Low |
| 4.2 | Consolidate PDF/Word libs | **1-2 days** | 🟡 Medium |
| 4.3 | Memory bounds on topic selector | **30 minutes** | 🟢 Low |
| 4.4 | Increase test coverage | **Ongoing** | 🟢 Low |

**Total estimated effort:** ~25-35 person-days for all items.
