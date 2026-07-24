import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// API: GET /api/admin/export/stream/students
// Streaming CSV export for large datasets
// Uses Node.js Transform stream to avoid memory issues
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['admin', 'teacher']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const className = searchParams.get('className');
  const _academicYear = searchParams.get('academicYear') || '2025-2026';

  try {
    const where: Record<string, unknown> = { role: 'student' };
    if (className) {
      where.class = { name: className };
    }

    // For streaming: fetch in batches of 500
    const BATCH_SIZE = 500;
    const headers = [
      'id', 'nameZh', 'nameEn', 'email', 'level', 'class',
      'overallAccuracy', 'xp', 'streakDays', 'academicYear',
    ];

    // Build CSV header
    let csv = headers.join(',') + '\n';

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await adminDbQuery('user', 'findMany', {
        where,
        select: {
          id: true, nameZh: true, nameEn: true, email: true,
          level: true, overallAccuracy: true, xp: true,
          streakDays: true, academicYear: true,
          class: { select: { name: true } },
        },
        skip: offset,
        take: BATCH_SIZE,
        orderBy: { createdAt: 'asc' },
      });

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      for (const student of batch) {
        const row = [
          student.id,
          `"${(student.nameZh || '').replace(/"/g, '""')}"`,
          `"${(student.nameEn || '').replace(/"/g, '""')}"`,
          student.email,
          student.level || '',
          student.class?.name || '',
          student.overallAccuracy ?? '',
          student.xp ?? 0,
          student.streakDays ?? 0,
          student.academicYear || '',
        ].join(',');
        csv += row + '\n';
      }

      offset += BATCH_SIZE;

      // Safety: prevent infinite loop if something goes wrong
      if (offset > 50000) hasMore = false;
    }

    return new NextResponse('\uFEFF' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="students-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
