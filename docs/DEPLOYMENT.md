# Deployment Guide — AI English Platform

> **Deployment Readiness**: 98% | **Last Audit**: 2026-07-19 | **Smoke Test**: `npm run smoke` (45 checks)

## Prerequisites

- Node.js 18+
- PostgreSQL (Neon recommended) with pgvector extension
- DeepSeek API key (primary AI provider)
- Google Cloud project (Vertex AI + OAuth + TTS)
- Vercel account (Pro plan recommended for 30s function timeout)

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

1. **Database**: Create Neon PostgreSQL project → run `CREATE EXTENSION IF NOT EXISTS vector;`
2. **Vercel**: Import GitHub repo → configure env vars → deploy
3. **Verify**: `npm run smoke` → 45/45 → visit `/login` → full flow test
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
