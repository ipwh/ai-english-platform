// ============================================
// API: POST /api/mistakes/bulk — Bulk mistake operations
// Actions: markAllReviewed, deleteAll, exportCSV
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { bulkUpdateMistakes, bulkDeleteMistakes } from '@/modules/student';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { studentId, action, ids } = body as {
      studentId: string;
      action: 'markAllReviewed' | 'deleteSelected' | 'addAllToReview';
      ids?: string[];
    };

    if (!studentId || !action) {
      return NextResponse.json({ error: 'studentId and action required' }, { status: 400 });
    }

    const where = ids?.length
      ? { id: { in: ids }, studentId }
      : { studentId };

    switch (action) {
      case 'markAllReviewed': {
        const result = await bulkUpdateMistakes(where, { reviewed: true });
        return NextResponse.json({ updated: result.count });
      }

      case 'deleteSelected': {
        if (!ids?.length) {
          return NextResponse.json({ error: 'ids required for delete' }, { status: 400 });
        }
        const result = await bulkDeleteMistakes(where);
        return NextResponse.json({ deleted: result.count });
      }

      case 'addAllToReview': {
        const result = await bulkUpdateMistakes(where, { inReviewList: true });
        return NextResponse.json({ updated: result.count });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
