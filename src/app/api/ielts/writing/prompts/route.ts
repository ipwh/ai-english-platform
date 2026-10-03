// ============================================
// API: GET /api/ielts/writing/prompts — published Writing task bank
// ============================================
// Returns published Writing prompts (taskType + full official-style task text)
// so the writing practice page can offer the platform bank instead of only the
// built-in samples. Only PUBLISHED tests are ever served.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { listPublishedWritingPrompts } from '@/modules/ielts';

const RATE_LIMIT = { maxRequests: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-writing-prompts:${authResult.userId ?? 'unknown'}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const testType = searchParams.get('testType') ?? undefined;
  if (testType !== undefined && testType !== 'ACADEMIC' && testType !== 'GENERAL_TRAINING') {
    return NextResponse.json({ error: 'testType must be ACADEMIC or GENERAL_TRAINING' }, { status: 400 });
  }

  try {
    const prompts = await listPublishedWritingPrompts(testType);
    return NextResponse.json({ prompts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
