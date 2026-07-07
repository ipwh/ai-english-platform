// ============================================
// GET /api/admin/export/teachers
// 匯出完整教師資料
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifySessionToken } from '@/lib/jwt';

export async function GET(request: NextRequest) {
  try {
    // ---- 認證 ----
    const token =
      request.cookies.get('session_token')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', '') ||
      '';
    const session = await verifySessionToken(token);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    // ---- 查詢所有教師 ----
    const teachers = await db.user.findMany({
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

    const enriched = teachers.map(t => {
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
      return new NextResponse(csvRows.join('\n'), {
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
    console.error('[admin/export/teachers] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
