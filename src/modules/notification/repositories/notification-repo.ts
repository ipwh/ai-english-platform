// Sprint 4: Notification Repository — notification CRUD
import { db } from '@/shared/db/db';

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
