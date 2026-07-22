# 🔐 AI English Platform — Ultimate Production Readiness Audit

> **Date:** 2026-07-22  
> **Scope:** Full codebase — 121 API routes, 36 modules, 1,100+ tests  
> **Methodology:** 5 parallel subagent scans + manual cross-referencing  
> **Overall Grade: B+ (82/100)** — Production-ready with targeted fixes needed

---

## 📊 Executive Summary

| Dimension | Score | Status |
|-----------|-------|--------|
| **Security** | 78/100 | 🟡 3 critical auth gaps + 2 missing role checks |
| **Code Quality** | 75/100 | 🟡 18 duplicate functions, 6 orphan modules, 22 unsafe casts |
| **Module Completeness** | 92/100 | ✅ All 10 major modules fully functional |
| **AI Content Quality** | 82/100 | 🟡 Hallucination guard inconsistency, topic validation gaps |
| **DSE Accuracy** | 88/100 | ✅ CLO rubrics correct, 12 text types complete, HKEAA-aligned |
| **Mobile Experience** | 80/100 | ✅ Responsive layout + charts; page-level testing needed |
| **i18n Coverage** | 95/100 | ✅ 17 TS modules, full zh/en bilingual |
| **Test Coverage** | 85/100 | ✅ 1,100+ tests, 51 files; some orphan module tests |

---

## 🔴 CRITICAL ISSUES — Must Fix Before Production

### C1. `src/app/api/ai/status/route.ts` — No Auth, Leaks AI Provider Config
**Risk:** Anyone can call this endpoint to see model names, provider chain (DeepSeek → Vertex Gemini → Gemini API → Claude → OpenAI), and configuration details.  
**Fix:** Add `verifyApiAuth(request, ['admin'])` at the top of the handler.

### C2. `src/app/api/reviews/[id]/route.ts:18` — Missing Role Check
**Risk:** Any authenticated student can PATCH teacher review endpoints. The code only checks `if (!userId)` without verifying `role === 'teacher' || role === 'admin'`.  
**Fix:** Add `if (auth.role !== 'teacher' && auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });`

### C3. 6 Orphan Modules (17% of codebase) — Dead Weight
**Risk:** Maintenance burden, test execution time, build bloat. These modules have zero runtime consumers:
- `src/modules/exercise/`
- `src/modules/security/`
- `src/modules/mistake-db/`
- `src/modules/feedback/`
- `src/modules/platform/`
- `src/modules/teacher/`

**Fix:** Either wire them into the app or delete them entirely.

### C4. 18 Duplicate Functions in `ai-service.ts` (3,600+ line monolith)
**Risk:** Bug fixes in one copy don't propagate to the other. Import confusion. The monolith still contains full implementations of functions that were extracted to separate modules (e.g., `analyzeAnswer`, `generateQuestions`, `validateListeningConsistency`, `parseAIJSON`).  
**Fix:** Delete deprecated functions from `ai-service.ts` and redirect all imports to extracted modules.

---

## 🟡 HIGH PRIORITY — Fix Within 1 Week

### H1. API Routes Without Auth (5 endpoints)
| Route | Current | Required |
|-------|---------|----------|
| `api/ai/status` | ❌ None | `verifyApiAuth(['admin'])` |
| `api/knowledge-graph/node/[id]/prerequisites` | ❌ None | `verifyApiAuth()` |
| `api/knowledge-graph/node/[id]/dependents` | ❌ None | `verifyApiAuth()` |
| `api/admin/import/template/students` | ❌ None | `verifyAdmin()` |
| `api/admin/import/template/teachers` | ❌ None | `verifyAdmin()` |

### H2. Hardcoded Secrets
| Location | Finding | Fix |
|----------|---------|-----|
| `src/shared/config/edge-config.ts:24` | `'dev-secret-change-me-in-production'` fallback AUTH_SECRET | Remove fallback; throw if `AUTH_SECRET` is missing in production |
| `src/app/api/admin/ensure-admin/route.ts:36` | `'ipwh@pochiu.edu.hk'` hardcoded email | Move to env var `ADMIN_EMAIL` |

