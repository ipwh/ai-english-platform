// ============================================
// PUT /api/admin/users/[userId] — 編輯單一使用者
// 僅 admin 可存取
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifySessionToken } from '@/lib/jwt';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
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

    const { userId } = await params;
    const body = await request.json();

    // ---- 查詢現有使用者 ----
    const existing = await db.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return NextResponse.json({ error: '使用者不存在' }, { status: 404 });
    }

    // ---- 構建更新資料 ----
    const updateData: Record<string, unknown> = {};

    // 通用欄位
    if (body.nameZh !== undefined) updateData.nameZh = body.nameZh;
    if (body.nameEn !== undefined) updateData.nameEn = body.nameEn;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.role !== undefined) updateData.role = body.role;

    // 學生專屬
    if (body.level !== undefined) updateData.level = body.level;
    if (body.classNumber !== undefined) updateData.classNumber = body.classNumber;
    if (body.overallAccuracy !== undefined) updateData.overallAccuracy = body.overallAccuracy;
    if (body.academicYear !== undefined) updateData.academicYear = body.academicYear;

    // 班級關聯：從 className 解析
    if (body.className !== undefined) {
      const cls = await db.class.upsert({
        where: { name: body.className },
        update: {},
        create: {
          name: body.className,
          gradeLevel: body.level || existing.level || 'S4',
        },
      });
      updateData.classId = cls.id;
    }

    // 教師專屬
    if (body.subjects !== undefined) {
      updateData.subjects = typeof body.subjects === 'string'
        ? body.subjects
        : JSON.stringify(body.subjects);
    }
    if (body.department !== undefined) updateData.department = body.department;

    // ---- 更新 ----
    const updated = await db.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        nameZh: true,
        nameEn: true,
        role: true,
        level: true,
        classNumber: true,
        overallAccuracy: true,
        academicYear: true,
        subjects: true,
        department: true,
        class: { select: { id: true, name: true, gradeLevel: true } },
      },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    console.error('[admin/users PUT] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
