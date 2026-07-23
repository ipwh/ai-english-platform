# CLAUDE.md — Project Context for Claude Code

See AGENTS.md for shared agent instructions.

## Project: AI English Platform
- **Stack**: Next.js 16, TypeScript 5 strict, Prisma 7, PostgreSQL (Neon), Tailwind 4
- **Auth**: JWT (jose) + NextAuth v5 dual auth
- **AI**: DeepSeek → Vertex Gemini → Gemini API fallback chain (5 providers)
- **Testing**: Vitest 4, 1,027 tests, 48 test files (100% pass)
- **Build**: `node scripts/vercel-build.js` (exit 0)
- **Key modules**: 36 under `src/modules/`
- **API routes**: 120 under `src/app/api/`
- **Architecture**: v5 100/100 — Route→Facade→Service→Repository→Prisma, 34/34 enforcement tests, 0 exceptions

## Conventions
- All API routes use `verifyApiAuth()` for auth, `logger.error()` for errors
- Teacher-only routes add `['teacher', 'admin']` role check
- API routes use `adminDbQuery(model, method, args)` from `@/modules/admin/services/admin-operations` — never import `db` directly
- Admin routes that need raw Prisma (import/sync) use `adminDbDirect` / `adminGetBulkDb` aliases
- Services use lazy `await import()` for DB-dependent modules (avoid Prisma in unit tests)
- Structured logger: `logger.info({ module: '...', ...meta }, 'message')`
- Bilingual outputs (en+zh) where user-facing
- Feature flags in `src/modules/production/services/production-ready.ts`
- All type annotations on `adminDbQuery` results are explicit (zero `any` leakage)
