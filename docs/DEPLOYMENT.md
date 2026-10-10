# Deployment Guide — AI English Platform

> **Deployment Readiness**: Engineering baseline stable | **Last release validation**: 2026-10-09 | **Tests**: 3,788 passed / 13 skipped (213 files passed / 3 skipped) | **Architecture**: Facade → UseCase → Service → Repository → Prisma
>
> **2026-10-09（Sprint 132）**：安全／依賴／CI 硬化。Next.js `16.2.10` → **`16.4.0`**、
> `next-auth` `5.0.0-beta.31` → **`beta.32`**、`sharp` `0.35.5`、`vitest` `4.1.11`；
> `npm audit` 25 → **12**（0 critical）。每一條安全下限由
> `src/shared/__tests__/dependency-security.test.ts` 守住（含 Prisma CLI↔client 版本一致）。
> **本批不含 schema 變更／migration** → 回滾 = 切回上一個 Cloud Run revision。
>
> **2026-09-26（ADR-046）**：全歷史投影改走伺服器端 SQL 聚合（Neon egress 收口）。本次
> **不含 schema 變更／migration** → 回滾 = 切回上一個 Cloud Run revision。
> 部署前後量測流程與等價性閘門見 README「Neon Egress 維運」。
>
> **2026-09-21 (III) 部署注意**：先 `npx prisma migrate deploy`（`20260924_listening_question_store`：建立 `ListeningQuestion`、刪除休眠的 `ListeningSession`/`ListeningAnswer`），**然後立即部署新 revision**（Cloud Run 不會自動套用 migration）。這個 migration 會 **DROP 兩張表**，而舊 revision 的 `GET /api/admin/students/[studentId]/analytics` 仍在 `_count` 查 `listeningSessions` → 在舊 revision 上該 admin 頁面會 500；新 revision 已完全移除該引用。無需回填。（若必須先套 migration、延後部署，請拆成兩步：先只建表，部署後再另開 migration 刪除休眠表。）
>
> **2026-09-21 (II) 部署注意**：先 `npx prisma migrate deploy`（含 `20260923_user_overall_accuracy_drop_default`），再 `npm run db:backfill:accuracy:apply`（一次性校正舊資料；dry-run 為 `npm run db:backfill:accuracy`），最後才讓新 revision 接收流量。

## Audit Summary (2026-07-19)

| Dimension | Score | Notes |
|-----------|-------|-------|
| API Security | ✅ 100% | All 103 routes authenticated via `verifyApiAuth()` |
| AI Quality | 🟢 90% | DSE rubrics embedded in all prompts; Speaking enhanced with Paper 4 rubrics |
| Type Safety | 🟢 92% | 38 `: any` / 26 `as any` remaining (strategic, documented) |
| Structured Logging | 🟡 75% | 71 files still use raw `console.*`; logger auto-patches in production |
| Config Consolidation | 🟡 70% | `process.env` exists in 25 files outside config; `NODE_ENV` most common |
| Documentation | 🟢 95% | Consolidated: 8 active docs, `.env.example` complete |
| Test Coverage | ✅ 853 tests | 39 test files, 34 modules covered |
| Build | ✅ Clean | TypeScript 0 errors, Next.js 16 Turbopack |

## Prerequisites

- Node.js 22+
- PostgreSQL (Neon recommended) with pgvector extension
- DeepSeek API key (primary AI provider)
- Google Cloud project (Vertex AI + OAuth + TTS)
- Docker + `gcloud` CLI (Cloud Run deployment)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPSEEK_API_KEY` | ✅ | DeepSeek API key (`sk-...`) |
| `DATABASE_URL` | ✅ | PostgreSQL connection string (Neon) |
| `JWT_SECRET` | ✅ | JWT signing secret (32+ chars, `openssl rand -base64 32`) |
| `AUTH_SECRET` | ✅ | NextAuth secret (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` | ✅ | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | ✅ | Google OAuth Client Secret |
| `GEMINI_API_KEY` | ⬜ | Gemini API key (fallback provider) |
| `CLAUDE_API_KEY` | ⬜ | Anthropic Claude API key (fallback provider) |
| `OPENAI_API_KEY` | ⬜ | OpenAI API key (last-resort fallback) |
| `GCP_PROJECT_ID` | ⬜ | GCP project for Vertex AI + TTS |
| `GCP_SERVICE_ACCOUNT_JSON` | ⬜ | GCP service account (Base64 encoded) |
| `DSE_RAG_ENABLED` | ⬜ | Enable past paper RAG (`true`) |
| `AI_CACHE_ENABLED` | ⬜ | Enable AI response caching (`true`) |
| `LOG_LEVEL` | ⬜ | `info` (prod) / `debug` (dev) |
| `AI_RATE_LIMIT_MAX` | ⬜ | AI requests per IP per minute (default: 60) |
| `CRON_SECRET` | ⬜ | Cron job verification secret |

