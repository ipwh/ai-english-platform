# ADR-050: Architecture-Rule Integrity, Cross-Platform Enforcement & Explicit Corpus Gating

- **Status**: Accepted
- **Date**: 2026-10-08
- **Related**: ADR-042 (generated answer verification), ADR-046 (fail-closed aggregation), ADR-049 (database-enforced concurrency guards)
- **Supersedes**: nothing

## Context

While unblocking CI (which had been red on `main` since at least 2026-09-21 — 30 consecutive
failing runs, all stopped before the test step by a Prisma 7 flag and a missing pgvector
extension), the test step finally executed and reported 28 failures. None of them were new:
they were pre-existing, and two separate mechanisms had been hiding them.

1. **The rules were silently vacuous on Windows.** `src/modules/__tests__/architecture.test.ts`
   stores each scanned file's OS path and then filters it with POSIX segment checks
   (`f.path.includes('/services/')`, `'/repositories/'`, `'/prompts/'`). On Windows the
   separator is `\`, so every one of those checks matched nothing: the whole file passed
   locally (120 tests, 0 violations) while the same file on Linux reported six violations.
   A rule that runs on only one developer platform is not a rule.
2. **Each rule aborted on its first offender.** Every loop ends in `expect.fail(...)`, so a
   single violation masked all the others. The reported debt (2 files) was a fraction of the
   real debt (1 + 1 + 3 + 9 + 1 + 3 items across six rules).
3. **Evidence suites required a corpus that is not in the repository.** Four calibration
   suites ingest the owner-supplied sources under `materials/` (HKEAA scored scripts,
   extracted booklets). That corpus is deliberately local-only and excluded from the deploy
   image, so a CI checkout has none of it. The suites therefore failed with
   `Human-marker source PDF missing` / `Calibration source file missing` — reporting a missing
   *local corpus* as a broken evidence pipeline. `ingest-human-marker.test.ts` went further and
   ingested at collection time, so the whole file (25 tests) failed to load instead of failing
   a few tests.

## Decision

1. **Scan paths are POSIX-normalized** (`full.split(sep).join('/')` in `readModuleFiles`), so
   every segment-based rule evaluates identically on Windows, macOS and Linux — and therefore
   also in CI. This is what makes a local green run meaningful.
2. **Rules inspect import specifiers, not raw file text.** Both refined rules parse
   `from '...'` specifiers and judge each one:
   - *Repositories do not import services*: a **relative** specifier inside `<module>/repositories/`
     is, by construction, the same module (allowed self-reference); only an alias pointing at
     another module's `services/` fails. Previously only `@/modules/<self>/services/` was
     recognised, which flagged `knowledge-graph-repository.ts` for importing its own service.
   - *Prompt templates import only pure prompt-support modules from services/*: prompt templates
     may reach `services/` only for `hallucination-guard`, `dse-topics`, `topic-selector` and
     `open-ended-topics` — prompt text and pure topic/type helpers. A companion test asserts
     those four files stay pure (no `db`/`Prisma`, no `providers`, no `fetch(`, no
     `process.env`, no cache/LLM imports), so the allowlist cannot rot into a loophole.
   - *The corpus gate asks for a usable FILE, never for a directory*: the repository commits
     only the small `.pdf.txt` extracts while the source PDFs are gitignored, so a CI checkout
     has `materials/_hkeaa_scored_scripts/` **with no `.pdf`**. An `existsSync(dir)` gate
     therefore reported "corpus present", the suites ran, and CI failed again with
     `Human-marker source PDF missing`. `HAS_SCORED_SCRIPTS` now requires a `.pdf` (and
     `HAS_EXTRACTED_MATERIALS` a `.txt`) — a directory alone must never be read as a corpus.
3. **Size governance whitelists by module-relative path**, not by bare filename (`ai-service.ts`
   would have exempted any future file with that name). Three genuinely oversized files are
   recorded as tracked debt — `ai/usecases/analyze-writing.ts` (1008), `ielts/services/
   generation-service.ts` (1120), `teacher/copilot/services/teacher-copilot-service.ts` (827) —
   and a companion test asserts every entry still exists, so an entry cannot silently rot.
   Splitting those files is a separate, riskier change (the writing pipeline and the IELTS
   authoring/top-up flow are both hardened against contract tests), so it is deliberately NOT
   bundled here.
4. **Provider credentials and endpoints live in the provider layer** (the pre-existing rule
   "Provider-specific code (fetch + API key) only in providers/ or ai-legacy" is now actually
   satisfied):
   - `services/vertex-embeddings.ts` → `providers/vertex-embeddings.ts` (verbatim move; a pure
     Google API client).
   - the DeepSeek embedding client + Vertex fallback + dimension policy moved out of
     `services/rag-service.ts` into `providers/embeddings-provider.ts` (verbatim, plus an
     exported `getDetectedEmbeddingDim()`); rag-service keeps orchestration, chunking and
     persistence, and no longer reads `config.deepseek` at all.
   - the availability helpers (`isAIConfigured`, `isDeepSeekConfigured`,
     `isVertexGeminiConfigured`, `getAIProviders`) moved from `services/ai-service.ts` into
     `providers/provider-availability.ts`; the AI facade re-exports them, so the public API and
     every existing caller are unchanged.
5. **Corpus-dependent evidence suites skip explicitly when the corpus is absent.**
   `__tests__/corpus-availability.ts` exposes `HAS_SCORED_SCRIPTS` / `HAS_EXTRACTED_MATERIALS` /
   `HAS_LEVEL_DESCRIPTORS`; the affected suites use `describe.skipIf(...)` / `it.skipIf(...)`,
   gated **per case** wherever the file also contains synthetic contract tests (so those keep
   running in CI). `ingest-human-marker.test.ts` now ingests inside `beforeAll` and never at
   collection time. **No assertion is weakened**: when the corpus is present the suites run
   unchanged and still fail loudly if it is malformed or a contract stops holding.

## Consequences

- The lint warning budget is a **ratchet**: it was re-baselined 225 → 480 (ADR-050) because the
  step never executed while CI was blocked, and 471 warnings (0 errors; dominated by 333
  `no-unused-vars` and 50 `no-explicit-any` over ~100 files) had accumulated unobserved. The
  number may only be lowered from here; raising it again needs a new recorded decision.
- A local `npm test` on Windows enforces the same architecture rules as CI; the architecture
  suite went from 120 to 121 tests and now actually inspects the source tree on every platform.
- Import-direction and size violations must now be resolved (or recorded in a commented,
  existence-checked whitelist) instead of being invisible.
- The prompt layer's only service-layer dependencies are four modules that are contractually
  pure; adding a fifth requires extending the allowlist *and* passing the purity assertions.
- `materials/` stays out of the repository and out of the deploy image; CI runs 42 fewer
  calibration cases and reports them as skipped, not failed. Anyone running the suite locally
  without the corpus sees explicit skips — the evidence pipeline is never silently trusted, but
  its absence is no longer misreported as breakage.
- Moving three provider-facing modules changes import paths: `@/modules/ai/providers/vertex-embeddings`
  (rag route, semantic-comparator), `@/modules/ai/providers/embeddings-provider` (rag-service),
  `@/modules/ai/providers/provider-availability` (re-exported by `ai/services/ai-service.ts`).
  Behaviour is unchanged: the embedding fallback order, the dimension-mismatch throw, and the
  RAG pgvector column cast all keep their previous semantics.

## Evidence

- Architecture suite: `npx vitest run src/modules/__tests__/architecture.test.ts` — 6 failures
  before (identical to CI), 121 passed / 0 failed after; independently confirmed with a
  throwaway enumerator that reproduced each rule over the whole tree (0 offenders left outside
  the documented whitelists).
- Calibration suites: 15 files / 292 tests pass with the corpus present; with the three source
  PDFs moved aside (exactly CI's state: the directory and the committed `.pdf.txt` extracts
  exist, the PDFs do not) the same run reports **252 passed / 40 skipped / 0 failed**, and the
  PDFs were restored immediately afterwards. Hiding the whole directories instead reports
  250 passed / 42 skipped / 0 failed.
- Quota reservation race: `src/modules/ielts/__tests__/instant-quota-reservation.test.ts`
  pins the interleaving that broke CI (10 concurrent reservations granted 6) with a stubbed db
  client — mid-flight row creation must retry, an at-cap row must be refused, the first
  reservation must `create` exactly once, a lost INSERT race (P2002) must re-increment, and a
  non-unique failure must propagate.
- Full local validation: `npm test` 3744 passed / 11 skipped, `npx tsc --noEmit` exit 0,
  `npx eslint` on the touched files (0 errors), and the AI/admin/learning-analytics subset
  (78 files, 1574 tests) green after the provider moves.