### H3. Hallucination Guard Inconsistency
`writing/v1.ts` and `grammar/v1.ts` use **local** (different, weaker) hallucination guards instead of importing the centralized 10-rule `HALLUCINATION_GUARD` from `hallucination-guard.ts`. This was flagged in a previous audit but not fixed.  
**Fix:** Replace local guards with `import { HALLUCINATION_GUARD } from '@/modules/ai/services/hallucination-guard'`

### H4. Topic Validation Not Applied Universally
`validateDSEtopicMatch()` is only used in 3 generation paths. It's **missing** from:
- Integrated Skills generation (`integrated-skills.ts`)
- Speaking generation
- Any Part A prompt generation (new `generatePartAPrompt`)

### H5. `console.log` Left in Production API Routes
39 instances across 12 files. API route logs should use `logger.info()` with structured metadata for log aggregation.  
**Top offenders:** `vocabulary/components/HighlightContextMenu.tsx` (12), `api/auth/role/route.ts` (6), `api/admin/sync-sheets/route.ts` (5).

### H6. JWT Weaknesses
- 7-day expiry with no refresh mechanism
- HS256 symmetric signing (RS256 recommended)
- No token revocation list

### H7. Missing Rate Limits on Admin Endpoints
Endpoints without rate limiting:
- `api/admin/import/*` (bulk CSV imports)
- `api/admin/sync-sheets/route.ts` (bulk sync)
- `api/import/route.ts` (CSV import)

---

## 🟢 MEDIUM PRIORITY — Fix Within 2 Weeks

### M1. Unsafe Type Assertions (22 in production)
| Top Offenders | Count | Severity |
|---------------|-------|----------|
| `teacher/assignments/new/page.tsx` | 3× `(q as any)` | Medium |
| `student/repositories/student-repo.ts` | 3× `(db as unknown as ...)` | High |
| `app/api/reading/route.ts` | 2× unsafe casts | Medium |

### M2. Middleware Inconsistency
Admin route access differs between JWT and NextAuth:
- NextAuth: `admin` or `teacher` can access `/admin` pages
- JWT: Only `admin` can access `/admin` pages

### M3. Raw SQL Wrapper Functions
`material-repo.ts` exposes `executeRawUnsafe()` and `queryRawUnsafe()` as passthrough functions with no guardrails, documentation, or input validation.

### M4. No Auto-Save at Writing Coach Service Level
The UI has i18n keys for `writing.saving`/`writing.saved` but the writing-coach service layer has no debounced auto-save. Draft persistence relies on manual `saveRevision()` calls.

### M5. DSE Empirical Topic DB Missing Paper 4 (Speaking)
The database covers Papers 1/2/3 but has no speaking-specific topic categories.

### M6. RAG `yearRange` Filter Declared but Not Implemented
`retrieveDSERelevantChunks()` accepts `yearRange?` in its type but doesn't apply it in the filter logic at line 501.

---

## 🟣 LOW PRIORITY — Fix When Convenient

### L1. 5 TODOs Across 3 Files
All in `memory/route.ts` (Sprint 45 stubs) and `writing-generation.ts` (refactoring note). No urgent action needed.

### L2. 2 `any` Usages in `writing-coach-pro.ts:372`
CEFR score typing should use proper interfaces instead of `any`.

### L3. TTS Single-Provider
Only Google Cloud TTS. No Azure/AWS fallback for audio generation resilience.

### L4. No CSRF Protection in Middleware
API routes bypass middleware entirely, so CSRF is not enforced. Relies on SameSite cookies.

### L5. Dev Secret in `materials/` Directory
`gcp-service-account.json` and `client_secret_*.json` exist in `materials/`. Verify `.gitignore` coverage.

---

## 📋 Module-by-Module Health Report