## Quick Deploy

1. **Validate**: Run `npm test`, `node scripts/check-i18n.js`, `node scripts/check-n-plus-one.js`, `node scripts/check-lint-budget.js`, `npx prisma validate`, and `npx tsc --noEmit`.
2. **Database migration**: the push-to-`main` Cloud Build trigger runs `prisma migrate deploy` as **Step 1 `Migrate`** (secret `DIRECT_DATABASE_URL`) *before* the image is built and deployed, and a failure aborts the whole build — so new code can never go live against an old schema. The manual path (`npm run cloud-run:deploy:win`) builds and deploys the image but **does not** run migrations, so run `npx prisma migrate deploy` yourself first (with the production `DATABASE_URL`/`DIRECT_DATABASE_URL` loaded).
  - **Migration safety (enforced by a test)**: `src/shared/db/__tests__/migration-safety.test.ts` fails if a migration contains a destructive operation (`DROP`/`DELETE FROM`/`TRUNCATE`/`RENAME COLUMN`/`ALTER COLUMN … TYPE`/`SET NOT NULL`) that is not on its reviewed allowlist. Migrations must be **additive / backward compatible**: Cloud Run shifts traffic gradually, so the *previous* image briefly runs against the *new* schema, and a rollback must stay possible.
  - **Two deploys racing**: `prisma migrate deploy` takes a Postgres advisory lock, so concurrent runs serialise (the second sees no pending migrations). Deploy the newest revision last if you push twice in quick succession.
  - **✅ REPAIRED — the migration history now has a baseline (found 2026-10-09, Sprint 134; repaired and certified 2026-10-09, Sprint 135).**
    `prisma migrate deploy` **could not provision an empty database**: after the first two
    migrations only `StudentMastery` / `StudentMistakeSummary` exist, so
    `20260719_json_fields_migration` aborts the transaction
    (`ERROR: current transaction is aborted, commands ignored until end of transaction block`)
    and every later migration is skipped. Reproduced at HEAD `46707151` against a throwaway
    database:

    ```bash
    createdb mig_diag
    DATABASE_URL=... DIRECT_DATABASE_URL=... npx prisma migrate deploy   # fails at migration 3
    ```

    **Impact:** production and CI are unaffected — production applies only *pending*
    migrations to a database that already has the full history, and CI builds its schema with
    `prisma db push`. The defect affects **fresh environments only**: disaster recovery, a new
    staging database, a new Neon branch, or any clone rebuilt from migrations.

    **Do not edit the existing migration files** — Prisma validates applied-migration checksums,
    so a modified file makes `migrate deploy` fail against production. Correct remediation
    (requires an authorised operator with database access):

    **Repair (implemented, committed, exercised on every CI run):**

    - `prisma/baseline/schema-baseline.sql` — the baseline generated from `schema.prisma`
      (54 tables / 72 indexes). Regenerate with `npm run db:baseline:generate`.
      **Prisma 7 renamed this flag**: `--to-schema` — `--to-schema-datamodel` was removed
      (likewise `--from-url` → `--from-config-datasource`).
    - `scripts/db-provision-fresh.ts` — the **only** supported fresh-provisioning path.
      It refuses any database that is not completely empty (decision owner:
      `src/shared/db/fresh-provision-preflight.ts`; exit code 3), ensures the `vector`
      extension exists, applies the baseline, records all 24 migrations with
      `prisma migrate resolve --applied`, then asserts that `migrate deploy` is a **no-op**
      and that `migrate diff --exit-code` reports **zero drift**.
    - Commands: `npm run db:provision:fresh` (dry run — **no writes**),
      `npm run db:provision:fresh:apply` (empty database only), `npm run db:provision:verify`
      (re-run check on an existing database), `npm run db:verify:drift` (drift gate).
    - **Existing databases are never touched**: a database that already has
      `_prisma_migrations` is refused and left unchanged — verified on `mig_base` and
      `mig_diag` (3 history rows / 3 tables before **and** after the refusal).
    - `migrate deploy` reporting “no pending migrations” is **not** a drift check: it stays
      green even when the schema has drifted, so both checks always run together.

    Verified 2026-10-09 (Sprint 135) on PostgreSQL 17 + pgvector:

    | # | Scenario | Database used | Result |
    |---|---|---|---|
    | 1 | Empty database | `mig_fresh2`, `fresh_provision_test`, `ci_test` (rebuilt) | exit 0 — 54 tables, 24 migrations recorded, deploy **no-op**, drift **0** |
    | 2 | Existing database (partial history) | `mig_base`, `mig_diag` | exit **3** refused, byte-for-byte unchanged |
    | 3 | Drift | provisioned DB + injected `StudentMastery.drift_probe` | exit **1**; `migrate diff` exit 2 naming the exact change |
    | 4 | Re-run | provisioned DB, `npm run db:provision:verify` | exit 0 (deploy no-op, drift 0) |

    Acceptance criteria: **met** — `prisma migrate deploy` against a brand-new database exits 0
    as a no-op, and the resulting schema matches `schema.prisma` exactly (`migrate diff` exit 0).
    CI enforces this on every run (step “Fresh-database provisioning (empty DB → baseline →
    deploy no-op → zero drift)” in `.github/workflows/ci.yml`), so the migration chain can no
    longer silently stop being replayable.

    **Permanent fix still open (deliberately NOT done autonomously):** collapsing the 24
    migrations into one squashed baseline and deleting the old files rewrites the history of
    *every* environment (production, CI, every clone) and requires `prisma migrate resolve`
    everywhere, so it needs an authorised operator. Prove the squash before deploying it with
    `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma
    --exit-code` (exit 0 = the squashed chain is equivalent).
