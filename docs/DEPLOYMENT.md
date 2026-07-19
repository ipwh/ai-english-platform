# Deployment Guide — AI English Platform

## Prerequisites

- Node.js 18+
- PostgreSQL (Neon recommended) with pgvector extension
- DeepSeek API key (primary AI provider)
- Google Cloud project (Vertex AI + OAuth)
- Vercel account (Pro plan recommended for 30s function timeout)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPSEEK_API_KEY` | ✅ | DeepSeek API key (`sk-...`) |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | JWT signing secret (32+ chars) |
| `AUTH_SECRET` | ✅ | NextAuth secret |
| `AUTH_GOOGLE_ID` | ✅ | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | ✅ | Google OAuth Client Secret |
| `GEMINI_API_KEY` | ⬜ | Gemini API key (fallback) |
| `GCP_PROJECT_ID` | ⬜ | GCP project for Vertex AI |
| `DSE_RAG_ENABLED` | ⬜ | Enable past paper RAG (`true`) |
| `AI_CACHE_ENABLED` | ⬜ | Enable AI response caching (`true`) |
| `LOG_LEVEL` | ⬜ | `info` (prod) / `debug` (dev) |

## Deployment Steps

1. **Database**: Create Neon PostgreSQL project → run `CREATE EXTENSION IF NOT EXISTS vector;`
2. **Vercel**: Import GitHub repo → configure env vars → deploy
3. **Google OAuth**: GCP Console → APIs & Services → OAuth 2.0 → add redirect URI: `https://[domain].vercel.app/api/auth/callback/google`
4. **Verify**: `GET /api/health` → `{ status: "healthy" }`

## Monitoring

- **Health**: `GET /api/health` — service status
- **Readiness**: `GET /api/health?type=readiness` — dependency checks
- **Features**: `GET /api/health?type=features` — feature flag states
- **Vercel Logs**: Enable Log Drain → Datadog/Axiom for structured JSON logs
- **Vercel Analytics**: Enable Web Vitals + Audiences

## Rollback

```bash
# Via Vercel Dashboard: Deployments → select previous → Promote to Production
# Via CLI:
vercel rollback
```
