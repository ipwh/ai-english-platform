// ============================================
// GET /api/admin/classes — 班級管理 CRUD
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyAdmin } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const classes = await db.class.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { students: true, assignments: true } },
      },
    });

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

    const cls = await db.class.upsert({
      where: { name },
      update: { gradeLevel, academicYear: academicYear || undefined },
      create: { name, gradeLevel, academicYear: academicYear || '2025-2026' },
    });

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

    await db.class.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
