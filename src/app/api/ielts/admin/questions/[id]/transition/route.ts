// ============================================
// API: POST /api/ielts/admin/questions/[id]/transition — human review actions
// ============================================
// Body: { to: 'HUMAN_APPROVED' | 'PUBLISHED' | 'REJECTED', reason? }
// Human reviewer id comes from the authenticated session (never the body).
// The status machine blocks AI actors and requires reviewer stamps.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { transitionIeltsQuestionStatus } from '@/modules/ielts';
import type { IeltsValidationStatus } from '@/modules/ielts';

const ALLOWED_TARGETS: IeltsValidationStatus[] = ['HUMAN_APPROVED', 'PUBLISHED', 'REJECTED'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const { id } = await params;
  try {
    const body = (await request.json()) as { to?: string; reason?: string };
    if (!body.to || !ALLOWED_TARGETS.includes(body.to as IeltsValidationStatus)) {
      return NextResponse.json({ error: 'to must be one of ' + ALLOWED_TARGETS.join(', ') }, { status: 400 });
    }

    const result = await transitionIeltsQuestionStatus({
      questionId: id,
      to: body.to as IeltsValidationStatus,
      reviewerId: authResult.userId,
      reason: body.reason,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ question: result.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
