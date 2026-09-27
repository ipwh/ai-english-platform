// ============================================
// Progress Repository — XP, streak, gamification, badges, notifications, leaderboard
// THE ONLY layer allowed to access Prisma XP/Streak/Notification/WeeklySnapshot models
// Sprint 2: Repository Pattern
// ============================================

import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';
import { hkDayKey } from '@/shared/utils/hk-date';

// Streak helpers (used by streak-service.ts)
/**
 * 指定時間之後的全部練習開始時間。
 * **不設 `take`**：任何「最新 N 筆」截斷都會令連續天數失真
 * （2026-09-20 稽核：爆量學生 45–98 場／日 → 視窗只覆蓋 1–2 個日曆日）。
 */
export async function listPracticeStartedAtSince(studentId: string, since: Date) {
  return db.practiceSession.findMany({
    where: { studentId, startedAt: { gte: since } },
    select: { startedAt: true },
    orderBy: { startedAt: 'desc' },
  });
}

/**
 * 批次變體（2026-09-21 稽核）：多名學生在指定時間之後的練習開始時間。
 * 供教師／行政的報表使用，避免逐名學生查詢（N+1）。
 * 同樣**不設 `take`**，否則連續天數會被截斷（見上）。
 */
export async function listPracticeStartedAtSinceForStudents(userIds: string[], since: Date) {
  if (userIds.length === 0) return [];
  return db.practiceSession.findMany({
    where: { studentId: { in: userIds }, startedAt: { gte: since } },
    select: { studentId: true, startedAt: true },
    orderBy: { startedAt: 'desc' },
  });
}

// ============================================
// XP transactions
// ============================================

export async function createXpTransaction(data: Prisma.XpTransactionCreateInput) {
  return db.xpTransaction.create({ data });
}

/**
 * Interactive-transaction guardrails (2026-09-26 晚上事故：高併發下多個互動交易
 * 佔用連線池，請求堆叠後以 P2028／逾時回 500）。
 * maxWait：等待「取得一條連線以開始交易」的上限；timeout：交易總時長上限。
 * 兩者都在交易不能如期完成時令它失敗回滾，避免壅塞擴散。
 */
const XP_TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const;

/**
 * Atomically apply an XP event once; duplicate keys leave both XP and history unchanged.
 *
 * 2026-09-27 事故處理：回傳值由 boolean 擴展為 `{ created, xp }`，讓高頻呼叫端
 * （awardXp）不必為了取得最新等級而重建整個 StudentState（十餘個查詢）。
 * P2002（並發重播競賽）改為**交易外**讀取現值——在交易內捕捉 P2002 後繼續查詢
 * 會遇到 Postgres「current transaction is aborted」，反而製造新的 500。
 */
export async function applyXpEventOnce(params: {
  userId: string;
  event: string;
  xpAmount: number;
  metadata: string;
  idempotencyKey?: string;
  incrementStreak?: boolean;
}): Promise<{ created: boolean; xp: number | null }> {
  try {
    return await db.$transaction(async tx => {
      if (params.idempotencyKey) {
        const existing = await tx.xpTransaction.findUnique({
          where: { idempotencyKey: params.idempotencyKey },
          select: { id: true },
        });
        if (existing) return { created: false, xp: null };
      }

      const updated = await tx.user.update({
        where: { id: params.userId },
        data: {
          xp: { increment: params.xpAmount },
          ...(params.incrementStreak ? { streakDays: { increment: 1 } } : {}),
        },
        select: { xp: true },
      });
      await tx.xpTransaction.create({
        data: {
          userId: params.userId,
          event: params.event,
          xpAmount: params.xpAmount,
          metadata: params.metadata,
          idempotencyKey: params.idempotencyKey ?? null,
        },
      });
      return { created: true, xp: updated.xp };
    }, XP_TX_OPTIONS);
  } catch (error) {
    if (params.idempotencyKey && typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
      // 交易已回滾；在交易外取目前的 XP（單列主鍵讀取）。
      const user = await db.user.findUnique({ where: { id: params.userId }, select: { xp: true } });
      return { created: false, xp: user?.xp ?? null };
    }
    throw error;
  }
}

export async function getTodaysXpTransaction(userId: string, event: string, todayStart: Date) {
  return db.xpTransaction.findFirst({ where: { userId, event, createdAt: { gte: todayStart } } });
}

// ============================================
// Daily goal depth counts (Sprint 133)
// ============================================

export async function getDailyGoalCounts(studentId: string, todayStart: Date) {
  const [sessions, xpAgg, challenge, mistakesReviewed, wordsMastered] = await Promise.all([
    db.practiceSession.findMany({ where: { studentId, startedAt: { gte: todayStart } }, select: { totalQuestions: true } }),
    db.xpTransaction.aggregate({ where: { userId: studentId, createdAt: { gte: todayStart } }, _sum: { xpAmount: true } }),
    db.practiceSession.findFirst({ where: { studentId, source: 'daily-challenge', startedAt: { gte: todayStart } }, select: { id: true } }),
    db.mistakeReviewLog.count({ where: { studentId, reviewedAt: { gte: todayStart } } }),
    db.vocabMasteryLog.count({ where: { studentId, toLevel: 'mastered', changedAt: { gte: todayStart } } }),
  ]);
  return {
    questionsDone: sessions.reduce((sum, s) => sum + s.totalQuestions, 0),
    xpToday: xpAgg._sum.xpAmount ?? 0,
    challengeDone: !!challenge,
    mistakesReviewed,
    wordsMasteredToday: wordsMastered,
  };
}

// ============================================
// Weekly active days (leaderboard junior mode, Sprint 133)
// ============================================
// 活躍日 = 登入日 ∨ 練習日；日界線為**香港日**（2026-09-20 稽核：舊碼用 UTC 日）。
// 註：`LoginLog` 現時在生產環境從未被寫入（全庫 0 列）—— 登入分支保留是為了
// 日後接通寫入後自動生效，但現時實際只有練習訊號。
// ============================================

export async function getWeeklyActiveDaysMap(userIds: string[], weekStart: Date): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const [logins, practices] = await Promise.all([
    db.loginLog.findMany({ where: { userId: { in: userIds }, loginAt: { gte: weekStart } }, select: { userId: true, loginAt: true } }),
    db.practiceSession.findMany({ where: { studentId: { in: userIds }, startedAt: { gte: weekStart } }, select: { studentId: true, startedAt: true } }),
  ]);
  const days = new Map<string, Set<string>>();
  const add = (id: string, at: Date) => {
    if (!days.has(id)) days.set(id, new Set());
    days.get(id)!.add(hkDayKey(at));
  };
  for (const l of logins) add(l.userId, l.loginAt);
  for (const p of practices) add(p.studentId, p.startedAt);
  const result = new Map<string, number>();
  for (const [id, set] of days) result.set(id, set.size);
  return result;
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

export async function createNotification(data: Prisma.NotificationCreateInput) {
  return db.notification.create({ data });
}

export async function createBulkNotifications(data: Prisma.NotificationCreateManyInput[]) {
  if (data.length === 0) return;
  return db.notification.createMany({ data });
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
