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
  - **⚠️ KNOWN DEFECT — the migration history has NO baseline (verified 2026-10-10, Sprint 134).**
    `prisma migrate deploy` **cannot provision an empty database**: after the first two
    migrations only `StudentMastery` / `StudentMistakeSummary` exist, so
    `20260719_json_fields_migration` fails with `column "badgeIds" does not exist`
    (its `BEGIN` block aborts and every later statement is skipped). Reproduce it against a
    throwaway database:

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

    1. Generate the baseline from the schema:
       `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
    2. For a **new** environment: apply that SQL (or `prisma db push`), then mark history as applied:
       `npx prisma migrate resolve --applied <migration_name>` for each existing migration.
    3. For **existing** environments: no action needed — their history is already recorded.
    4. Track the permanent fix (a proper squashed baseline + `migrate resolve`) as its own change.

    Acceptance criteria: `prisma migrate deploy` against a brand-new database exits 0 and
    produces the same schema as `prisma db push`.
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

## Rollback

```bash
# 列出 revisions
gcloud run revisions list --service english-platform --region asia-east2

# 將流量導回上一個穩定 revision
gcloud run services update-traffic english-platform \
  --to-revisions <REVISION_NAME>=100 \
  --region asia-east2
```
