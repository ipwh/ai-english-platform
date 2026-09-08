# ============================================
# Setup Google Sheets roster AUTO-SYNC
#   Cloud Run (english-platform) + Cloud Scheduler
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/setup-roster-autosync.ps1
#
# Optional params:
#   -ProjectId "amiable-nirvana-500300-a0"   (default: gcloud config project)
#   -Region    "asia-east2"
#   -Schedule  "0 5 * * *"      (cron syntax, default daily 05:00)
#   -TimeZone  "Asia/Hong_Kong"
#   -Secret    "..."            (reuse existing CRON_SECRET; else auto-generate)
#
# Prereqs:
#   1. gcloud CLI installed and authenticated (gcloud auth login)
#   2. IAM: Cloud Run Admin + Cloud Scheduler Admin
#   3. Cloud Run env GOOGLE_SHEETS_CLASS_ROSTER_ID already points to the
#      LATEST roster sheet (set in Cloud Console)
#
# This script (ASCII only so it parses under any code page):
#   - Adds/updates CRON_SECRET on the Cloud Run service (keeps other env)
#   - Creates/updates Cloud Scheduler HTTP job "roster-sync"
#     -> daily GET {service}/api/admin/sync-sheets/cron (x-cron-secret header)
#   - Stores CRON_SECRET in local git-ignored file .roster-sync-secret
# ============================================

param(
  [string]$ProjectId = "",
  [string]$Region = "asia-east2",
  [string]$ServiceName = "english-platform",
  [string]$ServiceUrl = "",   # optional override; default = Cloud Run status.url
  [string]$Schedule = "0 5 * * *",
  [string]$TimeZone = "Asia/Hong_Kong",
  [string]$Secret = ""
)

# IMPORTANT: do not use $ErrorActionPreference = "Stop" in this script.
# gcloud's PS1 launcher emits stderr noise (e.g. the Windows Store 'python3'
# alias when CLOUDSDK_PYTHON is unset) which would become a TERMINATING error
# under Stop and abort the script. We rely on $LASTEXITCODE checks instead.
$ErrorActionPreference = "Continue"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$SecretFile = Join-Path $Root ".roster-sync-secret"

# Pin gcloud to a real Python so its launcher never probes the Store
# 'python3' stub (avoids "Python was not found" noise / hard failures).
$realPython = "C:\Python314\python.exe"
if ((Test-Path $realPython) -and (-not $env:CLOUDSDK_PYTHON)) {
  $env:CLOUDSDK_PYTHON = $realPython
}

function Write-Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "   OK: $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Host "   WARN: $m" -ForegroundColor Yellow }

# ---- 0. gcloud check ----
Write-Step "Checking gcloud"
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  # Fallback: locate a per-user SDK install and prepend it to PATH.
  $candidates = @(
    (Join-Path $env:USERPROFILE 'google-cloud-sdk\bin'),
    "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin",
    "$env:ProgramFiles\Google\Cloud SDK\google-cloud-sdk\bin"
  )
  foreach ($c in $candidates) {
    if ((Test-Path (Join-Path $c 'gcloud.cmd')) -or (Test-Path (Join-Path $c 'gcloud.ps1'))) {
      $env:Path = $c + ';' + $env:Path
      break
    }
  }
}
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  Write-Host "gcloud not found. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
  exit 1
}
if (-not $ProjectId) { $ProjectId = (gcloud config get-value project 2>$null) }
if (-not $ProjectId) {
  Write-Host "Cannot determine GCP project. Pass -ProjectId or run: gcloud config set project <PROJECT_ID>"
  exit 1
}
Write-Ok "Project: $ProjectId | Region: $Region | Service: $ServiceName"

# ---- 1. Get Cloud Run service URL ----
Write-Step "Getting Cloud Run service URL"
# Always describe the service (gives us status.url AND env var names).
$svcJson = gcloud run services describe $ServiceName --project=$ProjectId --region=$Region --format=json 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Cloud Run service not found or no permission (need Cloud Run Admin)."
  exit 1
}
$svc = $svcJson | ConvertFrom-Json
if ($ServiceUrl) {
  $ServiceUrl = $ServiceUrl.TrimEnd('/')
  Write-Ok "Using provided ServiceUrl: $ServiceUrl"
} else {
  $ServiceUrl = $svc.status.url.TrimEnd('/')
  Write-Ok "Service URL: $ServiceUrl"
}

# Check env has GOOGLE_SHEETS_CLASS_ROSTER_ID (values are masked; key presence only)
$envNames = @($svc.spec.template.spec.containers[0].env | ForEach-Object { $_.name })
if ($envNames -notcontains 'GOOGLE_SHEETS_CLASS_ROSTER_ID') {
  Write-Warn "Cloud Run env is missing GOOGLE_SHEETS_CLASS_ROSTER_ID. Set it in Cloud Console to the LATEST roster sheet, otherwise scheduled sync reads nothing."
} else {
  Write-Ok "GOOGLE_SHEETS_CLASS_ROSTER_ID present on Cloud Run env."
}

