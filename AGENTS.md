<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: AI English Platform

See `CLAUDE.md` for full architecture documentation.

## Quick Start (New Maintainer)
1. Read `CLAUDE.md` for architecture, ownership, and conventions
2. Read `CHANGELOG.md` for the latest changes (2026-09-14): 錯題庫技能歸屬／題型弱項、SRS 分層、DeepSeek V4.1 模型名
3. Read `README.md` for features and ADRs
4. Reference `docs/architecture/ADR-*.md` for architectural decisions
5. Run `npm test` — expect 2912/2912 pass (137 files, 1 skipped; core files: semantic-evaluator, analyze-writing)
6. DB migrations: `npx prisma migrate deploy`（本機 DATABASE_URL 由 `.env.local` 優先載入；勿只信 `.env`）
6. AI Infra CLI quick reference:
   - `npm run prompt:list` — list all prompt versions
   - `npm run prompt:states` — release lifecycle states
   - `npm run evaluate:reading` — run regression evaluation
   - `npm run prompt:experiment list` — list experiments
   - `npm run prompt:monitor dashboard` — live monitoring dashboard
   - `npm run prompt:monitor recover` — crash recovery after restart
   - `npm run prompt:monitor recover --dry-run` — preview recovery
   - `npm run prompt:monitor recovery-report` — last recovery report
   - `npm run calibration:report` — calibration gate report (exit 0 PASS / 1 FAIL / 2 INSUFFICIENT_DATA)
   - `npm run calibration:intake|verify|marker-pack|marker-intake|adjudicate|freeze` — human-marker evidence pipeline (fail-closed; never ingest level-only as evidence)

## Key Rules
- **Single pipeline**: `executeAI()` for JSON, `executeAIRaw()` for raw text. Never create another pipeline.
- **DeepSeek V4.1 thinking is opt-in**: the provider sends `thinking: {type:'disabled'}` unless a caller passes `thinking: true`. The API default (thinking on, effort `high`) ignores `temperature` and spends `max_tokens` on `reasoning_content` — measured 2026-09-15: omitting it returned an EMPTY answer after 21s with `max_tokens: 4096` (see CHANGELOG 2026-09-15). Opting in means raising `maxTokens`/`timeoutMs` too.
- **Single owner**: Every responsibility has exactly one canonical module (see CLAUDE.md Ownership section)
- **錯題技能歸屬**: 錯題的技能／題型一律由正典題目定義解析（`exercise/services/mistake-skill-identity.ts`）；客戶端自報值只作後備且須通過白名單。閱讀／聆聽題目依附篇章 → 不得當 flashcard（`listDueMistakesForReview` 排除）
- **Budget enforced**: LLM calls are gated by `isBudgetExceeded()` in `provider-registry.ts`
- **Evidence over speculation**: Every architectural decision requires git history, metrics, or runtime evidence
- **No speculative abstractions**: Delete code that has zero runtime consumers. Restore only if proven needed.
- **AI Infra modules are independent**: `prompt-versioning/`, `regression/`, `experiments/`, `continuous-evaluation/` — never import from each other; only integrate through barrel exports. CLI and CI are the only cross-module consumers.

