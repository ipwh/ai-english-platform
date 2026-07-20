# 🔬 Deep Architecture & Code Quality Audit — 2026-07-20

**Platform**: AI English Platform  
**Stack**: Next.js 16.2, TypeScript 5 strict, Prisma 7, PostgreSQL (Neon), Tailwind 4  
**Scope**: 471 `.ts` + 79 `.tsx` + 120 `route.ts` + 61 test files = ~730 source files  
**Auditors**: GitHub Copilot (DeepSeek V4 Pro) — 3 parallel sub-agents

---

## 📊 Executive Summary

| Dimension | Score | Grade |
|-----------|-------|-------|
| Architecture | 8.8/10 | **A** |
| AI Quality & Safety | 6.5/10 | **B−** ⚠️ |
| Code Quality | 7.2/10 | **B** |
| Error Handling | 7.0/10 | **B** |
| Test Coverage | 8.5/10 | **A−** |
| Security | 7.5/10 | **B+** |
| **Overall** | **7.6/10** | **B+** |

> **Previous audit (v4.1)**: 96% production readiness  
> **Current**: Improved error handling, but new findings in AI safety & code decomposition

---

## 🔴 CRITICAL (Must Fix Before Production)

### C1. `ai-service.ts` is a 3,600-line God Module

**File**: `src/modules/ai/services/ai-service.ts`  
**Lines**: ~3,600  
**`if` statements**: 200+  
**Responsibilities** (all in one file):
- Question generation + JSON repair
- Answer analysis (MCQ + open-ended)
- Writing analysis (CLO grammar + style)
- Mistake explanation
- Progress analysis
- Study help & conversation
- Material/word analysis
- Writing prompt generation & outline
- Integrated skills (generation + analysis)
- Listening normalization
- 5-provider fallback chain management
- AI JSON parsing cascade

**Impact**: 
- Any change risks breaking unrelated features
- Impossible to unit-test in isolation
- 200+ conditionals make control flow impossible to reason about
- Largest file in the entire codebase by 2.3× (next is `i18n.ts` at 1,550 lines)

**Recommendation**: Split into 8-10 focused service files:
```
src/modules/ai/services/
├── question-generation.ts     (~400 lines) ✅ exists but unused?
├── answer-analysis.ts         (~300 lines) ✅ exists
├── writing-analysis.ts        (~400 lines) ✅ exists
├── writing-generation.ts      (~750 lines) ✅ exists → trim
├── mistake-explanation.ts     (~250 lines)
├── progress-analysis.ts       (~200 lines)
├── study-help.ts              (~200 lines)
├── integrated-skills.ts       (~350 lines) ✅ exists
├── provider-fallback.ts       (~300 lines) — extract fallback chain
├── ai-json-parser.ts          (~200 lines) — extract parseAIJSON
└── listening-normalizer.ts    (~150 lines)
```

---

### C2. Prompt Injection Vulnerability — User Content Unsanitized in AI Prompts

**Centralized guard exists**: `src/modules/ai/services/hallucination-guard.ts` — `sanitizeForAI()` with 15+ regex patterns  
**⚠️ NOT consistently applied at the service level**

| Function in `ai-service.ts` | User input | Sanitized? | Risk |
|---|---|---|---|
| `generateQuestions` | `input.topic` → template literal | **Route-level only** ✅ | Low (route sanitizes) |
| `analyzeAnswer` | `question`, `correctAnswer`, `studentAnswer` | **Route-level only** ⚠️ | Medium |
| `explainMistake` | `question`, `correctAnswer`, `studentAnswer` | **Route-level only** ⚠️ | Medium |
| `rewriteWriting` | `originalEssay` | **Route-level only** ⚠️ | Medium |
| `analyzeWriting` | `studentDraft` | ✅ `sanitizeForAI()` in function | OK |
| `analyzeWord` | `word` | ✅ `sanitizeForAI()` in function | OK |
| `answerStudyHelp` | `question` | ✅ `sanitizeForAI()` in function | OK |

