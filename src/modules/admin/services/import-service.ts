// v5: Admin Import Service — bulk import operations
import { db, getBulkDb } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';

export async function findExistingUsers(emails: string[]) {
  return db.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
}

export async function findExistingClasses(names: string[]) {
  return db.class.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });
}

export async function findUserByEmail(email: string) {
  return db.user.findUnique({ where: { email }, select: { id: true, role: true } });
}

export async function bulkImportStudents(rows: Array<{
  nameZh: string; nameEn: string; email: string; password: string;
  className: string; classNumber: number; level: string;
}>) {
  const bulkDb = getBulkDb();
  const result = { created: 0, updated: 0, errors: 0, details: [] as string[] };

  // Create classes that don't exist
  const classNames = [...new Set(rows.map(r => r.className))];
  for (const name of classNames) {
    await bulkDb.class.upsert({
      where: { name },
      update: {},
      create: { name, gradeLevel: rows.find(r => r.className === name)?.level || 'S4', academicYear: '2025-2026' },
    });
  }

  for (const row of rows) {
    try {
      const existing = await bulkDb.user.findUnique({ where: { email: row.email } });
      if (existing) {
        await bulkDb.user.update({
          where: { email: row.email },
          data: { name: row.nameEn, nameZh: row.nameZh, nameEn: row.nameEn, classNumber: String(row.classNumber), level: row.level },
        });
        result.updated++;
      } else {
        await bulkDb.user.create({
          data: { email: row.email, name: row.nameEn, nameZh: row.nameZh, nameEn: row.nameEn, password: row.password, role: 'student', classNumber: row.classNumber, level: row.level, class: { connect: { name: row.className } } } as Prisma.UserCreateInput,
        });
        result.created++;
      }
    } catch (err: unknown) {
      result.errors++;
      result.details.push(`${row.email}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
  return result;
}

export async function bulkImportTeachers(rows: Array<{
  nameZh: string; nameEn: string; email: string; password: string;
  classes: string[]; subjects: string[];
}>) {
  const bulkDb = getBulkDb();
  const result = { created: 0, updated: 0, errors: 0, details: [] as string[] };

  for (const row of rows) {
    try {
      const existing = await bulkDb.user.findUnique({ where: { email: row.email } });
      if (existing) {
        await bulkDb.user.update({ where: { email: row.email }, data: { name: row.nameEn, nameZh: row.nameZh, nameEn: row.nameEn } });
        result.updated++;
      } else {
        const teacher = await bulkDb.user.create({
          data: { email: row.email, name: row.nameEn, nameZh: row.nameZh, nameEn: row.nameEn, password: row.password, role: 'teacher' } as Prisma.UserCreateInput,
        });
        // Link classes
        for (const className of row.classes) {
          const cls = await bulkDb.class.upsert({ where: { name: className }, update: {}, create: { name: className, gradeLevel: 'S4', academicYear: '2025-2026' } });
          await bulkDb.teacherClass.create({ data: { teacherId: teacher.id, classId: cls.id } });
        }
        result.created++;
      }
    } catch (err: unknown) {
      result.errors++;
      result.details.push(`${row.email}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
  return result;
}
