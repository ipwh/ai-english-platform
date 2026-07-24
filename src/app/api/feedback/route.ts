// ============================================
// POST /api/feedback — 用戶回報（TTS、UI、內容問題）
// Persisted to DB for teacher/ admin analysis
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { createFeedback } from '@/modules/student';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, payload } = body as { type: string; payload: Record<string, unknown> };

    // Persist to DB for analysis
    const feedbackType = type || 'unknown';
    await createFeedback({
      userId: authResult.userId!,
      type: feedbackType,
      payload: payload || {},
    });

    logger.info({ module: 'feedback', type: feedbackType, userId: authResult.userId }, 'Feedback submitted');

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error';
    logger.error({ module: 'feedback', error: msg }, 'Failed to persist feedback');
    return NextResponse.json({ error: 'Feedback could not be saved. Please try again.' }, { status: 500 });
  }
}