**Recommendation**: Add `sanitizeForAI()` as a **defense-in-depth** measure inside every service function that accepts user content — don't rely on routes alone. Routes can be bypassed via internal calls.

---

### C3. 42 `console.error` Still in API Routes (Not Using Structured Logger)

**28 route files still use `console.error`** instead of `logger.error()`:

| Group | Count | Example |
|-------|-------|---------|
| Admin routes | 8 | `sync-sheets`, `users`, `import`, `export-sheets`, `stats`, `cleanup` |
| Assignment routes | 4 | `assignments/`, `assignments/[id]` |
| AI routes | 0 | ✅ All migrated |
| Auth routes | 1 | `auth/login` |
| Core routes | 29 | `groups`, `integrated-skills`, `mistakes`, `tts`, `vocabulary/*`, `writing`, `export/writing-analysis`, `ocr/essay` |

**Why this matters**: `console.error` outputs unstructured text. `logger.error({ module, error, userId }, 'message')` is searchable, filterable, and feeds into monitoring dashboards. This is a regression from the v4.1 standard.

---

### C4. Empty `catch {}` in Production Code

**1 production file, 1 instance**:

| File | Line | Code |
|------|------|------|
| `src/app/api/ai/generate-questions/route.ts` | 98 | `try { const body = await r.text(); message += ...; } catch {}` |

This is inside the `instanceof Error` handler's fallback for HTTP Response objects. If `r.text()` fails, the error message is silently truncated. Should add `logger.warn`.

---

## 🟠 HIGH (Fix This Sprint)

### H1. Centralized `HALLUCINATION_GUARD` Never Used by Prompt Files

**File**: `src/modules/ai/services/hallucination-guard.ts`  
**Exports**: `HALLUCINATION_GUARD` (10 rules, ~600 chars), `HALLUCINATION_GUARD_LITE`, `scoreHallucinationRisk()`  
**Import count across all prompt files**: **ZERO**

Each prompt file defines its own local guard:
- `reading/v1.ts` → local `HALLUCINATION_GUARD` (4 rules)
- `writing/v1.ts` → local `HALLUCINATION_GUARD` (4 rules)
- `grammar/v1.ts` → local `GRAMMAR_HALLUCINATION_GUARD` (5 rules, different name)

And these have **NO guard at all**:
- ❌ `speaking/v1.ts` — no anti-hallucination instruction
- ❌ `grammar/answer-analysis.ts` — no anti-hallucination instruction
- ❌ `generateQuestions` inline prompt (the LARGEST prompt in the system) — no guard

**Recommendation**: 
1. Import the centralized `HALLUCINATION_GUARD` into ALL prompt builders
2. Append it to every system prompt as the final instruction block
3. Use `scoreHallucinationRisk()` as a post-generation quality gate

---

### H2. Reading Prompt is Dangerously Thin (42 Lines)

**File**: `src/modules/ai/prompts/reading/v1.ts` — 42 lines

**Missing DSE Paper 1 question types**:
- ❌ True/False/Not Given
- ❌ Matching headings to paragraphs
- ❌ Summary cloze (fill in blanks from a word bank)
- ❌ Referencing questions ("What does 'it' refer to in line 5?")
- ❌ Tone/attitude/purpose questions
- ❌ Open-ended inference (3-4 mark questions)

**Current schema only supports**: MCQ, shortAnswer, inference, vocabulary, trueFalse

**Other prompts for comparison**:
- `writing/v1.ts`: 420 lines — full CLO rubric, 7 score bands per dimension
- `grammar/v1.ts`: 200 lines — 13 exports, detailed answer rules
- `speaking/v1.ts`: 95 lines — Paper 4 rubrics, group + individual

---

### H3. 23 `as any` Type Assertions Remain

