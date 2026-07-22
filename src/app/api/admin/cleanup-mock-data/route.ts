// ============================================
// POST /api/admin/cleanup-mock-data — 清除所有示範/模擬數據
//
// 刪除範圍：
//   - 所有 @school.hk 使用者（學生、教師、管理員）
//   - Demo 班級及相關作業、提交、練習記錄等
//   - 示範教材 (RAG materials)
//
// 保留：
//   - @pochiu.edu.hk 的真實學生（695 人）
//   - 真實教師帳號
//   - 管理員 ipwh@pochiu.edu.hk
//   - 標準班級 1A-6D
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifyAdmin } from '@/shared/auth/admin-auth';
import { logger } from '@/shared/logger/logger';

export async function POST(request: NextRequest) {
  const result = {
    deletedUsers: 0,
    deletedMaterials: 0,
    deletedAssignments: 0,
    deletedSubmissions: 0,
    deletedPracticeSessions: 0,
    deletedMistakes: 0,
    deletedVocabItems: 0,
    deletedWritingDrafts: 0,
    deletedTeacherClasses: 0,
    deletedNotifications: 0,
    deletedDemoClass: false,
    errors: [] as string[],
  };

  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    // 先找出所有 @school.hk 的使用者 ID
    const mockUsers = await db.user.findMany({
      where: { email: { contains: '@school.hk' } },
      select: { id: true, email: true },
    });

    const mockUserIds = mockUsers.map(u => u.id);
    logger.info({ module: 'cleanup-mock-data', mockUserIds, mockEmails: mockUsers.map(u => u.email) }, 'Found mock users for cleanup');

    if (mockUserIds.length === 0) {
      // 仍然清理可能殘留的關聯資料
    }

    // 按依賴順序刪除（子表先刪，父表後刪）

    // 1. 刪除通知
    if (mockUserIds.length > 0) {
      const r = await db.notification.deleteMany({
        where: { userId: { in: mockUserIds } },
      });
      result.deletedNotifications = r.count;
    }

    // 2. 刪除寫作草稿
    if (mockUserIds.length > 0) {
      const r = await db.writingDraft.deleteMany({
        where: { studentId: { in: mockUserIds } },
      });
      result.deletedWritingDrafts = r.count;
    }

    // 4. 刪除詞彙項目
    if (mockUserIds.length > 0) {
      const r = await db.vocabItem.deleteMany({
        where: { studentId: { in: mockUserIds } },
      });
      result.deletedVocabItems = r.count;
    }

    // 5. 刪除錯題記錄
    if (mockUserIds.length > 0) {
      const r = await db.mistake.deleteMany({
        where: { studentId: { in: mockUserIds } },
      });
      result.deletedMistakes = r.count;
    }

    // 6. 刪除練習記錄
    if (mockUserIds.length > 0) {
      const r = await db.practiceSession.deleteMany({
        where: { studentId: { in: mockUserIds } },
      });
      result.deletedPracticeSessions = r.count;
    }

    // 7. 刪除提交記錄
    if (mockUserIds.length > 0) {
      const r = await db.submission.deleteMany({
        where: { studentId: { in: mockUserIds } },
      });
      result.deletedSubmissions = r.count;
    }

    // 8. 刪除作業（由 mock 教師建立或屬於 Demo 班級）
    const demoClass = await db.class.findFirst({ where: { name: 'Demo' } });
    if (demoClass) {
      const r = await db.assignment.deleteMany({
        where: { className: 'Demo' },
      });
      result.deletedAssignments = r.count;
    }

    // 9. 刪除示範教材
    if (mockUserIds.length > 0) {
      const r = await db.material.deleteMany({
        where: { uploadedBy: { in: mockUserIds } },
      });
      result.deletedMaterials = r.count;
    }

    // 10. 刪除教師班級關聯
    if (mockUserIds.length > 0) {
      const r = await db.teacherClass.deleteMany({
        where: { teacherId: { in: mockUserIds } },
      });
      result.deletedTeacherClasses = r.count;
    }

    // 11. 刪除 Auth 相關記錄（NextAuth sessions/accounts）
    try {
      if (mockUserIds.length > 0) {
        await db.session.deleteMany({
          where: { userId: { in: mockUserIds } },
        });
        await db.account.deleteMany({
          where: { userId: { in: mockUserIds } },
        });
      }
    } catch {
      // Session/Account 表可能不存在（視 NextAuth 設定）
      result.errors.push('無法清理 auth sessions（可能不存在此表）');
    }

    // 12. 刪除 mock 使用者
    if (mockUserIds.length > 0) {
      const r = await db.user.deleteMany({
        where: { id: { in: mockUserIds } },
      });
      result.deletedUsers = r.count;
    }

    // 13. 刪除 Demo 班級
    if (demoClass) {
      // 先確認沒有真實學生在 Demo 班（安全檢查）
      const demoStudents = await db.user.count({
        where: { classId: demoClass.id, email: { not: { contains: '@school.hk' } } },
      });
      if (demoStudents === 0) {
        await db.class.delete({ where: { id: demoClass.id } });
        result.deletedDemoClass = true;
      } else {
        result.errors.push(`Demo 班級仍有 ${demoStudents} 名非 mock 學生，跳過刪除`);
      }
    }

    // 最終統計
    const remainingStudents = await db.user.count({ where: { role: 'student' } });
    const remainingTeachers = await db.user.count({ where: { role: 'teacher' } });

    return NextResponse.json({
      ...result,
      remainingStudents,
      remainingTeachers,
      message: `已清除 ${result.deletedUsers} 個 mock 使用者及所有相關數據。剩餘 ${remainingStudents} 名學生、${remainingTeachers} 名教師。`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    logger.error({ module: 'cleanup-mock-data', error: msg }, 'Cleanup failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
