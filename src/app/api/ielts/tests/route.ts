// ============================================
// API: GET /api/ielts/tests — list published IELTS practice tests
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { logger } from '@/shared/logger/logger';
import { ensureStarterContent, listPublishedIeltsTests } from '@/modules/ielts';

const RATE_LIMIT = { maxRequests: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    ...RATE_LIMIT,
    identifier: `ielts-tests:${authResult.userId ?? 'unknown'}`,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const testType = searchParams.get('testType') ?? undefined;
  const skill = searchParams.get('skill') ?? undefined;

  try {
    // 2026-10-03 (V): first load provisions the platform starter sets so
    // students have practice immediately after login. Idempotent; a provisioning
    // failure must never break the catalogue (the AI gate is unaffected: AI
    // content still requires human approval).
    try {
      await ensureStarterContent();
    } catch (err) {
      logger.warn(
        { module: 'ielts', event: 'ielts.starter.provision_failed', error: err instanceof Error ? err.message : String(err) },
        'IELTS starter content provisioning failed (catalogue continues)',
      );
    }
    const tests = await listPublishedIeltsTests({ testType, skill });
    return NextResponse.json({ tests });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
