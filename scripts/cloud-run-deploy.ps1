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
  --concurrency 80 `
  --cpu-boost `
  --set-env-vars "NODE_ENV=production"

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
