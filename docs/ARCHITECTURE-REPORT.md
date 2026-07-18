# 🏗️ Architecture Report — AI English Platform
## Sprint 0: Architecture Analysis
**Date:** 2026-07-18 | **Auditor:** Principal Software Architect

---

## 1. Executive Summary

The **AI English Platform** is a Next.js 16 (App Router) monolith serving three roles (Student, Teacher, Admin) with AI-powered English learning features aligned to the HKDSE (Hong Kong Diploma of Secondary Education) curriculum. The codebase is ~90+ API routes, ~50 page components, and ~40 library modules. **No cyclical dependencies exist**, but the platform suffers from a **God module** (`ai-service.ts` at ~3,700 lines), **no data-access abstraction layer**, and **moderate prompt/business-logic duplication**.

---

## 2. System Overview

| Dimension | Detail |
|---|---|
| **Framework** | Next.js 16.2.10 (App Router, Turbopack) |
| **Runtime** | Node.js, Vercel Edge (middleware only) |
| **Database** | PostgreSQL 15+ (prod) / SQLite (dev) via Prisma 7 + pgvector |
| **Auth** | Dual-path: JWT (password) + NextAuth v5 (Google OAuth) |
| **AI Providers** | DeepSeek → Vertex Gemini → Gemini API (automatic fallback) |
| **Caching** | Vercel KV / in-memory Map (AI cache + rate limiting) |
| **Styling** | Tailwind CSS 4 |
| **State** | Zustand (client), React Server Components |
| **Validation** | Zod v4 |
| **Testing** | Vitest (7 unit suites) + Playwright (10 e2e specs) |
| **Deployment** | Vercel (30s max duration for AI/import/OCR routes) |

---

## 3. Layer Architecture

```
┌─────────────────────────────────────────────┐
│              Browser (React 19)              │
│  ┌──────────────┐  ┌───────────────────────┐ │
│  │ page.tsx     │  │ Zustand Stores         │ │
│  │ (Server/     │  │ (appStore,             │ │
│  │  Client)     │  │  integratedSkillsStore) │ │
│  └──────┬───────┘  └───────────┬───────────┘ │
│         │                      │ fetch()      │
├─────────┼──────────────────────┼──────────────┤
│         ▼                      ▼              │
│  ┌──────────────────────────────────────────┐ │
│  │         API Route Layer (90+ routes)      │ │
│  │  /api/ai/*  /api/auth/*  /api/admin/*     │ │
│  │  /api/vocabulary/*  /api/writing/*  etc.  │ │
│  └──────────────────┬───────────────────────┘ │
│                     │                          │
│  ┌──────────────────▼───────────────────────┐ │
│  │         Library / Service Layer           │ │
│  │  ┌─────────┐  ┌──────┐  ┌─────────────┐ │ │
│  │  │ ai-svc  │  │ auth │  │ gamification │ │ │
│  │  └────┬────┘  └──┬───┘  └──────┬──────┘ │ │
│  │       │          │             │         │ │
│  │  ┌────▼──────────▼─────────────▼──────┐  │ │
│  │  │         PrismaClient (db.ts)       │  │ │
│  │  └────────────────┬───────────────────┘  │ │
│  └───────────────────┼──────────────────────┘ │
│                      │                        │
├──────────────────────┼────────────────────────┤
│                      ▼                        │
│  ┌──────────────────────────────────────────┐ │
│  │         PostgreSQL 15 + pgvector          │ │
│  └──────────────────────────────────────────┘ │
│                                               │
│  ┌──────────────────────────────────────────┐ │
│  │  External AI: DeepSeek / Gemini / Vertex │ │
│  └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 4. Directory Structure Analysis

```
src/
├── app/                    # Next.js App Router
│   ├── (public)/           # Unauthenticated routes (login, role-select)
│   ├── admin/              # Admin panel (4 pages)
│   ├── api/                # API routes (28 groups, ~90+ handlers)
│   ├── student/            # Student portal (16 pages)
│   ├── teacher/            # Teacher portal (12 pages)
│   └── style-guide/        # Design system reference
├── components/             # 22 shared + domain components
│   ├── layout/             # 3 layout components
│   ├── shared/             # 17 reusable UI components
│   ├── student/            # 2 student-specific components
│   ├── teacher/            # 1 teacher-specific component
│   └── vocabulary/         # 9 vocabulary feature components
├── hooks/                  # 1 custom hook (use-i18n)
├── lib/                    # Core business logic (~40 files)
│   ├── ai/                 # AI sub-modules (prompts, configs, utilities)
│   │   └── prompts/        # 10 prompt template files
│   └── __tests__/          # 7 unit test files
├── store/                  # 2 Zustand stores
└── types/                  # 1 NextAuth type augmentation
```

### Observations:
- **Flat `lib/` structure**: All 40 files at the top level. Sub-directories only for `ai/` and `__tests__/`. No domain grouping (e.g., `lib/auth/`, `lib/vocabulary/`, `lib/writing/`).
- **No barrel files**: Zero `index.ts` files exist anywhere in `lib/`, forcing consumers to know exact file paths.
- **Mixed languages in scripts/**: JS, TS, and Python scripts coexist.
- **Good separation of concerns**: Stores don't import Prisma; components don't import Prisma; routes mostly delegate to `lib/`.

---

## 5. Technology Stack Assessment

| Technology | Version | Status | Notes |
|---|---|---|---|
| Next.js | 16.2.10 | ✅ Current | App Router only, no Pages Router |
| React | 19.2.4 | ✅ Current | RSC + Client Components |
| Prisma | 7.8 | ✅ Current | Adapter pattern (libsql/pg) |
| TypeScript | 5.x | ✅ | Strict mode enabled |
| Tailwind CSS | 4.x | ✅ | Utility-first styling |
| Zustand | Latest | ✅ | Lightweight state management |
| Zod | 4.x | ✅ | Runtime validation |
| next-auth | v5 beta | ⚠️ | Beta — monitor for breaking changes |
| jose | Latest | ✅ | Edge-safe JWT |
| Vitest | 4.x | ✅ | Vite-native testing |
| Playwright | 1.61 | ✅ | E2E testing |

---

## 6. Auth Architecture

```
                    ┌─────────────┐
                    │  middleware  │  (Edge Runtime, jose JWT verify)
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    /admin (admin)   /teacher (+admin)   /student (any)
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
      JWT Sessions              NextAuth v5 OAuth
   (password login)          (Google sign-in, DB adapter)
   ┌──────────────┐         ┌─────────────────────┐
   │ auth.ts      │         │ [...nextauth]/route  │
   │ jwt.ts       │         │ auth-next.ts         │
   │ api-auth.ts  │         │ auth-cookies.ts      │
   │ crypto.ts    │         │ @auth/prisma-adapter │
   └──────────────┘         └─────────────────────┘
```

**Dual-auth concern**: Two parallel auth systems (JWT + NextAuth) increase complexity and attack surface. Cookie clearing must handle both token types. The `selected_role` cookie for role-switching is an additional moving part.

---

## 7. Key Metrics

| Metric | Count |
|---|---|
| Total TypeScript files (src/) | ~170 |
| API route handlers | ~90 |
| Page components | ~50 |
| Shared components | 22 |
| Library modules | ~40 |
| Unit test files | 7 |
| E2E test specs | 10 |
| Prisma models | 20 |
| Prisma-importing files | 63 (56 routes + 6 lib + 1 page) |
| AI-related files | ~95 |
| Prompt template files | 10 |
| Script files | 15 (7 JS, 3 TS, 2 Python, + misc) |
