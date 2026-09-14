// ============================================
// API: GET /api/admin/sync-sheets/cron
// Cron-compatible endpoint for scheduled Google Sheets sync
// 用作排程觸發（Google Cloud Scheduler / Cloud Run Jobs）：
//   Path: /api/admin/sync-sheets/cron?secret=YOUR_CRON_SECRET
//   或 以 header 傳送: x-cron-secret: YOUR_CRON_SECRET
//   Schedule: 0 5 * * *（每日 05:00，依 job 所在時區）
//
// 實作：in-process 直接呼叫 sync-sheets 的 POST handler，毋須對自身發
// HTTP 自呼叫（Cloud Run 上 self-fetch 會失敗 "fetch failed"）。
// ============================================

import { NextRequest, NextResponse } from 'next/server';
// In-process invocation of the sync handler (sibling route).
import { POST as runSync } from '../route';

export async function GET(request: NextRequest) {
  // 🔒 接受 query ?secret= 或 header x-cron-secret（避免 secret 留在網址/日誌）
  const secret =
    request.nextUrl.searchParams.get('secret') ||
    request.headers.get('x-cron-secret') ||
    '';
  const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';

  const CRON_SECRET = process.env.CRON_SECRET;
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized. Set CRON_SECRET env var and pass ?secret=... or x-cron-secret header.' },
      { status: 401 },
    );
  }

  try {
    // Build an in-process request carrying the cron secret; the sync handler
    // authorizes it via x-cron-secret (no admin session needed for cron).
    const inner = new NextRequest(`${request.nextUrl.origin}/api/admin/sync-sheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
      body: JSON.stringify({ dryRun }),
    });
    return await runSync(inner);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
