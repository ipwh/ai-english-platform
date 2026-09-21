# Deployment Guide — AI English Platform

> **Deployment Readiness**: Engineering baseline stable | **Last release validation**: 2026-09-21 | **Tests**: 3,172 passed / 1 skipped (163 files passed / 1 skipped) | **Architecture**: Facade → UseCase → Service → Repository → Prisma
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

- Node.js 18+
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

1. **Validate**: Run `npm test`, `node scripts/check-i18n.js`, `npx prisma validate`, and `npx tsc --noEmit`.
2. **Database migration**: With the production `DATABASE_URL` loaded, run `npx prisma migrate deploy` **before** deploying application code. The Cloud Run scripts build and deploy images but deliberately do not run migrations.
  - `20260921_submission_and_xp_idempotency`: replay keys for `SubmissionAttempt` and `XpTransaction`.
  - `20260922_practice_mastery_idempotency`: `PracticeSession.masteryAppliedAt` for exactly-once mastery application.
3. **Cloud Run**: `npm run cloud-run:deploy:win -- -ProjectId <PROJECT_ID>` → configure env vars → deploy.
4. **Google OAuth**: GCP Console → APIs & Services → OAuth 2.0 → add redirect URI: `https://[domain]/api/auth/callback/google`.
5. **Verify**: `GET /api/health` → `{ status: "healthy" }`; check readiness and Cloud Run logs for migration- or database-related errors.

> Vercel 已於 2026-09-15 移除；`vercel.json` / `@vercel/kv` / `vercel-build.js` 皆已不存在。

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
