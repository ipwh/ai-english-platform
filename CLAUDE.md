# CLAUDE.md — Project Context for Claude Code

See AGENTS.md for shared agent instructions.

## Project: AI English Platform
- **Stack**: Next.js 16, TypeScript 5 strict, Prisma 7, PostgreSQL (Neon), Tailwind 4
- **Auth**: JWT (jose) + NextAuth v5 dual auth
- **AI**: DeepSeek → Vertex Gemini → Gemini API → Claude → OpenAI (5-provider fallback chain)
- **Testing**: Vitest 4, 1,054 tests, 46 test files (100% pass)
- **Build**: `node scripts/vercel-build.js` (exit 0)
- **Key modules**: 30 under `src/modules/`
- **API routes**: 120 under `src/app/api/`
- **Architecture**: v5 100/100 — Facade→UseCase→Service→Repository→Prisma, 120 enforcement tests, 0 exceptions
- **i18n**: 1,360+ keys, 15 module files, check: `node scripts/check-i18n.js`
- **Deployment Readiness**: 91/100 (v1.0 RC certified — Sprint 102)

## Conventions
- All API routes use `verifyApiAuth()` for auth, `logger.error()` for errors
- **NEVER** use `console.error/warn` in API routes or services — use structured `logger`
- Teacher-only routes add `['teacher', 'admin']` role check
- Student-self routes use `verifyStudentSelfAccess(authResult, studentId)` for ownership
- API routes use `adminDbQuery(model, method, args)` from `@/modules/admin/services/admin-operations` — never import `db` directly
- Admin routes that need raw Prisma (import/sync) use `adminDbDirect` / `adminGetBulkDb` aliases
- Services use lazy `await import()` for DB-dependent modules (avoid Prisma in unit tests)
- Structured logger: `logger.info({ module: '...', ...meta }, 'message')`
- Bilingual outputs (en+zh) where user-facing — use `t('key')` from `@/shared/utils/i18n`
- New i18n keys go in `src/shared/utils/i18n-pages.ts` (or appropriate `i18n-*.ts` module)
- Request validation: use `validateRequest(schema, body)` from `@/shared/validation/schemas`
- Feature flags in `src/modules/platform/release/feature-flags.ts`
- Config env vars validated at startup via Zod in `src/shared/config/config.ts`
- Circuit breaker: 5 failures → open (30s) → half-open (2 successes → closed)
- All type annotations on `adminDbQuery` results are explicit (zero `any` leakage)
