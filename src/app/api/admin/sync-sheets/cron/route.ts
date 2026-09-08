// ============================================
// API: GET /api/admin/sync-sheets/cron
// Cron-compatible endpoint for scheduled Google Sheets sync
// 用作排程觸發（Google Cloud Scheduler / Vercel Cron）：
//   Path: /api/admin/sync-sheets/cron?secret=YOUR_CRON_SECRET
//   或 以 header 傳送: x-cron-secret: YOUR_CRON_SECRET
//   Schedule: 0 5 * * *（每日 05:00，依 job 所在時區）
//
// 部署注意：baseUrl 會自動由本請求的 origin 推導，Cloud Run 毋須
// 額外設定 VERCEL_URL / NEXT_PUBLIC_APP_URL。
// ============================================

import { NextRequest, NextResponse } from 'next/server';

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
    // 推導同一服務的絕對 base URL（Cloud Run / Vercel / 本機皆可）
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
      request.nextUrl.origin;

    // 呼叫主同步 endpoint（server-to-server，以 x-cron-secret 授權）
    const res = await fetch(`${baseUrl}/api/admin/sync-sheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
      body: JSON.stringify({ dryRun }),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      dryRun,
      status: res.status,
      result: data,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
