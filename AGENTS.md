<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: AI English Platform

See `CLAUDE.md` for full architecture documentation.

## Quick Start (New Maintainer)
1. Read `CLAUDE.md` for architecture, ownership, and conventions
2. Read `CHANGELOG.md` for Sprint 124 changes (latest)
3. Read `README.md` for features and ADRs
4. Reference `docs/architecture/ADR-*.md` for architectural decisions
5. Run `npm test` — expect 78/78 pass (1,607 tests, 78 files; fully green)
6. AI Infra CLI quick reference:
   - `npm run prompt:list` — list all prompt versions
   - `npm run prompt:states` — release lifecycle states
   - `npm run evaluate:reading` — run regression evaluation
   - `npm run prompt:experiment list` — list experiments
   - `npm run prompt:monitor dashboard` — live monitoring dashboard

## Key Rules
- **Single pipeline**: `executeAI()` for JSON, `executeAIRaw()` for raw text. Never create another pipeline.
- **Single owner**: Every responsibility has exactly one canonical module (see CLAUDE.md Ownership section)
- **Budget enforced**: LLM calls are gated by `isBudgetExceeded()` in `provider-registry.ts`
- **Evidence over speculation**: Every architectural decision requires git history, metrics, or runtime evidence
- **No speculative abstractions**: Delete code that has zero runtime consumers. Restore only if proven needed.
- **AI Infra modules are independent**: `prompt-versioning/`, `regression/`, `experiments/`, `continuous-evaluation/` — never import from each other; only integrate through barrel exports. CLI and CI are the only cross-module consumers.