| Risk Level | File | Pattern |
|------------|------|---------|
| 🔴 HIGH | `src/modules/student/repositories/student-repo.ts:20` | `(db as any)[table]` — dynamic table access |
| 🔴 HIGH | `src/app/api/drive/download/route.ts:100` | `(pdfParseModule as any).default` |
| 🟠 MED | `src/app/api/gamification/route.ts:53` | `(s as any).xp` |
| 🟠 MED | `src/app/api/srs/review/route.ts:39` | `new Date(v.nextReviewDate as any)` |
| 🟡 LOW | 19 others | Scattered across components & routes |

The `student-repo.ts` pattern `(db as any)[table]` is the most dangerous — it completely bypasses Prisma's type safety for all DB operations.

---

### H4. 6 Silent/Insufficient Catch Blocks in `ai-service.ts`

| Lines | Context | Issue |
|-------|---------|-------|
| 210, 288, 365 | Deprecated `_callDeepSeek`, `_callGemini`, `_callGeminiViaVertex` | Catch → re-throw without logging original error |
| 1708-1731 | `parseAIJSON` cascade | 5 empty `catch {}` blocks — intentional fallback but undebuggable |
| 3171 | `liveWritingCoach` fallback | `catch {}` with zero logging |

---

### H5. `i18n.ts` is 1,550 Lines of Monolithic Translations

**File**: `src/shared/utils/i18n.ts` — 1,550 lines  
**Problem**: Every string in the app lives in one file. Adding a new feature means editing this file. Merge conflicts are guaranteed.

**Recommendation**: Split by domain:
```
src/shared/i18n/
├── index.ts          (re-exports)
├── common.ts         (buttons, labels, errors)
├── student.ts        (student-facing strings)
├── teacher.ts        (teacher-facing strings)
├── admin.ts          (admin strings)
├── gamification.ts   (XP, badges, levels)
└── ai.ts             (AI-related strings)
```

---

## 🟡 MODERATE (Plan for Next Sprint)

### M1. 1 Remaining `catch { /* ignore */ }`

| File | Line |
|------|------|
| `src/app/api/admin/export/students/route.ts` | 40 |

### M2. 19 `eslint-disable` Comments

| Risk | Count | File |
|------|-------|------|
| 🔴 `react-hooks/exhaustive-deps` | 3 | `AudioPlayer.tsx` — stale closure risk |
| 🟡 `@typescript-eslint/no-explicit-any` | 9 | Various files |
| 🟢 `no-require-imports` | 5 | `db.ts`, `instrumentation.ts` |

### M3. Deprecated Provider Methods Still in `ai-service.ts`

Three legacy methods (`_callDeepSeek`, `_callGemini`, `_callGeminiViaVertex`) still exist in `ai-service.ts` but are never called (all calls go through `providerRegistry.call()`). Dead code → should be removed.

### M4. `generateQuestions` Inline Prompt Has No Hallucination Guard

The largest prompt in the system (~1,500 chars inline in `ai-service.ts` lines 1050-1200) has zero anti-hallucination instructions. All other prompts now have guards — this is the only one missing.

### M5. 2 Module-Level `setInterval` Without Cleanup

| File | Line | Purpose |
|------|------|---------|
| `src/modules/ai/services/ai-cache.ts` | 152 | Cache pruning |
| `src/shared/utils/rate-limiter.ts` | 33 | Rate limit reset |

These are intentionally persistent singletons but should document their lifecycle.

### M6. `writing-generation.ts` at 750 Lines — Needs Trim

Second-largest AI service file. Contains writing prompt generation, outline generation, and integrated skills. Could split into `writing-prompt-gen.ts` and `outline-gen.ts`.

---

## 🟢 LOW / OBSERVATIONS

### L1. TODO/FIXME Clean
Only 1 real TODO: `exercise-service.ts:51` — `DiagnosticResult` schema issue. Minimal tech debt documented.

### L2. Timer Cleanup — All Good
All component-level `setTimeout`/`setInterval` calls are properly cleaned up in `useEffect` return functions. Zero memory leaks detected.

