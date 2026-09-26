# ============================================
# 修復 Cloud Run 服務範本的環境變數（從已知良好的 revision 複製）
# ============================================
# 事故背景（2026-09-26）：
#   `scripts/cloud-run-deploy.ps1` 使用 `gcloud run deploy --set-env-vars "NODE_ENV=production"`。
#   gcloud 的 `--set-env-vars` 會**取代整組**環境變數（不是合併），因此該次部署把
#   JWT_SECRET / AUTH_SECRET / DATABASE_URL 等全部清空 → 模組載入時 config 驗證拋錯
#   → 全站 500（含 /api/health）。
#
# 本腳本把**某個已知良好 revision** 的純值環境變數合併回服務範本
# （`--update-env-vars`，保留 secretRef 型變數），令後續任何部署都不會再踩同一顆雷。
#
# 安全設計：
#   · 全程**不輸出任何變數值**（只輸出鍵名與長度）
#   · 值含逗號／引號／換行時**中止**（gcloud 的逗號分隔語法會被拆錯）並只顯示鍵名
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/cloud-run-restore-env.ps1 -SourceRevision english-platform-00118-2xd
#
# 注意：這會建立一個新 revision（Cloud Run 的環境變數變更必然產生新 revision）。
#       預設讓新 revision 接 100% 流量；若只想修範本、不動流量，加 -NoTraffic。
# ============================================

param(
  [Parameter(Mandatory=$true)][string]$SourceRevision,
  [string]$Service = "english-platform",
  [string]$Region = "asia-east2",
  [switch]$NoTraffic
)

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "=== 修復 Cloud Run 環境變數（來源 revision: $SourceRevision）==="
Write-Host ""

# ---------- 讀取來源 revision 的環境變數 ----------
$revJson = gcloud run revisions describe $SourceRevision --region $Region --format=json 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ 無法讀取 revision $SourceRevision："
  $revJson | Select-Object -First 5 | ForEach-Object { Write-Host "   $_" }
  exit 1
}
$rev = $revJson | ConvertFrom-Json

# 只取「純值」變數（secretRef 型由 --update-env-vars 保留，不需也不應在此重建）
$plain = @($rev.spec.containers[0].env | Where-Object { -not $_.valueFrom -and $_.value })

if ($plain.Count -eq 0) {
  Write-Host "❌ 來源 revision 沒有任何純值環境變數 —— 請確認 revision 名稱。"
  exit 1
}

# ---------- 安全檢查：值不得含 gcloud 語法會誤解的字元 ----------
$bad = @($plain | Where-Object {
  $v = [string]$_.value
  $v.Contains(',') -or $v.Contains('"') -or $v.Contains("`n") -or $v.Contains("`r")
})
if ($bad.Count -gt 0) {
  Write-Host "❌ 以下變數的值含逗號／引號／換行，無法用 --update-env-vars 安全傳遞：" -ForegroundColor Red
  $bad | ForEach-Object { Write-Host "   - $($_.name)（長度 $(([string]$_.value).Length)）" }
  Write-Host "   請改用 Secret Manager 或手動設定；本腳本不會以可能出錯的方式送出機密。"
  exit 1
}

Write-Host "將合併以下 $($plain.Count) 個變數（僅顯示鍵名與長度）："
$plain | ForEach-Object { Write-Host ("  {0,-32} len={1}" -f $_.name, ([string]$_.value).Length) }
Write-Host ""

# ---------- 套用（--update-env-vars 為合併語意，secretRef 變數不受影響） ----------
$pairs = ($plain | ForEach-Object { "$($_.name)=$([string]$_.value)" }) -join ','

$gcloudArgs = @(
  'run', 'services', 'update', $Service,
  '--region', $Region,
  '--update-env-vars', $pairs
)
if ($NoTraffic) { $gcloudArgs += '--no-traffic' }

$result = gcloud @gcloudArgs 2>&1
$exit = $LASTEXITCODE

if ($exit -ne 0) {
  Write-Host "❌ 更新失敗（exit $exit）：" -ForegroundColor Red
  $result | Select-Object -First 8 | ForEach-Object { Write-Host "   $_" }
  exit $exit
}

Write-Host "✅ 已更新服務範本環境變數"
$result | Select-Object -Last 8 | ForEach-Object { Write-Host "   $_" }
Write-Host ""
Write-Host "提醒：請接著執行 'gcloud run services describe $Service --region $Region' 核對變數清單（勿輸出值）。"
Write-Host ""
