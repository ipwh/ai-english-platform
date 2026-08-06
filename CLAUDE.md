# CLAUDE.md — Project Context for Claude Code

See AGENTS.md for shared agent instructions.

## Project: AI English Platform
- **Stack**: Next.js 16, TypeScript 5 strict, Prisma 7, PostgreSQL (Neon), Tailwind 4
- **Auth**: JWT (jose) + NextAuth v5 dual auth
- **AI**: DeepSeek → Vertex Gemini → Gemini API → Grok → Claude → OpenAI (6-provider fallback chain)
- **Testing**: Vitest 4, 1,586 tests, 74 test files (100% pass)
- **Build**: `node scripts/vercel-build.js` (exit 0)
- **Key modules**: 30 under `src/modules/`
- **API routes**: 120 under `src/app/api/`
- **Architecture**: v5 100/100 — Facade→UseCase→Service→Repository→Prisma, 120 enforcement tests, 0 exceptions
- **AI Response Validation**: 10/10 JSON use cases validated via `parseAndValidateAIResponse()` / `executeAI()`
- **AI Facade**: 32+ exported symbols — all API routes use `@/modules/ai` (no direct service imports)
- **AI Pipeline**: `executeAI()` canonical execution path — `callLLM → parseAndValidate` with `ExecutionContext` metadata
- **Shared utilities**: `computeWeightedScore()`, `skillLabelZh()`, `memoryService`, `BaseRuleEngine`, `CLO_RUBRIC`
- **i18n**: 1,360+ keys, 15 module files, check: `node scripts/check-i18n.js`
- **Deployment Readiness**: 96/100 (v1.0 RC certified — Sprint 119)
- **AI Quality**: DSE reading 8.2/10 — DeepSeek primary, 4-tier retry, JSON repair (7-step), paragraph ref verification
- **Layout**: v5 grid per-line (`.dse-line` + gutter + justify text); paragraph labels above; 2em indent
- **Debug**: `DEEPSEEK_DEBUG=true` for full API request/response logging

## Conventions
- All API routes use `verifyApiAuth()` for auth, `logger.error()` for errors
- **NEVER** use `console.error/warn` in API routes or services — use structured `logger`
- All API routes import AI capabilities from `@/modules/ai` (facade) — never from `ai/services/*` directly
- AI use cases use `executeAI()` or `parseAndValidateAIResponse()` — never raw `callLLM` + manual validation
- New AI use cases must include Zod schema in `ai/schemas/ai-schema.ts` and call `validateAIResponse()`
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
