# ⚠️ Risk Analysis — AI English Platform
## Sprint 0: Architecture Analysis
**Date:** 2026-07-18

---

## Risk Matrix

| Risk ID | Risk | Likelihood | Impact | Severity | Category |
|---|---|---|---|---|---|
| R1 | God module `ai-service.ts` causes merge conflicts & bugs | High | High | 🔴 Critical | Maintainability |
| R2 | No repository layer — DB schema changes cascade to 60+ files | Medium | High | 🟠 High | Architecture |
| R3 | `next-auth` v5 beta in production auth path | Medium | Critical | 🔴 Critical | Security |
| R4 | Dual auth system (JWT + NextAuth) increases attack surface | Low | High | 🟡 Medium | Security |
| R5 | `esModuleInterop` masking default import of named export | Medium | Medium | 🟡 Medium | Reliability |
| R6 | `process.env` bypassing `config.ts` — env var inconsistency | Medium | Medium | 🟡 Medium | Config |
| R7 | Inconsistent `NotificationType` between files | Low | Medium | 🟢 Low | Data Integrity |
| R8 | Hardcoded cookie names — logout may miss cookies | Low | High | 🟡 Medium | Security |
| R9 | Deprecated `simpleHash` still used in 4 import routes | Low | Medium | 🟡 Medium | Security |
| R10 | Prompt duplication leads to inconsistent AI behavior | Medium | Medium | 🟡 Medium | AI Quality |
| R11 | Direct `fetch()` to DeepSeek embedding in `rag-service.ts` | Low | Medium | 🟢 Low | Consistency |
| R12 | No test coverage for core AI functions | High | High | 🟠 High | Quality |
| R13 | `GCP_SERVICE_ACCOUNT_JSON` in materials/ folder | Low | Critical | 🔴 Critical | Security |
| R14 | `client_secret_*.json` in materials/ folder | Low | Critical | 🔴 Critical | Security |
| R15 | Google Sheets sync cron without idempotency guarantees | Medium | Medium | 🟡 Medium | Data Integrity |
| R16 | `DAILY_CHALLENGE_RATE` limit defined inline, not in rate-limiter | Low | Low | 🟢 Low | Config |
| R17 | Multiple PDF libraries (pdf-parse, pdfkit, jspdf) | Low | Low | 🟢 Low | Bundle Size |

---

## Detailed Risk Analysis

### R1 🔴 God Module `ai-service.ts` (~3,700 lines)

**Description:** A single file contains 14 exported async functions, 3 LLM provider implementations, MCQ normalization, listening validation, retry engine, JSON repair, and all prompt building logic.

**Consequences:**
- Any change to AI behavior risks breaking unrelated features
- Merge conflicts are nearly guaranteed when multiple developers touch AI
- Impossible to unit test individual AI operations in isolation
- Cognitive load for new developers is extreme

**Mitigation:** Split into provider-specific + domain-specific modules (see Refactoring Plan §1.1).

---

### R2 🟠 No Data Access Layer

**Description:** 63 files call Prisma directly. No repository/DAO abstraction exists.

**Consequences:**
- A Prisma schema change (rename field, change relation) requires touching 60+ files
- No centralized place to add caching, logging, or authorization checks on data access
- Difficult to switch databases or add read replicas
- Business logic leaks into API route handlers

**Mitigation:** Phased introduction of domain repositories (see Refactoring Plan §2.1).

---

### R3 🔴 `next-auth` v5 Beta

**Description:** The platform runs `next-auth@5.0.0-beta.x` in production for Google OAuth.

**Consequences:**
- Breaking changes in the stable release could require emergency patches
- Security vulnerabilities in beta software may not receive timely fixes
- API surface may change, requiring migration work

