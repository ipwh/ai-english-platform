// ============================================
// GET /api/admin/users — 分頁查詢所有使用者
// POST /api/admin/users — 管理員手動新增使用者
// 支援搜尋、篩選（role, level, className）
// 僅 admin 可存取
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { listUsersAdmin, countUsers, listAllClasses, findUserByEmail, upsertClass, createUser } from '@/modules/admin/services/admin-service';
import { verifyAdmin } from '@/shared/auth/admin-auth';
import { logger } from '@/shared/logger/logger';
import { hashPasswordSync } from '@/shared/auth/crypto';
import { syncStudentToSheet } from '@/shared/google/sheets-sync';
import { currentAcademicYear } from '@/shared/utils/academic-year';
import type { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    // ---- 認證：僅 admin（JWT + NextAuth 雙重支援）----
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    // ---- 查詢參數 ----
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || ''; // 'student' | 'teacher' | 'admin' | ''
    const level = searchParams.get('level') || ''; // S1-S6
    const className = searchParams.get('className') || '';
    const currentOnly = searchParams.get('currentOnly') === 'true';
    const academicYear = currentAcademicYear();

    // ---- 構建查詢條件 ----
    const where: Prisma.UserWhereInput = {};

    if (role) {
      where.role = role;
    }

    if (level) {
      where.level = level;
    }

    if (currentOnly) {
      // Student-analysis rosters represent currently enrolled students. A
      // historical S6 record must remain accessible in user management, but
      // cannot appear merely because its grade field still says S6.
      where.class = { academicYear };
      where.academicYear = academicYear;
    }

    if (className) {
      where.AND = [{ class: { name: className } }, ...(currentOnly ? [{ class: { academicYear } }] : [])];
      delete where.class;
    }

    if (search) {
      where.OR = [
        { nameZh: { contains: search } },
        { nameEn: { contains: search } },
        { email: { contains: search } },
      ];
    }

    // ---- 查詢 ----
    const [users, total] = await Promise.all([
      listUsersAdmin({
        where,
        select: {
          id: true,
          email: true,
          nameZh: true,
          nameEn: true,
          role: true,
          level: true,
          classNumber: true,
          overallAccuracy: true,
          streakDays: true,
          xp: true,
          joinedAt: true,
          academicYear: true,
          subjects: true,
          department: true,
          createdAt: true,
          updatedAt: true,
          class: { select: { id: true, name: true, gradeLevel: true, academicYear: true } },
          _count: {
            select: {
              sessions: true,
              mistakes: true,
              vocabItems: true,
              submissions: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      countUsers(where),
    ]);

    const allClasses = await listAllClasses(currentOnly ? academicYear : undefined);

    return NextResponse.json({
      users,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      classes: allClasses,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    logger.error({ module: 'admin-users', error: msg }, 'Admin users GET failed');
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
    const { email, nameZh, nameEn, role, password, level, className, classNumber, academicYear, subjects, department } = body;

    // 驗證必填欄位
    if (!email || !nameZh || !role) {
      return NextResponse.json({ error: 'email、nameZh、role 為必填欄位 / email, nameZh and role are required' }, { status: 400 });
    }

    if (!['student', 'teacher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'role 必須是 student、teacher 或 admin / role must be student, teacher or admin' }, { status: 400 });
    }

    // 檢查 email 是否已存在
    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: `Email ${email} 已被使用 / Email ${email} is already in use` }, { status: 409 });
    }

    // 處理班級關聯（學生）
    let classConnect: { id: string } | undefined = undefined;
    if (className && role === 'student') {
      // Upsert class
      const cls = await upsertClass(className, { gradeLevel: level || 'S4' });
      classConnect = { id: cls.id };
    }

    // 建立使用者
    const user = await createUser({
      data: {
        email, nameZh, nameEn: nameEn || undefined, role,
        passwordHash: password ? hashPasswordSync(password) : null,
        level: role === 'student' ? (level || undefined) : undefined,
        classNumber: role === 'student' ? (classNumber || undefined) : undefined,
        academicYear: academicYear || undefined,
        subjects: subjects ? (typeof subjects === 'string' ? subjects : JSON.stringify(subjects)) : undefined,
        department: department || undefined,
        ...(classConnect ? { classId: classConnect.id } : {}),
      },
      select: {
        id: true, email: true, nameZh: true, nameEn: true, role: true,
        level: true, classNumber: true, academicYear: true,
        subjects: true, department: true, createdAt: true,
        class: { select: { id: true, name: true } },
      },
    });

    // Fire-and-forget: sync student to Google Sheets
    if (role === 'student') {
      syncStudentToSheet({
        email,
        className: className || '',
        classNumber: classNumber || undefined,
        nameZh,
        nameEn: nameEn || undefined,
        level: level || undefined,
      });
    }

    return NextResponse.json({ user }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    logger.error({ module: 'admin-users', error: msg }, 'Admin users POST failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