3. **Cloud Run**: `npm run cloud-run:deploy:win -- -ProjectId <PROJECT_ID>` → configure env vars → deploy.
4. **Google OAuth**: GCP Console → APIs & Services → OAuth 2.0 → add redirect URI: `https://[domain]/api/auth/callback/google`.
5. **Verify**: `GET /api/health` → `{ status: "healthy" }`; check readiness and Cloud Run logs for migration- or database-related errors.

> Vercel 已於 2026-09-15 移除；`vercel.json` / `@vercel/kv` / `vercel-build.js` 皆已不存在。

## Scheduled maintenance job: IELTS quota retention

`IeltsGenerationQuota` stores one row per (student, Hong Kong day, bucket). Nothing
reads a past day, so old rows are pure debt (~1 700 rows/day at 850 students,
≈ 620 k/year). Retention keeps **30 Hong Kong days** and deletes in **bounded
batches** (500 rows per batch, at most 200 batches per run).

> **STATUS (2026-10-09, Sprint 133): ENDPOINT READY / JOB NOT PROVISIONED.**
> The endpoint, the bounded cleanup and its observability are implemented and
> certified (bounded batch, dry run, fail-closed secret, one structured event per
> run), but **no Cloud Scheduler job exists yet in the production project**, so old
> rows still accumulate (~1 700/day). Provisioning is the remaining external
> operational step — Cloud Scheduler cannot be created from the repository.
> The job's declared shape (name, schedule, timezone, header, retry) lives in
> `cloud-scheduler.yaml` at the repo root; apply it with the command below, or use
> it to verify an existing job has not drifted.

Create a Cloud Scheduler HTTP job (mirrors the roster-sync job pattern):

```bash
# 1. Ensure CRON_SECRET exists on the Cloud Run service (reuse the roster-sync one).
#    The endpoint is permanently disabled (503) when CRON_SECRET is unset — fail-closed.

# 2. Inspect the backlog first (never deletes):
curl -H "x-cron-secret: $CRON_SECRET" \
  "https://<service-url>/api/admin/ielts/quota-retention?dryRun=true"

# 3. Schedule the drain (daily 03:30 HKT):
gcloud scheduler jobs create http ielts-quota-retention \
  --schedule="30 3 * * *" --time-zone="Asia/Hong_Kong" \
  --uri="https://<service-url>/api/admin/ielts/quota-retention" \
  --http-method=GET \
  --headers="x-cron-secret=$CRON_SECRET" \
  --location=asia-east2
```

