// ============================================
// API: /api/classes — 班級 CRUD
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/shared/db/db';
import { verifyApiAuth } from '@/shared/auth/api-auth';

// GET /api/classes
export async function GET(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get('teacherId');

    const classes = await db.class.findMany({
      where: {
        name: { not: 'Demo' },
        ...(teacherId ? { teachers: { some: { teacherId } } } : {}),
      },
      include: {
        _count: { select: { students: true, assignments: true } },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ classes });
  } catch (err: unknown) {
    console.error('[Classes GET]', err);
    return NextResponse.json({ error: 'Failed to load classes', classes: [] }, { status: 500 });
  }
}

// POST /api/classes
export async function POST(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

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
