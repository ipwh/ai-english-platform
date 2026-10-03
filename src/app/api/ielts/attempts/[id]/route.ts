// ============================================
// API: GET /api/ielts/attempts/[id] — attempt detail + feedback
// ============================================
// Authorization: owner, admin, or teacher with a class relation to the owner.
// One user can never read another user's attempt.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { getIeltsAttemptDetail } from '@/modules/ielts';
import { resolveTeacherStudentClass } from '@/modules/teacher/copilot/services/teacher-copilot-service';

const RATE_LIMIT = { maxRequests: 60, windowMs: 60_000 };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-attempt-detail:${authResult.userId}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const { id } = await params;
  try {
    const result = await getIeltsAttemptDetail(id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const ownerId = result.data.userId;
    const canAccess =
      authResult.userId === ownerId ||
      authResult.role === 'admin' ||
      (authResult.role === 'teacher' && Boolean(await resolveTeacherStudentClass(authResult.userId, ownerId)));
    if (!canAccess) {
      return NextResponse.json({ error: 'You cannot view this attempt' }, { status: 403 });
    }

    return NextResponse.json({ attempt: result.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
