// v5: Admin Sync Service — Google Sheets sync operations
import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';
import { logger } from '@/shared/logger/logger';
import { currentAcademicYear } from '@/shared/utils/academic-year';

export interface SheetRow { email: string; class: string; classNumber: number; nameZh: string; nameEn: string; level: string; }

export async function syncSheetToDatabase(rows: SheetRow[], dryRun = false) {
  const result = { created: 0, updated: 0, skipped: 0, errors: 0, details: [] as string[] };
  const academicYear = currentAcademicYear();

  if (dryRun) {
    const emails = rows.map(r => r.email);
    const existingUsers = await db.user.findMany({
      where: { email: { in: emails } },
      select: { email: true, class: { select: { name: true } } },
    });
    const userMap = new Map(existingUsers.map(u => [u.email, u]));
    for (const row of rows) {
      const user = userMap.get(row.email);
      result.details.push(`${row.email}: ${user ? `exists (class: ${user.class?.name})` : 'would create'}`);
    }
    result.skipped = rows.length;
    return result;
  }

  for (const row of rows) {
    try {
      const cls = await db.class.upsert({
        where: { name: row.class },
        update: { gradeLevel: row.level, academicYear },
        create: { name: row.class, gradeLevel: row.level, academicYear },
      });

      const existing = await db.user.findUnique({ where: { email: row.email } });
      if (existing) {
        await db.user.update({
          where: { email: row.email },
          data: { name: row.nameEn, nameZh: row.nameZh, nameEn: row.nameEn, classNumber: row.classNumber, level: row.level, academicYear, classId: cls.id } as Prisma.UserUpdateInput,
        });
        result.updated++;
      } else {
        await db.user.create({
          data: { email: row.email, name: row.nameEn, nameZh: row.nameZh, nameEn: row.nameEn, role: 'student', classNumber: row.classNumber, level: row.level, academicYear, classId: cls.id } as unknown as Prisma.UserCreateInput,
        });
        result.created++;
      }
    } catch (err: unknown) {
      result.errors++;
      result.details.push(`${row.email}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  logger.info({ module: 'sync-sheets', created: result.created, updated: result.updated, errors: result.errors }, 'Sheet sync complete');
  return result;
}

export async function getCurrentRoster() {
  return db.user.findMany({
    where: { role: 'student' },
    select: { email: true, name: true, nameZh: true, class: { select: { name: true } }, classNumber: true },
    orderBy: { class: { name: 'asc' } },
  });
}
