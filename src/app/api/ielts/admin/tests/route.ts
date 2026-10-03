// ============================================
// API: GET /api/ielts/admin/tests — authoring/QA console test list
// ============================================
// Teacher/admin only. Returns every IELTS test with its per-question status
// breakdown so reviewers can see what is waiting at QA_REQUIRED.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { listAdminIeltsTests } from '@/modules/ielts';

const RATE_LIMIT = { maxRequests: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-admin-tests:${authResult.userId ?? 'unknown'}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const tests = await listAdminIeltsTests();
    return NextResponse.json({ tests });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
