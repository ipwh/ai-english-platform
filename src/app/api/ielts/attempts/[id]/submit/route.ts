// ============================================
// API: POST /api/ielts/attempts/[id]/submit — server-side deterministic scoring
// ============================================
// Body: { answers: [{ questionId, answer }] }
// The server scores with the canonical answer keys; client correctness claims
// are never read (they are not part of the contract).
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { submitIeltsAttempt, type IeltsSubmittedAnswerInput } from '@/modules/ielts';

const RATE_LIMIT = { maxRequests: 20, windowMs: 60_000 };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-submit:${authResult.userId}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const { id } = await params;
  try {
    const body = (await request.json()) as { answers?: unknown };
    if (!Array.isArray(body.answers)) {
      return NextResponse.json({ error: 'answers must be an array' }, { status: 400 });
    }
    const answers: IeltsSubmittedAnswerInput[] = [];
    for (const item of body.answers) {
      const record = item as { questionId?: unknown; answer?: unknown };
      if (typeof record.questionId !== 'string' || typeof record.answer !== 'string') {
        return NextResponse.json(
          { error: 'Each answer requires { questionId: string, answer: string }' },
          { status: 400 },
        );
      }
      answers.push({ questionId: record.questionId, answer: record.answer });
    }

    const result = await submitIeltsAttempt({ userId: authResult.userId, attemptId: id, answers });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ result: result.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
