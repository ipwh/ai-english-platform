// ============================================
// API: POST /api/ielts/admin/tests/[id]/transition — human test transitions
// ============================================
// Teacher/admin only. The reviewer identity is ALWAYS taken from the verified
// session (a forged body id is ignored). Publishing a test requires every
// question to be PUBLISHED first (enforced in admin-service).
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { transitionIeltsTestStatus } from '@/modules/ielts';

const RATE_LIMIT = { maxRequests: 30, windowMs: 60_000 };
const ALLOWED_TARGETS = new Set(['HUMAN_APPROVED', 'PUBLISHED', 'REJECTED', 'QA_REQUIRED', 'DRAFT']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-admin-test-transition:${authResult.userId}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const { id } = await params;
  try {
    const body = (await request.json()) as { to?: string };
    if (!body.to || !ALLOWED_TARGETS.has(body.to)) {
      return NextResponse.json(
        { error: 'to must be one of ' + [...ALLOWED_TARGETS].join(', ') },
        { status: 400 },
      );
    }
    const result = await transitionIeltsTestStatus({
      testId: id,
      to: body.to as never,
      reviewerId: authResult.userId, // session identity — never the request body
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ test: result.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