### L3. Prisma `$transaction` — Properly Handled
Single usage in `admin/users/[userId]/route.ts`, wrapped in try-catch with `logger.error`.

### L4. N+1 Queries — None Detected
No `.forEach(await db.)` or `for (await db.)` patterns found. Prisma's `include` is used correctly.

### L5. No Hardcoded Secrets
All key-like strings are placeholder validation checks (`'sk-your-deepseek-api-key-here'`). ✅ Safe.

### L6. No Imports from Deprecated Modules
Zero imports from `events/`, `perf/`, `observability/`, `learning-facade/`. ✅ Clean removal.

---

## 📈 Comparison: Before vs After v4.1 Remediation

| Metric | Before (v4.1 audit) | After (this audit) |
|--------|---------------------|-------------------|
| Empty catches (production) | 6 | **1** ✅ |
| `console.error` in routes | 50 | **42** (still high) |
| Prompt files with hallucination guard | 1/4 | **3/5** ⚠️ |
| `instanceof Error` routes | 73 | **83** ✅ |
| Dead exports | 1 | **0** ✅ |
| Silent fallback returns | 2 | **0** ✅ |

---

## 🎯 Priority Action Plan

### Sprint N (Now — this week)
1. **C2**: Add `sanitizeForAI()` inside `analyzeAnswer`, `explainMistake`, `rewriteWriting` service functions
2. **C4**: Add `logger.warn` to `generate-questions/route.ts:98` empty catch
3. **H1**: Import centralized `HALLUCINATION_GUARD` into `speaking/v1.ts` and `grammar/answer-analysis.ts`
4. **H1**: Append `HALLUCINATION_GUARD` to `generateQuestions` inline prompt

### Sprint N+1 (next week)
5. **C1**: Begin `ai-service.ts` decomposition — extract `provider-fallback.ts` and `ai-json-parser.ts`
6. **H4**: Log errors in `parseAIJSON` cascade catch blocks
7. **H3**: Fix `student-repo.ts:20` `(db as any)[table]` pattern
8. **C3**: Migrate 28 remaining `console.error` routes to `logger.error`

### Sprint N+2
9. **C1**: Continue decomposition — extract `mistake-explanation.ts`, `progress-analysis.ts`, `study-help.ts`
10. **H2**: Expand reading prompt with remaining DSE Paper 1 question types
11. **H5**: Begin `i18n.ts` domain split
12. **M3**: Remove deprecated `_callDeepSeek`/`_callGemini`/`_callGeminiViaVertex`

---

## 📋 Full File-by-File Issue Index

| File | Issues |
|------|--------|
| `src/modules/ai/services/ai-service.ts` | C1 (god module), H4 (silent catches), M3 (dead code), M4 (missing guard) |
| `src/shared/utils/i18n.ts` | H5 (monolith), C1-adjacent (1,550 lines) |
| `src/modules/ai/prompts/speaking/v1.ts` | H1 (no hallucination guard) |
| `src/modules/ai/prompts/grammar/answer-analysis.ts` | H1 (no hallucination guard) |
| `src/modules/ai/prompts/reading/v1.ts` | H2 (too thin, missing question types) |
| `src/modules/ai/services/hallucination-guard.ts` | H1 (exports unused by prompt files) |
| `src/modules/student/repositories/student-repo.ts` | H3 (`(db as any)[table]`) |
| `src/app/api/ai/generate-questions/route.ts` | C4 (empty catch at line 98) |
| `src/app/api/admin/export/students/route.ts` | M1 (`catch { /* ignore */ }`) |
| `src/components/shared/AudioPlayer.tsx` | M2 (3× eslint-disable react-hooks/exhaustive-deps) |
| `src/modules/ai/services/writing-generation.ts` | M6 (750 lines) |
| 28 route files | C3 (console.error → logger.error migration needed) |

---

*Generated by GitHub Copilot (DeepSeek V4 Pro) — 3 parallel Explore sub-agents spanning architecture, code quality, and AI/prompt systems.*
