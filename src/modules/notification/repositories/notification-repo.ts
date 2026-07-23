// Sprint 4: Notification Repository — notification CRUD
// v5: Extended with list/count/update for route migration
import { db } from '@/shared/db/db';

export async function listNotifications(userId: string, limit = 30) {
  return db.notification.findMany({
    where: { userId },
    select: { id: true, type: true, title: true, message: true, link: true, read: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function countUnreadNotifications(userId: string) {
  return db.notification.count({ where: { userId, read: false } });
}

export async function markNotificationRead(id: string) {
  return db.notification.update({ where: { id }, data: { read: true } });
}

export async function markNotificationsRead(userId: string) {
  return db.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
}

export async function createNotification(data: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
}) {
  return db.notification.create({ data });
}

export async function createBulkNotifications(
  data: Array<{
    userId: string;
    type: string;
    title: string;
    message: string;
    link?: string | null;
  }>
) {
  return db.notification.createMany({ data });
}
