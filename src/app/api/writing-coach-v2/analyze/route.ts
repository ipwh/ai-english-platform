// Sprint 36: POST /api/writing-coach-v2/analyze
// Formula-based writing analysis: 8 dimensions + band prediction + checklist
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { z } from 'zod';
import { writingCoachV2Schema } from '@/modules/writing-coach-v2/schemas';
import { analyzeEssay } from '@/modules/writing-coach-v2/services/writing-coach-v2-service';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = writingCoachV2Schema.parse(body);

    // Ownership check
    if (
      authResult.role !== 'teacher' &&
      authResult.role !== 'admin' &&
      parsed.studentId !== authResult.userId
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = analyzeEssay(parsed);

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: err.issues }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'writing-coach-v2', error: message }, 'POST /api/writing-coach-v2/analyze failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