# ---- 2. Determine / generate CRON_SECRET ----
Write-Step "Determining CRON_SECRET"
$cronSecret = ""
$forceNew = $false
if ($Secret) {
  $cronSecret = $Secret.Trim()
  Write-Ok "Using CRON_SECRET provided via -Secret"
} elseif (Test-Path $SecretFile) {
  $cronSecret = (Get-Content $SecretFile -Raw).Trim()
  if ($cronSecret.Length -lt 20 -or $cronSecret -match '^A+$') {
    # Degenerate secret (e.g. all-zero bytes base64-encode to all 'A').
    # Do NOT reuse it - regenerate a strong one.
    Write-Warn "Existing CRON_SECRET is degenerate (too short / all-zero). Regenerating a strong one."
    $cronSecret = ""
    $forceNew = $true
  } else {
    Write-Ok "Reusing existing CRON_SECRET ($SecretFile)"
  }
}
if (-not $cronSecret) {
  # PS 5.1 uses .NET Framework: RandomNumberGenerator.Fill is unavailable,
  # use RNGCryptoServiceProvider (cryptographically strong) instead.
  $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
  $bytes = New-Object byte[] 32
  $rng.GetBytes($bytes)
  $rng.Dispose()
  # base64url (strip = + / so it is safe in header / URL)
  $cronSecret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  if ($forceNew) { Write-Ok "Generated a new strong CRON_SECRET" }
  else { Write-Ok "Generated a new CRON_SECRET" }
}
if (-not $cronSecret) { Write-Host "CRON_SECRET is empty. Aborting."; exit 1 }

# Persist to git-ignored local file so re-runs reuse the same secret
Set-Content -Path $SecretFile -Value $cronSecret -NoNewline
try { & icacls.exe $SecretFile /inheritance:r /grant:r ("{0}:(R,W)" -f $env:USERNAME) 2>$null | Out-Null } catch { }
Write-Ok "CRON_SECRET stored at $SecretFile (git-ignored)"

# ---- 3. Set CRON_SECRET on Cloud Run (keeps other env) ----
Write-Step "Updating CRON_SECRET on Cloud Run"
gcloud run services update $ServiceName --project=$ProjectId --region=$Region --update-env-vars="CRON_SECRET=$cronSecret"
if ($LASTEXITCODE -ne 0) { Write-Host "Failed to update Cloud Run env."; exit 1 }
Write-Ok "CRON_SECRET updated (other env vars preserved)"

# ---- 4. Create / update Cloud Scheduler job ----
Write-Step "Creating / updating Cloud Scheduler job (roster-sync)"
# Ensure the API is enabled BEFORE touching jobs, so gcloud never blocks on
# the interactive "enable and retry?" prompt.
Write-Step "Ensuring Cloud Scheduler API is enabled"
gcloud services enable cloudscheduler.googleapis.com --project=$ProjectId 2>$null
if ($LASTEXITCODE -ne 0) { Write-Warn "Enable returned non-zero (may already be enabled); continuing." }
Write-Ok "cloudscheduler.googleapis.com ready"

$jobName = "roster-sync"
$uri = "$ServiceUrl/api/admin/sync-sheets/cron"
gcloud scheduler jobs describe $jobName --location=$Region --project=$ProjectId *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Ok "Job exists; updating schedule and secret..."
  gcloud scheduler jobs update http $jobName --location=$Region --project=$ProjectId --quiet `
    --schedule="$Schedule" --uri="$uri" --http-method=GET `
    --headers="x-cron-secret=$cronSecret" --time-zone="$TimeZone" `
    --description="Daily Google Sheets roster sync"
} else {
  gcloud scheduler jobs create http $jobName --location=$Region --project=$ProjectId --quiet `
    --schedule="$Schedule" --uri="$uri" --http-method=GET `
    --headers="x-cron-secret=$cronSecret" --time-zone="$TimeZone" `
    --description="Daily Google Sheets roster sync"
}
if ($LASTEXITCODE -ne 0) {
  Write-Host "Failed to create scheduler job. Check: 1) Cloud Scheduler API enabled 2) account has Cloud Scheduler Admin."
  exit 1
}
Write-Ok "Scheduler job 'roster-sync' ready: $uri"

# ---- 5. Done ----
Write-Step "Done"
Write-Host "   Schedule: $Schedule ($TimeZone) -> $uri"
Write-Host ""
Write-Host "Test (live run): gcloud scheduler jobs run $jobName --location=$Region --project=$ProjectId"
Write-Host "Preview only:    curl -H 'x-cron-secret: <secret>' '$($uri)?dryRun=true'"
Write-Host ""
Write-Host "Note: the cron + sync-sheets code must already be deployed to Cloud Run (push to main auto-deploys) for the scheduled call to run a sync."