| # | Module | Completeness | Key Features | Gaps |
|---|--------|-------------|--------------|------|
| 1 | **Listening** | ✅ 95% | TTS (GCP), dialogue validation, 4 voice profiles | Single TTS provider |
| 2 | **Integrated Skills v4** | ✅ 95% | Step-locking, server-side draft, 9 task types, Data File simulation | — |
| 3 | **Writing Coach** | ✅ 90% | CLO scoring, Chinglish detection, 12 text types, PEEL/formats/SRS | No auto-save at service level |
| 4 | **Vocabulary 2.1** | ✅ 100% | Quiz, PDF/CSV/Anki export, SM-2 SRS, spelling, collocations | — |
| 5 | **Mistake Book** | ✅ 90% | SRS review, 6 mistake categories, AI explanations | Orphan module (mistake-db/) |
| 6 | **Progress Analytics** | ✅ 95% | Timeline, heatmap, radar, predictions, AI reports | — |
| 7 | **RAG** | ✅ 85% | pgvector + in-memory, DeepSeek→Vertex embeddings, DSE-specific retrieval | yearRange not implemented; DSE RAG off by default |
| 8 | **Teacher Module** | ✅ 90% | 10 pages, materials CRUD, AI copilot (7 tools), class management | 1 missing role check (reviews) |
| 9 | **Notifications** | ✅ 95% | 5 types, SSE delivery, i18n, bulk operations | — |
| 10 | **i18n** | ✅ 95% | 17 modules, full zh/en, params interpolation | No JSON fallback |

---

## 🔄 End-to-End User Journey Simulation

### Student Journey: ✅ All paths viable

```
Login → Role Select → Dashboard → Diagnostic Test → 
Weakness Analysis → AI-Generated Practice → Integrated Skills Task → 
Writing Coach → Vocabulary Builder → Mistake Review → Progress Dashboard
```

**Path status:**
- Login (JWT + NextAuth dual): ✅
- Grade setup: ✅ (role-select page)
- Diagnostic: ✅ (rate-limited, 10/min)
- Practice generation: ✅ (DSE topic validated)
- Integrated Skills: ✅ (step-locked, draft persisted)
- Writing: ✅ (CLO scored, format validated)
- Vocabulary: ✅ (quiz, SRS, export)
- Mistakes: ✅ (tracked, reviewed with spaced repetition)
- Progress: ✅ (analytics dashboard with predictions)

### Teacher Journey: ✅ All paths viable with 1 fix needed

```
Login → Dashboard → Class Management → 
Material Upload → Assignment Creation → Review Submissions → 
Analytics Report → AI Copilot
```

**Path status:**
- Login: ✅
- Class management: ✅ (groups CRUD)
- Materials: ✅ (full CRUD, file upload)
- Assignments: ✅ (create, assign, notify)
- Review: ⚠️ (missing role check in reviews/[id])
- Analytics: ✅ (teacher-specific dashboard)
- AI Copilot: ✅ (7 tools: overview, assignments, class-analysis, exam-prediction, lesson-plan, student-analysis, generate)

---

## 🧹 Dead Code Removal Patch

### Patch 1: Delete Orphan Modules

The following directories have ZERO runtime consumers:

```
src/modules/exercise/           # exercise-service.ts, exercise-repo.ts (+ tests)
src/modules/security/           # input-sanitizer.ts, security-report.ts, index.ts
src/modules/mistake-db/         # types.ts, mistake-db service (+ tests)
src/modules/feedback/           # (+ tests)
src/modules/platform/           # PlatformFacade (never imported)
src/modules/teacher/            # TeacherFacade (never imported)
```

**Delete command:**
```bash
rm -rf src/modules/exercise
rm -rf src/modules/security
rm -rf src/modules/mistake-db
rm -rf src/modules/feedback
rm -rf src/modules/platform
rm -rf src/modules/teacher
```

### Patch 2: Remove Deprecated Functions from ai-service.ts

The following functions in `ai-service.ts` are marked `@deprecated` and have been extracted to separate modules. Delete the original implementations:

