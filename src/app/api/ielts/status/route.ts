// ============================================
// API: GET /api/ielts/status — governance state (honest, never upgraded)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { getGovernanceSnapshot } from '@/modules/ielts';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  return NextResponse.json({
    subsystem: 'IELTS',
    labelling: 'IELTS-style practice — platform practice estimates only',
    ...getGovernanceSnapshot(),
  });
}
