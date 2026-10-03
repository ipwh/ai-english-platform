// ============================================
// API: /api/ielts/admin/questions — content authoring (teacher/admin)
// ============================================
// GET  ?status=&skill=&testId= — list questions for review
// POST — create a DRAFT question (never published automatically)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import {
  createIeltsQuestionDraft,
  listAdminQuestions,
  type IeltsQuestionDraftInput,
} from '@/modules/ielts/services/admin-service';

const RATE_LIMIT = { maxRequests: 30, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const questions = await listAdminQuestions({
      status: searchParams.get('status') ?? undefined,
      skill: searchParams.get('skill') ?? undefined,
      testId: searchParams.get('testId') ?? undefined,
    });
    return NextResponse.json({ questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-admin-questions:${authResult.userId}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = (await request.json()) as Partial<IeltsQuestionDraftInput>;
    if (!body.testId || !body.questionType || !body.skill || !body.prompt) {
      return NextResponse.json({ error: 'testId, questionType, skill and prompt are required' }, { status: 400 });
    }

    const result = await createIeltsQuestionDraft(body as IeltsQuestionDraftInput);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ question: result.data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
