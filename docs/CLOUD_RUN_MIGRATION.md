# Cloud Run 遷移部署指南

## 📋 前置準備

### 1. GCP 專案設定
```bash
# 安裝 gcloud CLI（如尚未安裝）
# https://cloud.google.com/sdk/docs/install

# 登入
gcloud auth login

# 設定專案
gcloud config set project YOUR_PROJECT_ID

# 啟用必要的 API
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# 設定 Docker 認證（推送映像檔用）
gcloud auth configure-docker
```

### 2. 建立 Service Account（用於執行時存取 GCP API）
```bash
gcloud iam service-accounts create english-platform \
  --display-name="AI English Platform Runtime"

# 授予權限（Vertex AI, Vision, TTS, Cloud Storage）
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:english-platform@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:english-platform@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudvision.user"
```

---

## 🚀 部署步驟

### 方式一：使用部署腳本（推薦）

**Windows PowerShell：**
```powershell
npm run cloud-run:deploy:win -- -ProjectId "YOUR_PROJECT_ID" -Region "asia-east2"
```

**macOS / Linux / WSL：**
```bash
npm run cloud-run:deploy YOUR_PROJECT_ID asia-east2
```

### 方式二：手動逐步部署

```bash
# 1. 建構 Docker 映像檔
npm run cloud-run:build

# 或手動：
docker build --platform linux/amd64 -t gcr.io/YOUR_PROJECT_ID/english-platform .

# 2. 推送到 Container Registry
docker push gcr.io/YOUR_PROJECT_ID/english-platform

# 3. 部署到 Cloud Run
gcloud run deploy english-platform \
  --image gcr.io/YOUR_PROJECT_ID/english-platform \
  --region asia-east2 \
  --platform managed \
  --allow-unauthenticated \
  --timeout 300 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 20 \
  --cpu-boost
```

---

## 🔐 環境變數設定

部署完成後，在 [Cloud Console](https://console.cloud.google.com/run) 設定環境變數：

### 必要變數

| 變數 | 說明 |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL 連線字串 |
| `DIRECT_URL` | Prisma migrate 用（同 DATABASE_URL 或無 pgbouncer 版本） |
| `AUTH_SECRET` | NextAuth 密鑰 (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret |
| `JWT_SECRET` | JWT 簽署密鑰 |
| `NEXTAUTH_URL` | Cloud Run 服務 URL（如 `https://english-platform-xxxxx-xx.asia-east2.run.app`） |

### AI Provider 變數

| 變數 | 說明 |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API Key（主 AI） |
| `GOOGLE_CLOUD_PROJECT` | GCP 專案 ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/app/materials/gcp-service-account.json` |
| `GEMINI_API_KEY` | Gemini API Key（fallback） |
| `OPENAI_API_KEY` | OpenAI API Key（fallback） |
| `ANTHROPIC_API_KEY` | Claude API Key（fallback） |
| `GROK_API_KEY` | Grok API Key（fallback） |

> 💡 參考 `.env.cloud-run.example` 完整變數清單

---

## 📊 與 Vercel 的對照

| 功能 | Vercel | Cloud Run |
|---|---|---|
| **部署觸發** | Git push 自動 | `npm run cloud-run:deploy:win` 或 CI/CD |
| **AI Route Timeout** | 60-120s (`vercel.json`) | 預設 300s，最大 3600s |
| **記憶體** | 1024 MB (per route) | 1 GiB（整個容器） |
| **Cold Start** | 自動處理 | Startup CPU Boost 加速 |
| **Domain** | `*.vercel.app` | `*.run.app` 或自訂網域 |
| **環境變數** | Vercel Dashboard | Cloud Console / Secret Manager |
| **CORS 設定** | `vercel.json` headers | `next.config.ts` headers（已設定） |
| **靜態資源** | Vercel Edge CDN | Cloud CDN（可選） |
| **GCP API 驗證** | Service Account JSON | IAM Service Account 自動驗證 |
| **Vercel KV** | 原生支援 | 自動 fallback 到 memory |

---

## ⚠️ 注意事項

### 1. Vercel KV → Memory Fallback
`@vercel/kv` 在 Cloud Run 上無法使用（非 Vercel 環境）。程式碼已內建 graceful degradation，會自動切換到 in-memory store。

**影響**：
- AI cache 變為 per-instance（非全域共享）
- 冷啟動後 cache 會重置
- Rate limiter 變為 per-instance 計數

**可選優化**：未來可改用 Cloud Memorystore (Redis) 作為全域 KV store。

### 2. 資料庫 Migration
Cloud Run 不會在部署時自動執行 `prisma migrate deploy`。有三種做法：

**A. 部署前手動執行（目前最簡單）：**
```bash
npx prisma migrate deploy
```

**B. 使用 Cloud Run Jobs（排程或手動觸發）：**
```bash
gcloud run jobs create db-migrate \
  --image gcr.io/YOUR_PROJECT_ID/english-platform \
  --command "npx prisma migrate deploy" \
  --region asia-east2
```

### 3. 靜態資源 CDN
Vercel 自動提供全球 CDN。Cloud Run 預設從單一區域提供服務。如需 CDN：
```bash
# 可選：設定 Cloud CDN 或使用 Firebase Hosting 作為前端
```

### 4. 本地測試
```bash
# 建構映像檔
npm run cloud-run:build

# 本地執行
docker run -p 8080:8080 \
  -e DATABASE_URL="..." \
  -e AUTH_SECRET="..." \
  english-platform
```

---

## 📈 監控

```bash
# 查看服務日誌
gcloud run services logs tail english-platform --region asia-east2

# 查看部署歷史
gcloud run revisions list --service english-platform --region asia-east2

# 流量分割（金絲雀部署）
gcloud run services update-traffic english-platform \
  --to-revisions LATEST=5,STABLE=95 \
  --region asia-east2
```

---

## 🔄 回滾 Vercel

如果需要回到 Vercel：
1. 保留 `vercel.json` 和 `scripts/vercel-build.js`（未刪除）
2. `next.config.ts` 中的 `output: 'standalone'` **不影響** Vercel 部署（Vercel 會忽略）
3. 重新連接 Git repository 到 Vercel 即可
