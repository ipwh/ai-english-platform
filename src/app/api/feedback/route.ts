// ============================================
// POST /api/feedback — 用戶回報（TTS、UI、內容問題）
// Persisted to DB for teacher/ admin analysis
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { db } from '@/shared/db/db';
import { logger } from '@/shared/logger/logger';
import { validateRequest, feedbackCreateSchemaApi } from '@/shared/validation/schemas';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    // 🔒 Zod validation
    const body = await request.json();
    const parsed = validateRequest(feedbackCreateSchemaApi, body);
    const { type, payload } = parsed;
    const feedbackType = type;
    await db.feedback.create({
      data: {
        userId: authResult.userId!,
        type: feedbackType,
        payload: JSON.stringify(payload || {}),
      },
    });

    logger.info({ module: 'feedback', type: feedbackType, userId: authResult.userId }, 'Feedback submitted');

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error';
    // Graceful fallback: if DB fails, still acknowledge the feedback
    logger.error({ module: 'feedback', error: msg }, 'Failed to persist feedback');
    return NextResponse.json({ success: true, warning: 'Feedback received but could not be saved' });
  }
}