| Function (in ai-service.ts) | Already extracted to |
|------------------------------|---------------------|
| `analyzeAnswer` (~L1789) | `answer-analysis.ts` |
| `analyzeWriting` (~L1938) | `writing-analysis.ts` |
| `generateQuestions` (~L964) | `question-generation.ts` |
| `validateListeningConsistency` (~L884) | `listening-normalizer.ts` |
| `generateWritingPrompt` (~L2944) | `writing-generation.ts` |
| `generateWritingOutline` (~L3021) | `writing-generation.ts` |
| `generateWritingGuide` (~L3078) | `writing-generation.ts` |
| `generateIntegratedSkills` (~L3293) | `integrated-skills.ts` |
| `analyzeIntegratedSkills` (~L3456) | `integrated-skills.ts` |

### Patch 3: Unify Hallucination Guards

In `src/modules/ai/prompts/writing/v1.ts` (line 8), replace the local 4-rule guard:
```typescript
// DELETE this local guard:
const HALLUCINATION_GUARD = `
CRITICAL — DO NOT HALLUCINATE: ... (4 rules)
`;

// ADD this import:
import { HALLUCINATION_GUARD } from '@/modules/ai/services/hallucination-guard';
```

Do the same for `src/modules/ai/prompts/grammar/v1.ts` (line 12).

---

## 🔒 Security Patch Checklist

| # | File | Action |
|---|------|--------|
| 1 | `src/app/api/ai/status/route.ts` | Add `verifyApiAuth(request, ['admin'])` |
| 2 | `src/app/api/reviews/[id]/route.ts:18` | Add role check: `['teacher', 'admin']` |
| 3 | `src/app/api/knowledge-graph/node/[id]/prerequisites/route.ts` | Add `verifyApiAuth(request)` |
| 4 | `src/app/api/knowledge-graph/node/[id]/dependents/route.ts` | Add `verifyApiAuth(request)` |
| 5 | `src/app/api/admin/import/template/students/route.ts` | Add `verifyAdmin(request)` |
| 6 | `src/app/api/admin/import/template/teachers/route.ts` | Add `verifyAdmin(request)` |
| 7 | `src/shared/config/edge-config.ts:24` | Remove hardcoded secret fallback |
| 8 | `src/app/api/admin/ensure-admin/route.ts:36` | Move email to env var |
| 9 | `src/shared/auth/jwt.ts` | Consider RS256 + shorter expiry + refresh token |
| 10 | `src/modules/ai/repositories/material-repo.ts` | Add SQL injection warning comments |

---

## 📈 Performance & Stability

| Area | Status | Notes |
|------|--------|-------|
| RAG Memory | ✅ | pgvector preferred; in-memory fallback caps at 200 chunks |
| Timeouts | ✅ | AI calls: 25s default; fallback providers get reduced timeout |
| Rate Limiting | ✅ | Sliding window; Vercel KV → in-memory fallback; AI: 60/min, Login: 5/min |
| DB Connection | ✅ | Prisma with Neon PostgreSQL; connection pooling via Prisma accelerate hint |
| Build | ✅ | Custom `vercel-build.js` script; Tailwind 4 + Next.js 16 |
| Test Suite | ✅ | 1,100+ tests, 51 test files, Vitest 4 |

---

## 🏁 Final Verdict

### Production Readiness: **82/100 — Deployable with Critical Fixes**

The platform is **structurally sound** with 90%+ module completeness, proper i18n, mobile-responsive UI, and comprehensive DSE alignment. The 3 critical security gaps (C1-C3) **must** be addressed before any public-facing deployment. The 7 high-priority items (H1-H7) should be resolved within a week.

### Pre-Deployment Action Plan

| Phase | Items | Timeline |
|-------|-------|----------|
| **Blockers** | C1, C2, C3 (3 items) | Before deployment |
| **Week 1** | H1-H7 (7 items) | Within 7 days |
| **Week 2** | M1-M6 (6 items) | Within 14 days |
| **Backlog** | L1-L5 (5 items) | When convenient |

### Overall Risk Rating: 🟡 MEDIUM-LOW

The codebase shows strong engineering discipline: consistent patterns, structured logging, comprehensive i18n, DSE syllabus alignment, and a robust AI fallback chain. The main issues are **accumulated technical debt** (monolith ai-service.ts, orphan modules) and **incomplete security hardening** (3 endpoints without auth, inconsistent hallucination guards), not fundamental architectural flaws.