**Mitigation:**
- Pin exact version in `package.json`
- Monitor [next-auth releases](https://github.com/nextauthjs/next-auth/releases)
- Plan migration buffer when v5 stable ships
- Consider if Google OAuth can be handled without next-auth (reduce dependency)

---

### R4 🟡 Dual Auth System

**Description:** JWT-based password auth AND NextAuth v5 OAuth run in parallel. Two separate cookie systems, two token verification paths, two logout mechanisms.

**Consequences:**
- Cookie clearing must handle both token types (currently manual in `logout/route.ts`)
- Increased surface area for auth bugs
- Role switching (`selected_role` cookie) adds complexity

**Mitigation:** Audit synchronization between `auth/logout/route.ts` and `auth-cookies.ts`. Add integration tests covering both auth paths simultaneously.

---

### R5 🟡 `esModuleInterop` Masking Import Mismatch

**Description:** `db.ts` exports `db` as named export only, but 5 library files use `import db from './db'` (default import). Works only because TypeScript's `esModuleInterop: true` papers over it.

**Consequences:** Could fail in strict ESM environments (Vitest with `--experimental-vm-modules`, future Node.js versions, Deno).

**Mitigation:** Add `export default db;` to `db.ts` (backward compatible, zero risk).

---

### R6 🟡 Config Bypass

**Description:** 10+ files bypass the centralized `config.ts` and read `process.env` directly. 5 env vars tracked in `config.ts` are unused by consumers; 5 env vars used by consumers are missing from `config.ts`.

**Consequences:**
- Adding a new environment requires checking both `config.ts` and direct `process.env` reads
- No single place to validate required env vars at startup
- Inconsistent defaults across files

**Mitigation:** Standardize all env access through `config.ts` (see Refactoring Plan §3.4).

---

### R7 🟢 Inconsistent `NotificationType`

**Description:** `types.ts` defines `NotificationType` with 6 values (includes `'curriculum-update'`). `notifications.ts` defines `NotificationType` with 5 values (missing `'curriculum-update'`).

**Consequences:** TypeScript may not catch invalid notification type assignments depending on which import is used.

**Mitigation:** Single source of truth. Add `'curriculum-update'` to `notifications.ts` or document the split.

---

### R8 🟡 Hardcoded Cookie Names in Logout

**Description:** `logout/route.ts` manually lists 5 cookie names to clear, instead of using `ALL_CLEARABLE_COOKIE_NAMES` from `auth-cookies.ts`.

**Consequences:** If a new auth cookie is introduced, logout may not clear it, leaving stale sessions.

**Mitigation:** Replace hardcoded names with `ALL_CLEARABLE_COOKIE_NAMES` (see Refactoring Plan §3.1).

---

### R9 🟡 Deprecated `simpleHash`

**Description:** 4 import route files use deprecated `simpleHash` (SHA-256). The deprecation deadline is 2026-09-01 (~6 weeks away). These generate temporary passwords for bulk-imported users.

**Consequences:** After the deadline, the function may be removed. Bulk import would break.

**Mitigation:** Migrate to `hashPasswordSync` (bcrypt) before the deadline.

---

### R10 🟡 Prompt Duplication

**Description:** HKDSE Level Descriptors appear verbatim in 3 prompt files. Vocabulary upgrade pairs duplicated between 2 prompt files. PEEL techniques duplicated.

**Consequences:** Updating curriculum descriptors requires changes in 3+ files. Risk of inconsistency if only some files are updated. AI behavior may differ between features using different versions of the same descriptor.

**Mitigation:** Extract shared prompt constants (see Refactoring Plan §2.2).

---

### R11 🟢 Direct `fetch()` in `rag-service.ts`

**Description:** `rag-service.ts` makes direct `fetch()` calls to DeepSeek embedding API, bypassing `ai-service.ts`'s centralized error handling, rate limiting, caching, and logging.

**Consequences:** Embedding failures don't go through the standard fallback chain. No cache for embeddings. Separate rate limit tracking.

**Mitigation:** Either route embeddings through `callLLM()` or create a shared `callEmbedding()` function with the same patterns.

---

### R12 🟠 Missing Test Coverage for Core AI

**Description:** 7 unit test suites exist but none cover the core AI functions: `generateQuestions()`, `analyzeAnswer()`, `analyzeWriting()`, `analyzeProgress()`, etc. Only JSON parsing and schema validation are tested.

**Consequences:** AI prompt changes cannot be validated without manual testing. Regression risk is high.

**Mitigation:** Add integration tests with mocked LLM responses. Capture golden fixtures from real AI outputs for snapshot testing.

---

### R13-R14 🔴 Credentials in `materials/` Folder

**Description:** Two sensitive files exist in the `materials/` directory:
- `gcp-service-account.json` — Google Cloud service account key
- `client_secret_694494166764-...apps.googleusercontent.com.json` — Google OAuth client secret

**Consequences:** If these files are committed to Git, credentials are exposed. Even if `.gitignore`d, they exist in the working directory.

**Verification needed:**
- Check `.gitignore` for these patterns
- Verify they are NOT in Git history
- Move to environment variables only (the code already reads from `GCP_SERVICE_ACCOUNT_JSON` env var)
- Delete the files from disk

---

### R15 🟡 Google Sheets Sync Idempotency

**Description:** The admin sync-sheets feature (with cron endpoint) syncs data from Google Sheets. No idempotency key or deduplication mechanism is visible in the codebase.

**Consequences:** Duplicate sync runs could create duplicate records. Cron failures could leave partial state.

**Mitigation:** Add idempotency keys or last-sync-timestamp tracking.

---

### R16-R17 🟢 Minor

- **R16:** `DAILY_CHALLENGE_RATE` defined inline in route instead of `rate-limiter.ts`
- **R17:** Three PDF libraries (pdf-parse for extraction, pdfkit for generation, jspdf for client-side) — may be justified by different use cases but worth auditing

---

## Risk Heat Map

```
Impact
  Critical  │ R13,R14  │    │ R3      │
            │          │    │         │
  High      │    R2    │ R1 │         │
            │   R12    │    │         │
  Medium    │ R5,R6,R8 │ R10│         │
            │ R9,R11   │ R15│         │
  Low       │ R7,R16   │    │         │
            │ R17      │    │         │
            └──────────┴────┴─────────┘
               Low     Medium   High
                    Likelihood
```

---

## Top 5 Actions to Reduce Risk

1. **Immediately verify** `gcp-service-account.json` and `client_secret_*.json` are gitignored and not in history (R13, R14)
2. **Split `ai-service.ts`** before it grows further (R1)
3. **Add repository layer** incrementally to contain schema change blast radius (R2)
4. **Pin next-auth version** and plan migration buffer (R3)
5. **Add AI integration tests** with mocked responses (R12)
