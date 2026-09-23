// ============================================
// API: POST /api/mistakes/bulk — Bulk mistake operations
// Actions: markAllReviewed, deleteAll, exportCSV
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth, verifyStudentSelfAccess } from '@/shared/auth/api-auth';
import { bulkUpdateMistakes, bulkDeleteMistakes } from '@/modules/student';
import { MistakeRepo } from '@/modules/repositories';
import { nextMistakeReviewState } from '@/modules/mistake/db/services/mistake-tracker';

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

    // R3.10-K Step 6: students may only bulk-operate on their own mistakes.
    const ownership = verifyStudentSelfAccess(authResult, studentId);
    if (ownership) return ownership;

    const where = ids?.length
      ? { id: { in: ids }, studentId }
      : { studentId };

    switch (action) {
      case 'markAllReviewed': {
        // 2026-09-23 稽核修正：批次標記已複習必須**同時套用 SRS 排程**
        // （與 PATCH /api/mistakes 共用 nextMistakeReviewState）。
        // 舊碼只設 reviewed: true，nextReviewDate 仍是 null，而
        // listDueMistakesForReview 把 null 視為「從未排程 = 到期」→ 同一批
        // 卡片永遠留在每日複習佇列，擠佔 50 張上限（違反「SRS 單一 owner」）。
        const rows = await MistakeRepo.listMistakesMatching(where);
        const now = new Date();
        let updated = 0;
        for (const row of rows) {
          const schedule = nextMistakeReviewState(row, 4, now);
          await MistakeRepo.updateMistake(row.id, { reviewed: true, ...schedule });
          updated += 1;
        }
        return NextResponse.json({ updated });
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
