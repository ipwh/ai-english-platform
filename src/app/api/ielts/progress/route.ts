// ============================================
// API: GET /api/ielts/progress — practice progress for a student
// ============================================
// Owner by default; teachers (class relation) and admins may request
// ?studentId=. Counts come from SQL-level aggregation, never slice-derived.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { getIeltsProgress } from '@/modules/ielts';
import { resolveTeacherStudentClass } from '@/modules/teacher/copilot/services/teacher-copilot-service';

const RATE_LIMIT = { maxRequests: 30, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-progress:${authResult.userId}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId') ?? authResult.userId;

    const canAccess =
      studentId === authResult.userId ||
      authResult.role === 'admin' ||
      (authResult.role === 'teacher' && Boolean(await resolveTeacherStudentClass(authResult.userId, studentId)));
    if (!canAccess) {
      return NextResponse.json({ error: 'You cannot view this student\'s progress' }, { status: 403 });
    }

    const progress = await getIeltsProgress(studentId);
    return NextResponse.json({ progress });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
