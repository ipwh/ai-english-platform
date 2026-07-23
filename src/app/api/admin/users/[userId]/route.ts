// ============================================
// PUT    /api/admin/users/[userId] — 編輯單一使用者
// DELETE /api/admin/users/[userId] — 刪除使用者及其關聯資料
// PATCH  /api/admin/users/[userId] — 重設使用者密碼
// 僅 admin 可存取
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { findUserById, updateUser, deleteUser, createTeacherClass, listTeacherClasses, findTeacherClass } from '@/modules/admin/services/admin-service';
import { verifyAdmin } from '@/shared/auth/admin-auth';
import { hashPassword } from '@/shared/auth/crypto';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // ---- 認證：僅 admin（JWT + NextAuth 雙重支援）----
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const { userId } = await params;
    const body = await request.json();

    // ---- 查詢現有使用者 ----
    const existing = await (await import('@/shared/db/db')).db.user.findUnique({ where: { id: userId } });
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
      const cls = await (await import('@/shared/db/db')).db.class.upsert({
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
    const updated = await (await import('@/shared/db/db')).db.user.update({
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

// DELETE /api/admin/users/[userId] — 刪除使用者及其所有關聯資料
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const { userId } = await params;

    const existing = await (await import('@/shared/db/db')).db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } });
    if (!existing) {
      return NextResponse.json({ error: '使用者不存在' }, { status: 404 });
    }

    // Prevent admin from deleting themselves
    if (auth.userId === userId) {
      return NextResponse.json({ error: '無法刪除自己的帳戶' }, { status: 400 });
    }

    // Delete related records that don't have cascade in schema
    await (await import('@/shared/db/db')).db.$transaction([
      // Submissions (no cascade on student relation)
      (await import('@/shared/db/db')).db.submission.deleteMany({ where: { studentId: userId } }),
      // Reviews (student or teacher)
      (await import('@/shared/db/db')).db.review.deleteMany({ where: { OR: [{ studentId: userId }, { teacherId: userId }] } }),
      // Assignments created by this user (teacher)
      (await import('@/shared/db/db')).db.assignment.deleteMany({ where: { createdBy: userId } }),
      // Materials uploaded by this user
      (await import('@/shared/db/db')).db.material.deleteMany({ where: { uploadedBy: userId } }),
      // Groups created by this user
      (await import('@/shared/db/db')).db.group.deleteMany({ where: { createdBy: userId } }),
      // TeacherClass relations
      (await import('@/shared/db/db')).db.teacherClass.deleteMany({ where: { teacherId: userId } }),
      // StudentClass relations
      (await import('@/shared/db/db')).db.studentClass.deleteMany({ where: { studentId: userId } }),
      // GroupMember relations
      (await import('@/shared/db/db')).db.groupMember.deleteMany({ where: { studentId: userId } }),
      // AssignmentStudent relations
      (await import('@/shared/db/db')).db.assignmentStudent.deleteMany({ where: { studentId: userId } }),
      // IntegratedSkillsDraft
      (await import('@/shared/db/db')).db.integratedSkillsDraft.deleteMany({ where: { userId } }),
      // UserPreferences
      (await import('@/shared/db/db')).db.userPreferences.deleteMany({ where: { userId } }),
      // Account (NextAuth)
      (await import('@/shared/db/db')).db.account.deleteMany({ where: { userId } }),
      // Session (NextAuth)
      (await import('@/shared/db/db')).db.session.deleteMany({ where: { userId } }),
    ]);

    // Now delete the user — cascade handles remaining: Mistake, VocabItem,
    // WritingDraft, PracticeSession, ListeningSession, SpellingSession, Notification
    await (await import('@/shared/db/db')).db.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true, deleted: { id: userId, email: existing.email } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    console.error('[admin/users DELETE] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/admin/users/[userId] — 重設使用者密碼
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const { userId } = await params;
    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: '密碼長度至少需要 6 個字元' }, { status: 400 });
    }

    const existing = await (await import('@/shared/db/db')).db.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!existing) {
      return NextResponse.json({ error: '使用者不存在' }, { status: 404 });
    }

    const hashed = await hashPassword(password);
    await (await import('@/shared/db/db')).db.user.update({ where: { id: userId }, data: { passwordHash: hashed } });

    return NextResponse.json({ success: true, message: `已重設 ${existing.email} 的密碼` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    console.error('[admin/users PATCH] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
