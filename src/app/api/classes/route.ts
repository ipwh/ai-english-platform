// ============================================
// API: /api/classes — 班級 CRUD
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { cacheFor, CACHE_MEDIUM } from '@/shared/utils/api-cache';
import { z } from 'zod';

const createClassSchema = z.object({
  name: z.string().min(1, 'name 為必填').max(10),
  gradeLevel: z.enum(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']),
  academicYear: z.string().max(10).optional(),
});

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

    return NextResponse.json({ classes }, { headers: cacheFor(CACHE_MEDIUM) });
  } catch (err: unknown) {
    logger.error({ module: 'classes', error: err instanceof Error ? err.message : String(err) }, 'Classes GET failed');
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
    const parsed = createClassSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      return NextResponse.json({ error: '輸入驗證失敗', details: errors }, { status: 400 });
    }
    const { name, gradeLevel, academicYear } = parsed.data;

    const cls = await db.class.create({
      data: { name, gradeLevel, academicYear: academicYear || '2025-2026' },
    });

    return NextResponse.json({ class: cls }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
