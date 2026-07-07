// ============================================
// API: /api/classes — 班級 CRUD
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

// GET /api/classes
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const teacherId = searchParams.get('teacherId');

  const classes = await db.class.findMany({
    where: teacherId ? {
      teachers: { some: { teacherId } },
    } : undefined,
    include: {
      _count: { select: { students: true, assignments: true } },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ classes });
}

// POST /api/classes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, gradeLevel, academicYear } = body;

    if (!name || !gradeLevel) {
      return NextResponse.json({ error: 'name, gradeLevel 為必填' }, { status: 400 });
    }

    const cls = await db.class.create({
      data: { name, gradeLevel, academicYear: academicYear || '2025-2026' },
    });

    return NextResponse.json({ class: cls }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
