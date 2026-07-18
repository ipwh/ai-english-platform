// ============================================
// Student Repository — centralized data access for Student operations
// Created Sprint 0.5: basic CRUD operations
// ============================================

import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface StudentFilters {
  classId?: string;
  gradeLevel?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface StudentListResult {
  students: Prisma.UserGetPayload<{ include: { class: true } }>[];
  total: number;
}

// ============================================
// Queries
// ============================================

export async function findStudentById(id: string) {
  return db.user.findUnique({
    where: { id },
    include: { class: true, studentClasses: true },
  });
}

export async function findStudentByEmail(email: string) {
  return db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { class: true },
  });
}

export async function listStudents(filters: StudentFilters): Promise<StudentListResult> {
  const where: Prisma.UserWhereInput = { role: 'student' };

  if (filters.classId) where.classId = filters.classId;
  if (filters.gradeLevel) where.level = filters.gradeLevel;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { nameZh: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [students, total] = await Promise.all([
    db.user.findMany({
      where,
      include: { class: true },
      orderBy: { name: 'asc' },
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
    }),
    db.user.count({ where }),
  ]);

  return { students, total };
}

export async function listStudentsByClass(classId: string) {
  return db.user.findMany({
    where: { role: 'student', classId },
    include: { class: true },
    orderBy: { classNumber: 'asc' },
  });
}

// ============================================
// Mutations
// ============================================

export async function updateStudentXp(id: string, xpGained: number) {
  return db.user.update({
    where: { id },
    data: { xp: { increment: xpGained } },
  });
}

export async function updateStudentStreak(id: string, streakDays: number) {
  return db.user.update({
    where: { id },
    data: { streakDays },
  });
}

export async function updateStudentBadges(id: string, badgeIds: string[]) {
  return db.user.update({
    where: { id },
    data: { badgeIds: JSON.stringify(badgeIds) },
  });
}

export async function updateStudentAccuracy(id: string, overallAccuracy: number) {
  return db.user.update({
    where: { id },
    data: { overallAccuracy },
  });
}
