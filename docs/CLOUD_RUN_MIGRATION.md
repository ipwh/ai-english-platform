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
  --timeout 900 \
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
| `DATABASE_URL` | Neon PostgreSQL 連線字串（執行期；`-pooler` 主機） |
| `DIRECT_DATABASE_URL` | Prisma CLI 遷移用**直連**主機（無 `-pooler`；2026-09-27 起 `prisma.config.ts` 優先採用）。執行期不需要 |
| `AUTH_SECRET` | NextAuth 密鑰 (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret |
| `JWT_SECRET` | JWT 簽署密鑰 |
| `NEXTAUTH_URL` | Cloud Run 服務 URL（如 `https://english-platform-xxxxx-xx.asia-east2.run.app`） |

### AI Provider 變數

| 變數 | 說明 |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API Key（主 AI） |
| `GCP_PROJECT_ID` | GCP 專案 ID |
| `GCP_SERVICE_ACCOUNT_JSON` | GCP Service Account JSON 內容（Vertex/Vision/TTS 驗證，優先於下方檔案路徑） |
| `GOOGLE_APPLICATION_CREDENTIALS` | （可選）指向掛載的憑證檔案路徑 |
| `GEMINI_API_KEY` | Gemini API Key（fallback） |
| `OPENAI_API_KEY` | OpenAI API Key（fallback） |
| `ANTHROPIC_API_KEY` | Claude API Key（fallback） |
| `GROK_API_KEY` | Grok API Key（fallback） |

> 💡 參考 `.env.cloud-run.example` 完整變數清單

> 🔐 **憑證注入（2026-08-13 起）**：映像檔不再包含任何憑證檔案
> （`.dockerignore` 已排除 `materials/gcp-service-account.json`、
> `materials/client_secret_*.json`、`cloud-run-env.yaml`）。
> 請在 Cloud Run 設定 `GCP_SERVICE_ACCOUNT_JSON` 環境變數
> （`gcp-auth.ts` 優先讀取；建議使用 Secret Manager 管理）。

---

## 📊 部署平台對照（歷史記錄：Vercel → Cloud Run）

> ⚠️ **2026-09-15：Vercel 部署已完全移除。** 下表僅保留為遷移決策的歷史依據；
> 專案現在只有一個部署目標：Cloud Run。`vercel.json` 已刪除，
> `scripts/vercel-build.js` 已更名為 `scripts/production-build.js`。

| 功能 | Vercel（已移除） | Cloud Run（現行） |
|---|---|---|
| **部署觸發** | Git push 自動 | `npm run cloud-run:deploy:win` 或 CI/CD |
| **AI Route Timeout** | 60-120s (`vercel.json`) | 預設 300s，最大 3600s |
| **記憶體** | 1024 MB (per route) | 1 GiB（整個容器） |
| **Cold Start** | 自動處理 | Startup CPU Boost 加速 |
| **Domain** | `*.vercel.app` | `*.run.app` 或自訂網域 |
| **環境變數** | Vercel Dashboard | Cloud Console / Secret Manager |
| **CORS 設定** | `vercel.json` headers | 同源架構，無需 CORS header |
| **靜態資源** | Vercel Edge CDN | Cloud CDN（可選） |
| **GCP API 驗證** | Service Account JSON | IAM Service Account 自動驗證 |
| **分散式 KV** | Vercel KV | 未實作（見下方注意事項 1） |

---

## ⚠️ 注意事項

### 1. 分散式 KV（未實作，原本為 Vercel KV）
原 Vercel KV 後端已隨 Vercel 部署一起移除（`@vercel/kv` 已廢棄，且 `VERCEL_KV_URL` 從未在 Cloud Run 設定）。
目前 `ai-cache` 與 `rate-limiter` 皆為 **per-instance in-memory**。

**影響**：
- AI cache 為 per-instance（非全域共享）
- 冷啟動後 cache 會重置
- Rate limiter 為 per-instance 計數：Cloud Run 最多 20 instances（`cloud-run.yaml`），實際全域上限約為 `maxRequests × instance 數`

**可選優化**：如需全域精確限流／共享快取，接入 Cloud Memorystore (Redis) 或 Upstash Redis。

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
Cloud Run 預設從單一區域提供服務。如需全球 CDN：
```bash
# 可選：設定 Cloud CDN 或使用 Firebase Hosting 作為前端
```

### 5. 機密管理（重要）
`cloud-run-env.yaml` 含真實機密，已從 git 追蹤移除（保留在本地），
並加入 `.gitignore`。Cloud Build 自動部署的環境變數在 Cloud Console 設定，不使用該檔。

若該檔曾上傳至 GitHub（含歷史記錄），請**立即輪換全部密鑰**：
- Neon `DATABASE_URL` 密碼
- `JWT_SECRET` / `AUTH_SECRET` / `CRON_SECRET`
- Google OAuth `AUTH_GOOGLE_SECRET`
- `DEEPSEEK_API_KEY` / `GEMINI_API_KEY` 等 AI provider key
- GCP Service Account（刪除並重建，再更新 Secret Manager）

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

## 🔄 回滾

Cloud Run 以 revision 為單位回滾，不需要 Vercel：

```bash
# 列出 revisions
gcloud run revisions list --service english-platform --region asia-east2

# 將 100% 流量導回上一個穩定 revision
gcloud run services update-traffic english-platform \
  --to-revisions <REVISION_NAME>=100 \
  --region asia-east2
```

> 2026-09-15 起 Vercel 路徑已移除，無法再回滾至 Vercel。
> 若日後真的需要其他平台，需重新建立該平台所需的設定與環境變數分支。
