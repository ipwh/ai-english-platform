// ============================================
// API: POST /api/ielts/admin/questions/[id]/validate — run machine validation
// ============================================
// On success: DRAFT → AI_VALIDATED → QA_REQUIRED (automation never goes
// further). On failure: status unchanged, report stored for the author.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { validateIeltsQuestionById } from '@/modules/ielts';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { id } = await params;
  try {
    const result = await validateIeltsQuestionById(id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ outcome: result.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
