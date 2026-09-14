# Operations Runbook — AI English Platform

## Alerts & Response

| Alert | Trigger | Response |
|-------|---------|----------|
| AI 5xx spike | >5% error rate in 5min | Check `/api/health` → verify AI provider → check DeepSeek status page |
| High latency | p95 > 8s | Check Cloud Run request latency metrics → check DB connection pool → review AI provider latency |
| DB connection errors | P1001 errors | Check Neon dashboard → verify connection string → restart if needed |
| Rate limit hits | 429 responses > 10/min | Increase `AI_RATE_LIMIT_MAX` env var → check for abuse patterns |
| Cold start slowdown | Request duration > 15s after idle | Cloud Run startup CPU boost is on (`cloud-run.yaml`) → check bundle size → optimize imports |

## Common Operations

### Restart AI Provider
```bash
# Flip feature flag to force provider reset
curl -X POST https://[domain]/api/health?type=features
# Circuit breaker auto-resets after 30s
```

### Clear AI Cache
```bash
# Restart deployment (cache is in-memory)
# Or set AI_CACHE_ENABLED=false temporarily
```

### Database Maintenance
```bash
npx prisma db push      # Schema sync (dev)
npx prisma migrate deploy  # Migration apply (prod)
```

> 本機執行上述指令時，`prisma.config.ts` 依 **`.env.local` → `.env`** 順序載入 `DATABASE_URL`
> （2026-09-14 起；此前只讀 `.env`，而該檔的 Neon 密碼已失效 → P1000）。
> 真實環境變數永遠優先，故 Cloud Run 不受影響。

### Check Feature Flags
```bash
curl https://[domain]/api/health?type=features
```

## Backup Strategy
- **Database**: Neon automatic backups (daily, 7-day retention)
- **Code**: GitHub (full history)
- **Environment**: Cloud Run service env vars / Secret Manager (exportable via `gcloud run services describe`)
- **User uploads**: Google Drive (materials folder)

## Disaster Recovery
1. Database failure: Neon point-in-time recovery → update DATABASE_URL → redeploy
2. AI provider outage: Automatic fallback chain (DeepSeek → Grok)
3. Cloud Run regional outage: redeploy to a backup region (`gcloud run deploy --region <backup>`)
4. Full recovery: Clone repo → set env vars → `npm install && npm run build:prod` → build image → `npm run cloud-run:deploy:win`
