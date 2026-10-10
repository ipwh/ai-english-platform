// ============================================
// API: /api/custom-practice/[setId]
// ============================================
// GET → the owner's practice set. Answer keys, rubrics and explanations are
//       NEVER included while the attempt is unsubmitted; once submitted, the
//       graded results (reference answers + explanations) are returned.
//
// Ownership is enforced by an owner-scoped query, so another student's set is
// reported as 404 — never 403, which would confirm that the id exists.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { getOwnedSet, getSubmissionWithResponses, toDeliveredResults, toDeliveredSet } from '@/modules/custom-practice';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ setId: string }> }) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated || !authResult.userId) {
    return NextResponse.json({ error: authResult.error ?? 'Please log in' }, { status: 401 });
  }

  const { setId } = await params;

  try {
    const set = await getOwnedSet(setId, authResult.userId);
    if (!set) {
      return NextResponse.json({ error: 'Practice set not found' }, { status: 404 });
    }

    const results = set.submission
      ? await getSubmissionWithResponses(setId, authResult.userId)
      : null;

    return NextResponse.json({
      set: toDeliveredSet(set, set.submission !== null),
      results: results ? toDeliveredResults(results) : null,
    });
  } catch (error) {
    logger.error(
      { module: 'custom-practice', error: error instanceof Error ? error.message : String(error) },
      'custom practice fetch failed'
    );
    return NextResponse.json({ error: 'Could not load this practice set.' }, { status: 500 });
  }
}
