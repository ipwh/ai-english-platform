// ============================================
// API: GET /api/admin/sync-sheets/cron
// Cron-compatible endpoint for scheduled Google Sheets sync
// Configure in Vercel Dashboard → Settings → Cron Jobs:
//   Path: /api/admin/sync-sheets/cron?secret=YOUR_CRON_SECRET
//   Schedule: 0 */6 * * *  (every 6 hours)
// ============================================

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const dryRun = searchParams.get('dryRun') === 'true';

  // 🔒 Require secret for cron invocation
  const CRON_SECRET = process.env.CRON_SECRET;
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized. Set CRON_SECRET env var and pass ?secret=...' }, { status: 401 });
  }

  try {
    // Call the main sync endpoint internally
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || '';

    const res = await fetch(`${baseUrl}/api/admin/sync-sheets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun }),
    });

    const data = await res.json();
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      dryRun,
      result: data,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
