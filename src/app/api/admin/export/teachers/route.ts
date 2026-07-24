import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// GET /api/admin/export/teachers
// 匯出完整教師資料
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/shared/auth/admin-auth';
import { logger } from '@/shared/logger/logger';

export async function GET(request: NextRequest) {
  try {
    // ---- 認證：僅 admin（JWT + NextAuth 雙重支援）----
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    // ---- 查詢所有教師 ----
    const teachers = await adminDbQuery('user', 'findMany', {
      where: { role: 'teacher' },
      select: {
        id: true,
        email: true,
        nameZh: true,
        nameEn: true,
        subjects: true,
        department: true,
        joinedAt: true,
        taughtClasses: {
          select: {
            isFormTeacher: true,
            class: { select: { name: true, gradeLevel: true } },
          },
        },
        _count: {
          select: {
            assignments: true,
            uploadedMaterials: true,
          },
        },
      },
      orderBy: { nameEn: 'asc' },
    });

    const enriched = (teachers as Array<{id: string; email: string; nameZh: string | null; nameEn: string | null; subjects: string | null; department: string | null; joinedAt: Date | null; taughtClasses: Array<{isFormTeacher: boolean; class: {name: string}}>; _count: {assignments: number; uploadedMaterials: number}}>).map(t => {
      const classes = t.taughtClasses.map(tc => tc.class.name);
      const formClass = t.taughtClasses.find(tc => tc.isFormTeacher)?.class.name || '';

      return {
        teacherId: t.id,
        email: t.email,
        nameZh: t.nameZh,
        nameEn: t.nameEn,
        subjects: (() => {
          try { return JSON.parse(t.subjects || '[]'); } catch { return [t.subjects || 'English Language']; }
        })(),
        department: t.department || '',
        classes,
        formClass,
        assignmentsCreated: t._count.assignments,
        materialsUploaded: t._count.uploadedMaterials,
        joinedAt: t.joinedAt?.toISOString().split('T')[0] || '',
      };
    });

    // CSV 匯出
    if (format === 'csv') {
      const headers = [
        'teacherId', 'email', 'nameZh', 'nameEn', 'subjects', 'department',
        'classes', 'formClass', 'assignmentsCreated', 'materialsUploaded', 'joinedAt',
      ];
      const csvRows = [headers.join(',')];
      for (const t of enriched) {
        csvRows.push([
          t.teacherId, t.email, `"${t.nameZh || ''}"`, `"${t.nameEn || ''}"`,
          `"${t.subjects.join('|')}"`, t.department, `"${t.classes.join('|')}"`,
          t.formClass, t.assignmentsCreated, t.materialsUploaded, t.joinedAt,
        ].join(','));
      }
      return new NextResponse('\uFEFF' + csvRows.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="teachers_export.csv"',
        },
      });
    }

    return NextResponse.json({ teachers: enriched, total: enriched.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    logger.error({ module: 'admin-export-teachers', error: msg }, 'Export teachers failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
