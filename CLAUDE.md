# CLAUDE.md — Project Context for Claude Code

See AGENTS.md for shared agent instructions.

## Project: AI English Platform
- **Stack**: Next.js 16, TypeScript 5 strict, Prisma 7, PostgreSQL (Neon), Tailwind 4
- **Auth**: JWT (jose) + NextAuth v5 dual auth
- **AI**: DeepSeek → Vertex Gemini → Gemini API fallback chain (5 providers)
- **Testing**: Vitest 4, 1,100+ tests, 51 test files
- **Build**: `node scripts/vercel-build.js`
- **Key modules**: 36 under `src/modules/`
- **API routes**: 120 under `src/app/api/`

## Conventions
- All API routes use `verifyApiAuth()` for auth, `logger.error()` for errors
- Teacher-only routes add `['teacher', 'admin']` role check
- Services use lazy `await import()` for DB-dependent modules (avoid Prisma in unit tests)
- Structured logger: `logger.info({ module: '...', ...meta }, 'message')`
- Bilingual outputs (en+zh) where user-facing
- Feature flags in `src/modules/production/services/production-ready.ts`
