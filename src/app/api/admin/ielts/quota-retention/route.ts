// ============================================
// API: GET /api/admin/ielts/quota-retention
// Scheduled (cron) retention for `IeltsGenerationQuota` — 2026-10-08 (Sprint 132)
// ============================================
// The IELTS on-demand generation quota stores one row per
// (student, Hong Kong day, bucket) and nothing reads a past day, so old rows are
// pure debt (~1 700 rows/day at ~850 students). This endpoint drains them in
// bounded batches; it NEVER issues one unbounded delete.
//
// Auth (mirrors /api/admin/sync-sheets/cron): server-to-server only.
//   ?secret=CRON_SECRET   or   header  x-cron-secret: CRON_SECRET
// When CRON_SECRET is not configured the endpoint is permanently disabled
// (fail-closed) — it never falls back to "no auth required".
//
// Usage
//   GET /api/admin/ielts/quota-retention?secret=...            → drain (batched)
//   GET /api/admin/ielts/quota-retention?secret=...&dryRun=true → count only
//
// Schedule (Google Cloud Scheduler, e.g. daily 03:30 HKT):
//   0 3 * * *   →  https://<service>/api/admin/ielts/quota-retention
//   with header `x-cron-secret: <CRON_SECRET>`
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { runIeltsQuotaRetention, IELTS_QUOTA_RETENTION_DAYS } from '@/modules/ielts';

export async function GET(request: NextRequest) {
  const secret =
    request.nextUrl.searchParams.get('secret') ||
    request.headers.get('x-cron-secret') ||
    '';
  const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'Retention endpoint disabled: CRON_SECRET is not configured.' },
      { status: 503 },
    );
  }
  if (secret !== cronSecret) {
    return NextResponse.json(
      { error: 'Unauthorized. Pass the cron secret via ?secret= or the x-cron-secret header.' },
      { status: 401 },
    );
  }

  try {
    const result = await runIeltsQuotaRetention({ dryRun });
    // Never echo the secret or any user-identifying data — counters only.
    return NextResponse.json({ retentionDays: IELTS_QUOTA_RETENTION_DAYS, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Retention run failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
