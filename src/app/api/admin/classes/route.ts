import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// GET /api/admin/classes — 班級管理 CRUD
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/shared/auth/admin-auth';
import { logger } from '@/shared/logger/logger';
import { syncClassToSheet } from '@/shared/google/sheets-sync';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const classes = await adminDbQuery('class', 'findMany', {
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { students: true, assignments: true } },
      },
    }) as Array<{id: string; name: string; gradeLevel: string; academicYear: string; createdAt: string; _count: {students: number; assignments: number}}>;

    return NextResponse.json({
      classes: classes.map(c => ({
        id: c.id,
        name: c.name,
        gradeLevel: c.gradeLevel,
        academicYear: c.academicYear,
        studentCount: c._count.students,
        assignmentCount: c._count.assignments,
        createdAt: c.createdAt,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const body = await request.json();
    const { name, gradeLevel, academicYear } = body;

    if (!name || !gradeLevel) {
      return NextResponse.json({ error: '請提供 name 和 gradeLevel' }, { status: 400 });
    }

    const cls = await adminDbQuery('class', 'upsert', {
      where: { name },
      update: { gradeLevel, academicYear: academicYear || undefined },
      create: { name, gradeLevel, academicYear: academicYear || '2025-2026' },
    });

    // Auto-link new class to all existing teachers AND admins so they can assign work to it
    try {
      const educators = await adminDbQuery('user', 'findMany', {
        where: { role: { in: ['teacher', 'admin'] } },
        select: { id: true, role: true },
      });
      for (const educator of educators) {
        await adminDbQuery('teacherClass', 'upsert', {
          where: { teacherId_classId: { teacherId: educator.id, classId: cls.id } },
          update: {},
          create: { teacherId: educator.id, classId: cls.id },
        });
      }
      logger.info({ module: 'admin-classes', classId: cls.id, educatorCount: educators.length }, 'Auto-linked class to educators');
    } catch (err) {
      logger.error({ module: 'admin-classes', classId: cls.id, error: err instanceof Error ? err.message : String(err) }, 'Failed to auto-link class to educators');
    }

    // Fire-and-forget: sync to Google Sheets
    syncClassToSheet(cls.name, cls.gradeLevel, cls.academicYear);

    return NextResponse.json({ success: true, class: cls });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '請提供 class id' }, { status: 400 });

    await adminDbQuery('class', 'delete', { where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
