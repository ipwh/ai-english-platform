# ============================================
# Cloud Run Deploy Script (Windows PowerShell)
# 使用 Cloud Build 建構 → 不需本機 Docker！
# 取代: 手動 docker build + gcloud run deploy（原 Vercel auto-deploy 路徑已於 2026-09-15 移除）
# ============================================
#
# 使用方式:
#   powershell -ExecutionPolicy Bypass -File scripts/cloud-run-deploy.ps1 -ProjectId "my-gcp-project" -Region "asia-east2"
#
# 前置條件:
#   1. 已安裝 gcloud CLI (`gcloud --version`)
#   2. 已登入 gcloud: `gcloud auth login`
#   3. 已啟用 Cloud Build API + Cloud Run API
#   4. 不需要 Docker Desktop！Cloud Build 在雲端建構

param(
  [Parameter(Mandatory=$true, HelpMessage="GCP Project ID")]
  [string]$ProjectId,

  [Parameter(HelpMessage="Cloud Run region")]
  [string]$Region = "asia-east2"
)

$ErrorActionPreference = "Stop"
$ServiceName = "english-platform"
$ImageName = "gcr.io/$ProjectId/$ServiceName"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "============================================"
Write-Host " Cloud Run Deploy — AI English Platform"
Write-Host " (Cloud Build — no local Docker needed)"
Write-Host "============================================"
Write-Host " Project:      $ProjectId"
Write-Host " Region:       $Region"
Write-Host " Service:      $ServiceName"
Write-Host " Image:        ${ImageName}:${Timestamp}"
Write-Host "============================================"
Write-Host ""

# Step 1: Verify gcloud
Write-Host "🔧 Step 1/3: Verifying gcloud setup..."
gcloud config set project $ProjectId
Write-Host "✅ gcloud project set to $ProjectId"

# Step 2: Build & Push using Cloud Build (no local Docker!)
Write-Host ""
Write-Host "🔧 Step 2/3: Building & pushing with Cloud Build..."
Write-Host "   (This sends your source to GCP, builds Docker image in the cloud,"
Write-Host "    and pushes to Container Registry — all remote, ~3-5 minutes)"
Write-Host ""

gcloud builds submit `
  --tag "${ImageName}:${Timestamp}" `
  --tag "${ImageName}:latest" `
  --timeout 1200 `
  --machine-type e2-highcpu-8 `
  .

if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Cloud Build failed"
  exit 1
}
Write-Host "✅ Image built and pushed: ${ImageName}:${Timestamp}"

# Step 3: Deploy to Cloud Run
Write-Host ""
Write-Host "🔧 Step 3/3: Deploying to Cloud Run..."

# ⚠️ 2026-09-26 事故（切勿改回）：本行原本使用 `--set-env-vars "NODE_ENV=production"`。
#    gcloud 的 `--set-env-vars` 語意是「**取代整組**」環境變數（非合併），因此該次
#    部署把 Cloud Run 服務上的 JWT_SECRET / AUTH_SECRET / DATABASE_URL / AUTH_GOOGLE_* /
#    CRON_SECRET / DEEPSEEK_API_KEY / NEXTAUTH_URL 全部清空 →
#    模組載入時 config 驗證拋錯（[config] 生產環境缺少必要安全變數）→
#    **全站 500，包含 /api/health**（latency 僅 ~12ms，屬載入期失敗而非查詢失敗）。
#    必須維持 `--update-env-vars`（合併語意）。
#    事後還原工具：scripts/cloud-run-restore-env.ps1（從既有 revision 複製，不輸出機密）。
# ⚠️ 2026-09-26 晚上事故：高併發時延遲尖峰（P95 > 5s）與 /api/gamification 500
#    （P2028／deadlock／逾時）。2026-09-27 起將併發由 80 降為 50：
#    令較多實例分擔同一批請求（更快橫向擴容）、每個實例同時持住的
#    DB 連線工作集較小；配合互動交易護欄（maxWait/timeout）與輕量化
#    XP 路徑，降低連線池壅塞。
#    變更前請先以 `npm run profile:requests` 與 Cloud Run 延遲指標量測。
gcloud run deploy $ServiceName `
  --image "${ImageName}:latest" `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --timeout 300 `
  --memory 1Gi `
  --cpu 1 `
  --min-instances 0 `
  --max-instances 20 `
  --concurrency 50 `
  --cpu-boost `
  --update-env-vars "NODE_ENV=production"

if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Deployment failed"
  exit 1
}
Write-Host "✅ Deployed to Cloud Run"

# Verify
Write-Host ""
$ServiceUrl = gcloud run services describe $ServiceName `
  --region $Region `
  --format "value(status.url)"

Write-Host ""
Write-Host "============================================"
Write-Host " 🎉 Deployment Complete!"
Write-Host "============================================"
Write-Host " Service URL:   $ServiceUrl"
Write-Host " Health Check:  ${ServiceUrl}/api/health"
Write-Host "============================================"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Set environment variables in Cloud Console:"
Write-Host "     https://console.cloud.google.com/run/detail/${Region}/${ServiceName}/revisions"
Write-Host "  2. Set up a custom domain mapping (optional):"
Write-Host "     gcloud run domain-mappings create --service=${ServiceName} --domain=your-domain.com --region=${Region}"
Write-Host "  3. View logs:"
Write-Host "     gcloud run services logs tail ${ServiceName} --region=${Region}"
Write-Host ""