The response reports `cutoffDayKey`, `deletedRows`, `batches` and `moreRemaining`;
`moreRemaining: true` simply means the next run continues. Re-running is always safe.

## Monitoring

- **Health**: `GET /api/health` — service status
- **Readiness**: `GET /api/health?type=readiness` — dependency checks
- **Features**: `GET /api/health?type=features` — feature flag states
- **Logs**: Cloud Logging（結構化 JSON）→ 可匯出至 Datadog/Axiom
- **Metrics**: Cloud Monitoring（請求數、延遲、執行個體數）

### Alerting (design complete / policies NOT provisioned)

The retention job emits **exactly one** structured event per run: `ielts.quota.retention.completed`
(`dayKey`, `deletedRows`, `batches`, `moreRemaining`, `dryRun`, `durationMs`) or
`ielts.quota.retention.failed` (`reason`, `durationMs`). Both names are declared in the IELTS
governance allowlist (`src/modules/ielts/governance/events.ts`), so alert policies can be added
without touching application code. Recommended Cloud Logging log-based alerts:

1. **Failure** — `jsonPayload.event="ielts.quota.retention.failed"` → page immediately. The
   endpoint also returns non-2xx and Cloud Scheduler retries 3× before giving up.
2. **Starvation** — `jsonPayload.event="ielts.quota.retention.completed" AND jsonPayload.moreRemaining=true`
   more than 3 times in 24 h → the bounded drain is not keeping up with intake (~1 700 rows/day).
3. **Silence** — no `completed` event for 48 h → the job is disabled, or `CRON_SECRET` was
   rotated without updating the scheduler header.

> **STATUS: NOT PROVISIONED** — same external-operator constraint as the scheduler job itself
> (alert policies cannot be created from the repository). Until then, check the endpoint's
> response body manually with `?dryRun=true`.

**Credential direction (documented, not implemented):** the job currently authenticates with a
static `x-cron-secret` header (fail-closed 503 when the secret is unset). Cloud Scheduler can
instead mint an OIDC token (`--oidc-service-account-email`) which the endpoint verifies against
Google's public keys (`audience` = service URL); that removes the shared long-lived secret and
should be adopted when the job is provisioned. Never commit a real `CRON_SECRET`.

## Safari 15.4 device verification checklist (manual — NOT automated)

**Status: `ARTIFACT-VERIFIED / DEVICE-UNVERIFIED`.** `npm run check:artifact` proves the *build
output* contains no post-Safari-15.4 syntax (78 client bundles scanned 2026-10-09: **0 violations** —
covers class static blocks, `Object/Map.groupBy`, `Promise.withResolvers`, `Array.fromAsync`,
`toSorted/toReversed/toSpliced`, RegExp lookbehind). It **cannot** prove how a real iPad behaves —
only a device can. Run this on the oldest supported hardware before relying on it.

Target: iPad Air 2 / iPad mini 4 class hardware on **iPadOS 15.8 (Safari 15.6)** — the support floor.

1. **Hydration** — sign in with Google from the login page. A button that does nothing means the
   client runtime failed to parse (SyntaxError); note the failing chunk name from the Safari console
   and compare it with `npm run check:artifact`.
2. **Core student flow** — open a practice session, answer an MC question, press “下一題”: the page
   must navigate, and the answered question must not come back un-answered.
3. **Audio** — play a listening item end-to-end (TTS MP3 must not stop after the first segment).
4. **PDF export** — export a writing analysis; a corrupted or HTML-renamed file means the PDF path
   regressed (it must fail loudly, never fall back to HTML).
5. **Styling floor** (known limitations, not defects) — Tailwind 4 uses `@property` (Safari 16.4 ✗)
   and `color-mix()` (Safari 16.2 ✗), so on iPadOS 15 translucent colours and some gradients
   degrade; `@layer` (15.4 ✓) is fine.
6. **Record** the outcome (device, iPadOS version, date) in the release notes.

A failure here is a **release blocker**, not cosmetic: the school fleet includes devices that
cannot be upgraded past iPadOS 15.8.

## Rollback

```bash
# 列出 revisions
gcloud run revisions list --service english-platform --region asia-east2

# 將流量導回上一個穩定 revision
gcloud run services update-traffic english-platform \
  --to-revisions <REVISION_NAME>=100 \
  --region asia-east2
```
