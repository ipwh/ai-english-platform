// v5: Admin Export Service — all export queries centralized
import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';

export async function exportStudents(filters?: { academicYear?: string; className?: string }) {
  const where: Record<string, unknown> = { role: 'student' };
  if (filters?.className) where.class = { name: filters.className };
  return db.user.findMany({
    where,
    select: { id: true, name: true, nameZh: true, nameEn: true, email: true, classNumber: true, level: true, xp: true, streakDays: true, overallAccuracy: true, class: { select: { name: true, gradeLevel: true } } },
    orderBy: { classNumber: 'asc' },
  });
}

export async function exportTeachers(filters?: { academicYear?: string }) {
  return db.user.findMany({
    where: { role: 'teacher' },
    select: { id: true, name: true, nameZh: true, nameEn: true, email: true, class: { select: { name: true } } } satisfies Prisma.UserSelect,
    orderBy: { name: 'asc' },
  });
}

export async function exportStudentStream(filters?: { className?: string }) {
  const where: Record<string, unknown> = { role: 'student' };
  if (filters?.className) where.class = { name: filters.className };
  return db.user.findMany({
    where,
    select: { id: true, name: true, nameZh: true, nameEn: true, email: true, classNumber: true, xp: true, streakDays: true, overallAccuracy: true, class: { select: { name: true } } },
    orderBy: { classNumber: 'asc' },
  });
}

export async function exportSheetsData() {
  return db.user.findMany({
    where: { role: 'student' },
    select: { id: true, email: true, name: true, nameZh: true, class: { select: { name: true, gradeLevel: true } } },
  });
}
