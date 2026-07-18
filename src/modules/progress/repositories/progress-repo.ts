// ============================================
// Progress Repository — XP, streak, gamification, badges, notifications, leaderboard
// THE ONLY layer allowed to access Prisma XP/Streak/Notification/WeeklySnapshot models
// Sprint 2: Repository Pattern
// ============================================

import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';

// Streak helpers (used by streak-service.ts)
export async function getLoginDates(userId: string, limit = 90) { return db.loginLog.findMany({ where: { userId }, select: { loginAt: true }, orderBy: { loginAt: 'desc' }, take: limit }); }
export async function getPracticeDates(studentId: string, limit = 90) { return db.practiceSession.findMany({ where: { studentId }, select: { startedAt: true }, orderBy: { startedAt: 'desc' }, take: limit }); }

// ============================================
// XP transactions
// ============================================

export async function createXpTransaction(data: Prisma.XpTransactionCreateInput) {
  return db.xpTransaction.create({ data });
}

export async function getTodaysXpTransaction(userId: string, event: string, todayStart: Date) {
  return db.xpTransaction.findFirst({ where: { userId, event, createdAt: { gte: todayStart } } });
}

export async function listXpTransactions(userId: string, limit = 30) {
  return db.xpTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit });
}

export async function sumXp(userId: string) {
  const result = await db.xpTransaction.aggregate({ where: { userId }, _sum: { xpAmount: true } });
  return result._sum.xpAmount ?? 0;
}

// ============================================
// Streak
// ============================================

export async function getStreakActivityDates(userId: string) {
  const [loginDates, practiceDates] = await Promise.all([
    db.loginLog.findMany({ where: { userId }, select: { loginAt: true }, orderBy: { loginAt: 'desc' }, take: 100 }),
    db.practiceSession.findMany({ where: { studentId: userId }, select: { startedAt: true }, orderBy: { startedAt: 'desc' }, take: 100 }),
  ]);
  return { loginDates: loginDates.map(l => l.loginAt), practiceDates: practiceDates.map(p => p.startedAt) };
}

export async function updateUserXpAndStreak(userId: string, xpGained: number, streakDays: number) {
  return db.user.update({ where: { id: userId }, data: { xp: { increment: xpGained }, streakDays } });
}

// ============================================
// Leaderboard
// ============================================

export async function getLeaderboard(limit = 20) {
  return db.user.findMany({
    where: { role: 'student' }, select: { id: true, name: true, nameZh: true, xp: true, streakDays: true, overallAccuracy: true, class: { select: { name: true } } },
    orderBy: { xp: 'desc' }, take: limit,
  });
}

// ============================================
// Badges
// ============================================

export async function getUserBadgeIds(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { badgeIds: true } });
  try { return JSON.parse(user?.badgeIds || '[]') as string[]; } catch { return []; }
}

export async function awardBadge(userId: string, badgeId: string) { const current = await getUserBadgeIds(userId); if (current.includes(badgeId)) return current; current.push(badgeId); await db.user.update({ where: { id: userId }, data: { badgeIds: JSON.stringify(current) } }); return current; }

// ============================================
// Weekly snapshots
// ============================================

export async function upsertWeeklySnapshot(userId: string, weekStart: string, data: {
  totalQuestions: number; correctCount: number; accuracy: number; sessionsCount: number; xpGained: number; streakDays: number; wordsLearned: number;
}) {
  return db.weeklySnapshot.upsert({
    where: { userId_weekStart: { userId, weekStart } },
    create: { userId, weekStart, ...data },
    update: {
      totalQuestions: { increment: data.totalQuestions },
      correctCount: { increment: data.correctCount },
      sessionsCount: { increment: data.sessionsCount },
      xpGained: { increment: data.xpGained },
      streakDays: data.streakDays,
      wordsLearned: { increment: data.wordsLearned },
      accuracy: data.totalQuestions > 0 ? undefined : data.accuracy,
    },
  });
}

export async function listWeeklySnapshots(userId: string, limit = 12) {
  return db.weeklySnapshot.findMany({ where: { userId }, orderBy: { weekStart: 'desc' }, take: limit });
}

// ============================================
// Notifications
// ============================================

export async function listNotifications(userId: string, filters?: { limit?: number; offset?: number }) {
  const where: Prisma.NotificationWhereInput = { userId };
  const [notifications, total, unreadCount] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: filters?.limit ?? 50, skip: filters?.offset ?? 0 }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId, read: false } }),
  ]);
  return { notifications, total, unreadCount };
}

export async function getUnreadNotificationCount(userId: string) {
  return db.notification.count({ where: { userId, read: false } });
}

export async function createNotification(data: Record<string, unknown>) {
  return db.notification.create({ data: data as any });
}

export async function createBulkNotifications(data: Record<string, unknown>[]) {
  if (data.length === 0) return;
  return db.notification.createMany({ data: data as any });
}

export async function markNotificationRead(notificationId: string) {
  return db.notification.update({ where: { id: notificationId }, data: { read: true } });
}

export async function markAllNotificationsRead(userId: string) {
  return db.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
}

// ============================================
// Login logs
// ============================================

export async function createLoginLog(data: Prisma.LoginLogCreateInput) {
  return db.loginLog.create({ data });
}

export async function listLoginLogs(filters: { page?: number; pageSize?: number }) {
  const page = filters.page ?? 1;
  const pageSize = Math.min(100, filters.pageSize ?? 20);
  const [logs, total] = await Promise.all([
    db.loginLog.findMany({ orderBy: { loginAt: 'desc' }, take: pageSize, skip: (page - 1) * pageSize }),
    db.loginLog.count(),
  ]);
  return { logs, total, page, pageSize };
}
