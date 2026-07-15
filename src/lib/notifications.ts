// ============================================
// NotificationService — 統一通知發送與管理
// 支援: assignment | feedback | reminder | system | achievement
// 支援 i18n: 根據 user language 偏好發送對應語言通知
// ============================================

import db from '@/lib/db';

export type NotificationType = 'assignment' | 'feedback' | 'reminder' | 'system' | 'achievement';
export type NotificationLang = 'zh' | 'en';

/** Resolve user language from DB */
export async function getUserLang(userId: string): Promise<NotificationLang> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { language: true } });
    return user?.language === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

// ============================================
// 雙語通知訊息模板
// ============================================
const MSG = {
  newAssignment: (className: string, assignmentTitle: string) => ({
    zh: `📝 ${className} 班有新作業：「${assignmentTitle}」`,
    en: `📝 New assignment for ${className}: "${assignmentTitle}"`,
  }),
  assignmentTitle: { zh: '📝 新作業', en: '📝 New Assignment' },
  submissionReceived: (studentName: string, assignmentTitle: string) => ({
    zh: `📤 ${studentName} 已提交作業：「${assignmentTitle}」`,
    en: `📤 ${studentName} submitted assignment: "${assignmentTitle}"`,
  }),
  submissionTitle: { zh: '📤 學生提交作業', en: '📤 Submission Received' },
  feedbackReady: (assignmentTitle: string) => ({
    zh: `✅ 你的作業「${assignmentTitle}」已批改完成`,
    en: `✅ Your assignment "${assignmentTitle}" has been graded`,
  }),
  feedbackTitle: { zh: '📋 批改完成', en: '📋 Feedback Ready' },
  writingFeedback: (title: string) => ({
    zh: `✍️ 你的寫作「${title}」已批改完成`,
    en: `✍️ Your writing "${title}" has been reviewed`,
  }),
  writingTitle: { zh: '✍️ 寫作批改完成', en: '✍️ Writing Review Ready' },
  achievement: (badgeNameZh: string, badgeNameEn: string) => ({
    zh: `🏆 恭喜你獲得「${badgeNameZh}」徽章！`,
    en: `🏆 Congratulations! You earned the "${badgeNameEn}" badge!`,
  }),
  achievementTitle: { zh: '🏆 獲得新徽章！', en: '🏆 New Badge Earned!' },
  systemAnnouncement: { zh: '📢 系統公告', en: '📢 System Announcement' },
};

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

/** 建立單一通知 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    await db.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link || null,
      },
    });
  } catch (err) {
    console.error('[NotificationService] Failed to create notification:', err);
  }
}

/** 批次建立通知（給多個用戶發送相同通知） */
export async function createBulkNotifications(
  userIds: string[],
  type: NotificationType,
  title: string,
  message: string,
  link?: string,
) {
  if (userIds.length === 0) return;
  try {
    await db.notification.createMany({
      data: userIds.map(userId => ({
        userId,
        type,
        title,
        message,
        link: link || null,
      })),
    });
  } catch (err) {
    console.error('[NotificationService] Failed to create bulk notifications:', err);
  }
}

// ============================================
// 業務通知方法
// ============================================

/** 作業指派 — 通知班級內所有學生（使用 classId 避免同名班級衝突） */
export async function notifyAssignmentCreated(
  assignmentTitle: string,
  className: string,
  classId: string | null,
  assignmentId: string,
) {
  try {
    // 優先使用 classId 查詢；fallback 到 className
    const where = classId
      ? { studentClasses: { some: { classId } }, role: 'student' as const }
      : { class: { name: className }, role: 'student' as const };
    const students = await db.user.findMany({
      where,
      select: { id: true, language: true },
    });
    if (students.length === 0) return;

    const titleMsg = MSG.assignmentTitle;
    const bodyMsg = MSG.newAssignment(className, assignmentTitle);
    // Send per-student language
    for (const student of students) {
      const lang: NotificationLang = student.language === 'en' ? 'en' : 'zh';
      await createNotification({
        userId: student.id,
        type: 'assignment',
        title: titleMsg[lang],
        message: bodyMsg[lang],
        link: `/student/assignments/${assignmentId}`,
      });
    }
    console.log(`[Notification] Assignment "${assignmentTitle}" → ${students.length} students in ${className}`);
  } catch (err) {
    console.error('[NotificationService] notifyAssignmentCreated failed:', err);
  }
}

/** 學生提交作業 — 通知教師 */
export async function notifySubmissionReceived(
  studentName: string,
  assignmentTitle: string,
  assignmentId: string,
  teacherId: string,
) {
  const lang = await getUserLang(teacherId);
  const titleMsg = MSG.submissionTitle;
  const bodyMsg = MSG.submissionReceived(studentName, assignmentTitle);
  await createNotification({
    userId: teacherId,
    type: 'feedback',
    title: titleMsg[lang],
    message: bodyMsg[lang],
    link: `/teacher/assignments/${assignmentId}`,
  });
}

/** 教師批改完成 — 通知學生 */
export async function notifyFeedbackReady(
  studentId: string,
  assignmentTitle: string,
  assignmentId: string,
) {
  const lang = await getUserLang(studentId);
  const titleMsg = MSG.feedbackTitle;
  const bodyMsg = MSG.feedbackReady(assignmentTitle);
  await createNotification({
    userId: studentId,
    type: 'feedback',
    title: titleMsg[lang],
    message: bodyMsg[lang],
    link: `/student/assignments/${assignmentId}`,
  });
}

/** 寫作批改完成 — 通知學生 */
export async function notifyWritingFeedbackReady(
  studentId: string,
  title: string,
) {
  const lang = await getUserLang(studentId);
  const titleMsg = MSG.writingTitle;
  const bodyMsg = MSG.writingFeedback(title);
  await createNotification({
    userId: studentId,
    type: 'feedback',
    title: titleMsg[lang],
    message: bodyMsg[lang],
    link: '/student/writing',
  });
}

/** 系統公告 — 通知所有用戶 */
export async function notifySystemAnnouncement(
  title: string,
  message: string,
  role?: 'student' | 'teacher',
) {
  try {
    const users = await db.user.findMany({
      where: role ? { role } : {},
      select: { id: true },
    });
    await createBulkNotifications(
      users.map(u => u.id),
      'system',
      title,
      message,
    );
  } catch (err) {
    console.error('[NotificationService] notifySystemAnnouncement failed:', err);
  }
}

/** 成就解鎖 — 通知學生 */
export async function notifyAchievement(
  studentId: string,
  badgeName: string,
  badgeNameZh: string,
) {
  const lang = await getUserLang(studentId);
  const titleMsg = MSG.achievementTitle;
  const bodyMsg = MSG.achievement(badgeNameZh || badgeName, badgeName);
  await createNotification({
    userId: studentId,
    type: 'achievement',
    title: titleMsg[lang],
    message: bodyMsg[lang],
    link: '/student/dashboard',
  });
}
