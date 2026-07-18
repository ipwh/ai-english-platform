// ============================================
// POST /api/feedback — 用戶回報（TTS、UI、內容問題）
// 記錄到 console + 可擴展至 DB/第三方服務
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, payload } = body as { type: string; payload: Record<string, unknown> };

    // Structured logging for monitoring
    console.log(JSON.stringify({
      service: 'feedback',
      type: type || 'unknown',
      userId: authResult.userId,
      timestamp: new Date().toISOString(),
      payload,
    }));

    // TODO: persist to DB for analysis
    // await db.feedback.create({ data: { userId: authResult.userId, type, payload: JSON.stringify(payload) } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[feedback]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
