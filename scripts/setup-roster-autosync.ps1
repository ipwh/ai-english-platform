# ============================================
# 設定 Google Sheets 學生名單「自動同步」
#   Cloud Run (english-platform) + Cloud Scheduler
#
# 用法:
#   powershell -ExecutionPolicy Bypass -File scripts/setup-roster-autosync.ps1
#
# 可選參數:
#   -ProjectId "amiable-nirvana-500300-a0"   (預設: 讀取 gcloud 設定)
#   -Region    "asia-east2"
#   -Schedule  "0 5 * * *"      (cron 語法, 預設每日 05:00)
#   -TimeZone  "Asia/Hong_Kong"
#   -Secret    "..."            (提供既有 CRON_SECRET；否則自動產生)
#
# 前置條件:
#   1. gcloud CLI 已安裝並登入 (gcloud auth login)
#   2. 權限: Cloud Run Admin + Cloud Scheduler Admin
#   3. Cloud Run service env 已設 GOOGLE_SHEETS_CLASS_ROSTER_ID
#      (指向「最新的名單 Sheet」，值在 Cloud Console 設定)
#
# 此指令碼會:
#   - 在 Cloud Run service env 加入/更新 CRON_SECRET（保留其他 env）
#   - 建立/更新 Cloud Scheduler HTTP job "roster-sync"
#     → 每日 GET {service}/api/admin/sync-sheets/cron (x-cron-secret)
#   - CRON_SECRET 儲存在本機 git-ignored 檔 .roster-sync-secret（不會提交）
# ============================================

param(
  [string]$ProjectId = "",
  [string]$Region = "asia-east2",
  [string]$ServiceName = "english-platform",
  [string]$Schedule = "0 5 * * *",
  [string]$TimeZone = "Asia/Hong_Kong",
  [string]$Secret = ""
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$SecretFile = Join-Path $Root ".roster-sync-secret"

function Write-Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "   OK: $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Host "   WARN: $m" -ForegroundColor Yellow }

# ---- 0. gcloud 檢查 ----
Write-Step "檢查 gcloud"
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  Write-Host "找不到 gcloud。請先安裝 Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
  exit 1
}
if (-not $ProjectId) { $ProjectId = (gcloud config get-value project 2>$null) }
if (-not $ProjectId) {
  Write-Host "無法取得 GCP project。請用 -ProjectId 指定，或先執行: gcloud config set project <PROJECT_ID>"
  exit 1
}
Write-Ok "Project: $ProjectId | Region: $Region | Service: $ServiceName"

# ---- 1. 取得 Cloud Run Service URL ----
Write-Step "取得 Cloud Run Service URL"
$svcJson = gcloud run services describe $ServiceName --project=$ProjectId --region=$Region --format=json 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "找不到 Cloud Run service 或無權限（需要 Cloud Run Admin）。"
  exit 1
}
$svc = $svcJson | ConvertFrom-Json
$ServiceUrl = $svc.status.url.TrimEnd('/')
Write-Ok "Service URL: $ServiceUrl"

# 檢查 env 是否已有名單 Sheet ID（值會被遮罩，只檢查 key 是否存在）
$envNames = @($svc.spec.template.spec.containers[0].env | ForEach-Object { $_.name })
if ($envNames -notcontains 'GOOGLE_SHEETS_CLASS_ROSTER_ID') {
  Write-Warn "Cloud Run env 沒有 GOOGLE_SHEETS_CLASS_ROSTER_ID！請先在 Cloud Console 設定（指向你最新更新的名單 Sheet），否則排程同步會無資料可讀。"
} else {
  Write-Ok "GOOGLE_SHEETS_CLASS_ROSTER_ID 已存在於 Cloud Run env。"
}

# ---- 2. 決定 / 產生 CRON_SECRET ----
Write-Step "決定 CRON_SECRET"
$cronSecret = ""
if ($Secret) {
  $cronSecret = $Secret.Trim()
  Write-Ok "使用 -Secret 提供的 CRON_SECRET"
} elseif (Test-Path $SecretFile) {
  $cronSecret = (Get-Content $SecretFile -Raw).Trim()
  Write-Ok "沿用本機既有 CRON_SECRET（$SecretFile）"
} else {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  # base64url（去掉 = + /，方便放入 header / URL）
  $cronSecret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  Write-Ok "已產生新的 CRON_SECRET"
}
if (-not $cronSecret) { Write-Host "CRON_SECRET 為空白，中止。"; exit 1 }

# 儲存到 git-ignored 本機檔（重跑時沿用同一 secret，避免排程與 service 失配）
Set-Content -Path $SecretFile -Value $cronSecret -NoNewline
try { icacls $SecretFile /inheritance:r /grant:r "$env:USERNAME:(R,W)" *> $null } catch { }
Write-Ok "CRON_SECRET 已存於 $SecretFile（.gitignore 已忽略，不會提交）"

# ---- 3. 設定 Cloud Run env（保留其他 env）----
Write-Step "在 Cloud Run 設定 CRON_SECRET"
gcloud run services update $ServiceName --project=$ProjectId --region=$Region --update-env-vars="CRON_SECRET=$cronSecret"
if ($LASTEXITCODE -ne 0) { Write-Host "更新 Cloud Run env 失敗。"; exit 1 }
Write-Ok "CRON_SECRET 已更新（其餘 env 保留）"

# ---- 4. 建立 / 更新 Cloud Scheduler Job ----
Write-Step "建立 / 更新 Cloud Scheduler Job (roster-sync)"
$jobName = "roster-sync"
$uri = "$ServiceUrl/api/admin/sync-sheets/cron"
gcloud scheduler jobs describe $jobName --location=$Region --project=$ProjectId *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Ok "Job 已存在，更新排程與 secret..."
  gcloud scheduler jobs update http $jobName --location=$Region --project=$ProjectId `
    --schedule="$Schedule" --uri="$uri" --http-method=GET `
    --headers="x-cron-secret=$cronSecret" --time-zone="$TimeZone" `
    --description="每日同步 Google Sheets 學生名單"
} else {
  gcloud scheduler jobs create http $jobName --location=$Region --project=$ProjectId `
    --schedule="$Schedule" --uri="$uri" --http-method=GET `
    --headers="x-cron-secret=$cronSecret" --time-zone="$TimeZone" `
    --description="每日同步 Google Sheets 學生名單"
}
if ($LASTEXITCODE -ne 0) {
  Write-Host "建立 Scheduler Job 失敗。請確認: 1) 已啟用 Cloud Scheduler API 2) 帳號有 Cloud Scheduler Admin 權限。"
  exit 1
}
Write-Ok "Scheduler Job 'roster-sync' 就緒: $uri"

# ---- 5. 完成 ----
Write-Step "完成"
Write-Host "  排程: $Schedule ($TimeZone) → $uri"
Write-Host ""
Write-Host "測試方法（預覽模式，不會寫入資料庫）:"
Write-Host "  gcloud scheduler jobs run $jobName --location=$Region --project=$ProjectId"
Write-Host "  # 或手動: curl -H \"x-cron-secret: <secret>\" \"$uri`?dryRun=true\""
Write-Host ""
Write-Host "注意: 程式碼（cron route + sync-sheets 授權）需已部署上 Cloud Run，"
Write-Host "      才可透過排程觸發（commit push 至 main 會自動部署）。"
