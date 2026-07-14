// ============================================
// NotificationService — 統一通知發送與管理
// 支援: assignment | feedback | reminder | system | achievement
// ============================================

import db from '@/lib/db';

export type NotificationType = 'assignment' | 'feedback' | 'reminder' | 'system' | 'achievement';

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

/** 作業指派 — 通知班級內所有學生 */
export async function notifyAssignmentCreated(
  assignmentTitle: string,
  className: string,
  assignmentId: string,
) {
  try {
    const students = await db.user.findMany({
      where: {
        class: { name: className },
        role: 'student',
      },
      select: { id: true },
    });
    if (students.length === 0) return;

    await createBulkNotifications(
      students.map(s => s.id),
      'assignment',
      '📝 新作業',
      `${className} 班有新作業：「${assignmentTitle}」`,
      `/student/assignments/${assignmentId}`,
    );
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
  await createNotification({
    userId: teacherId,
    type: 'feedback',
    title: '📥 學生提交作業',
    message: `${studentName} 已提交「${assignmentTitle}」`,
    link: `/teacher/assignments/${assignmentId}`,
  });
}

/** 教師批改完成 — 通知學生 */
export async function notifyFeedbackReady(
  studentId: string,
  assignmentTitle: string,
  assignmentId: string,
) {
  await createNotification({
    userId: studentId,
    type: 'feedback',
    title: '✅ 作業已批改',
    message: `你的作業「${assignmentTitle}」已有教師回饋`,
    link: `/student/assignments/${assignmentId}`,
  });
}

/** 寫作批改完成 — 通知學生 */
export async function notifyWritingFeedbackReady(
  studentId: string,
  title: string,
) {
  await createNotification({
    userId: studentId,
    type: 'feedback',
    title: '✍️ 寫作已批改',
    message: `你的寫作「${title}」已完成 AI 批改`,
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
  await createNotification({
    userId: studentId,
    type: 'achievement',
    title: '🏆 成就解鎖！',
    message: `恭喜你獲得「${badgeNameZh || badgeName}」徽章！`,
    link: '/student/dashboard',
  });
}
