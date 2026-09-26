# ============================================
# Cloud Run 請求分布分析（唯讀）
# ============================================
# 目的：取得**真實的每端點請求次數與回傳位元組**。
#
# 為什麼需要它：`pg_stat_statements` 給的是「查詢」排行，無法回答
# 「/api/notifications 每小時被呼叫幾次」；而頻率正是目前 egress 歸因中
# 唯一靠推估的部分（校準係數 k≈11 把所有來源混在一起）。
# Cloud Run 存取日誌直接記錄每個請求的 URL 與 responseSize，且可查歷史時段。
#
# 為什麼用 REST API 而非 `gcloud logging read`：
#   PowerShell 5.1 傳遞含 `>` / `<` 的原生指令參數時會弄壞內層引號，令
#   `timestamp>="..."` 的引號被吃掉 → gcloud 回 "Unparseable filter ... token ':'"。
#   把 filter 放進 JSON body（ConvertTo-Json 負責轉義）可完全避開這個問題類別。
#
# 前置：需已登入（憑證會過期；重新認證需互動式瀏覽器）
#   gcloud auth login
#
# 用法（HKT = UTC+8；上課時段 10:00–11:00 HKT = 02:00–03:00 UTC）：
#   npm run profile:requests
#   .\scripts\profile-requests.ps1 -Start "2026-09-24T02:00:00Z" -End "2026-09-24T03:00:00Z"
#
# 判讀：
#   · Requests 高、RespMB 高 → 高頻且大回應（egress 主要來源）
#   · Requests 極高、AvgKB 小 → 高頻輪詢（egress 未必大，但 CPU／連線成本高）
# ============================================

param(
  [string]$Start = "2026-09-24T02:00:00Z",
  [string]$End = "2026-09-24T03:00:00Z",
  [string]$Service = "english-platform",
  [int]$MaxEntries = 60000,
  [int]$Top = 20
)

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "=== Cloud Run 請求分布分析（唯讀，Logging REST API） ==="
Write-Host "  service: $Service"
Write-Host "  視窗:    $Start .. $End"
Write-Host ""

# ---------- 認證 ----------
$token = (gcloud auth print-access-token 2>&1 | Select-Object -Last 1)
if (-not $token -or $token -notmatch '^ya29\.|^[A-Za-z0-9_\-\.]{40,}$') {
  Write-Host "  ❌ 無法取得 access token：$token" -ForegroundColor Red
  Write-Host "     請先執行（需開瀏覽器）：  gcloud auth login" -ForegroundColor Yellow
  Write-Host ""
  exit 1
}
$project = (gcloud config get-value project 2>$null).Trim()
if (-not $project) {
  Write-Host "  ❌ 未設定 GCP project（gcloud config set project <id>）" -ForegroundColor Red
  exit 1
}

# ---------- 查詢（分頁） ----------
$uri = 'https://logging.googleapis.com/v2/entries:list'
$headers = @{ Authorization = "Bearer $token" }
$filter = "resource.type=""cloud_run_revision"" AND resource.labels.service_name=""$Service"" AND httpRequest.requestUrl:* AND timestamp>=""$Start"" AND timestamp<""$End"""

$entries = New-Object System.Collections.Generic.List[object]
$pageToken = $null
$pages = 0

do {
  $body = @{
    resourceNames = @("projects/$project")
    filter        = $filter
    orderBy       = 'timestamp desc'
    pageSize      = 1000
  }
  if ($pageToken) { $body['pageToken'] = $pageToken }

  try {
    $resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' `
      -Body ($body | ConvertTo-Json -Depth 5) -TimeoutSec 120
  } catch {
    Write-Host "  ❌ Logging API 失敗：$($_.Exception.Message)" -ForegroundColor Red
    Write-Host "     （403 → 帳號需有 logging.viewer 或以上權限）" -ForegroundColor Yellow
    exit 1
  }

  foreach ($e in @($resp.entries)) { $entries.Add($e) }
  $pageToken = $resp.nextPageToken
  $pages++
} while ($pageToken -and $entries.Count -lt $MaxEntries)

if ($entries.Count -eq 0) {
  Write-Host "  視窗內沒有請求日誌。請確認服務名稱／時間窗（或該時段確實沒有流量）。"
  Write-Host ""
  exit 0
}

$truncated = [bool]$pageToken
Write-Host "  取得 $($entries.Count) 筆（$pages 頁）"
if ($truncated) {
  Write-Host "  ⚠️ 已達 -MaxEntries ($MaxEntries) → **可能截斷**，數字僅為下限。" -ForegroundColor Yellow
}
Write-Host ""

# ---------- 彙總 ----------
$agg = @{}
foreach ($e in $entries) {
  $url = $e.httpRequest.requestUrl
  $path = $url
  try { $path = ([uri]$url).AbsolutePath } catch { }

  $size = 0L
  if ($null -ne $e.httpRequest.responseSize) { $size = [long]$e.httpRequest.responseSize }

  if (-not $agg.ContainsKey($path)) { $agg[$path] = @{ Requests = 0; Bytes = 0L } }
  $agg[$path].Requests++
  $agg[$path].Bytes += $size
}

$rows = $agg.GetEnumerator() |
  ForEach-Object {
    [pscustomobject]@{
      Path         = $_.Key
      Requests     = $_.Value.Requests
      RespTotalMB  = [math]::Round($_.Value.Bytes / 1MB, 2)
      AvgKB        = if ($_.Value.Requests -gt 0) { [math]::Round(($_.Value.Bytes / $_.Value.Requests) / 1KB, 1) } else { 0 }
    }
  } |
  Sort-Object Requests -Descending

$rows | Select-Object -First $Top | Format-Table -AutoSize

$totalReq = ($rows | Measure-Object Requests -Sum).Sum
$totalMB = [math]::Round(($rows | Measure-Object RespTotalMB -Sum).Sum, 2)
Write-Host "  合計：$totalReq 個請求 / 回應 ${totalMB} MB（視窗長度 1 小時）"
Write-Host "  提示：把 Requests 乘以每日活躍時數即可外推；回應大小≠DB egress，但兩者同源。"
Write-Host ""
