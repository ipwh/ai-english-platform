// Sprint 111: POST /api/writing-coach/analyze
// Now uses AI-powered WritingCoachService for deep analysis
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { z } from 'zod';
import { writingCoachV2Schema } from '@/modules/writing-coach/schemas';
import { writingCoachService, WritingScoringUnavailableError } from '@/modules/writing-coach/services/writing-coach-service';

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

    // Use AI-powered analysis
    const essay = {
      studentId: parsed.studentId,
      essayId: parsed.essayId,
      title: parsed.title,
      content: parsed.text,
      textType: parsed.textType || 'essay',
      gradeLevel: 'S4',
      wordCount: parsed.text.split(/\s+/).length,
      submittedAt: new Date().toISOString(),
    };

    const result = await writingCoachService.analyzeEssay(essay);

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: err.issues }, { status: 400 });
    }
    if (err instanceof WritingScoringUnavailableError) {
      // FAIL CLOSED: infrastructure/model failure is never a student mark.
      return NextResponse.json(
        { status: err.status, reason: err.message, retryable: err.retryable },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'writing-coach', error: message }, 'POST /api/writing-coach/analyze failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
