// ============================================
// Class Repository — centralized data access for Class operations
// Created Sprint 0.5: basic CRUD operations
// ============================================

import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface ClassFilters {
  gradeLevel?: string;
  teacherId?: string;
  academicYear?: string;
  limit?: number;
  offset?: number;
}

// ============================================
// Queries
// ============================================

export async function findClassById(id: string) {
  return db.class.findUnique({
    where: { id },
    include: {
      students: { orderBy: { classNumber: 'asc' } },
      teachers: { include: { teacher: true } },
    },
  });
}

export async function findClassByName(name: string) {
  return db.class.findUnique({ where: { name } });
}

export async function listClasses(filters: ClassFilters) {
  const where: Prisma.ClassWhereInput = {};

  if (filters.gradeLevel) where.gradeLevel = filters.gradeLevel;
  if (filters.academicYear) where.academicYear = filters.academicYear;
  if (filters.teacherId) {
    where.teachers = { some: { teacherId: filters.teacherId } };
  }

  const [classes, total] = await Promise.all([
    db.class.findMany({
      where,
      include: { _count: { select: { students: true } } },
      orderBy: { name: 'asc' },
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
    }),
    db.class.count({ where }),
  ]);

  return { classes, total };
}

export async function getClassStats(classId: string) {
  const classData = await db.class.findUnique({
    where: { id: classId },
    include: {
      students: {
        select: { id: true, overallAccuracy: true, xp: true, streakDays: true },
      },
    },
  });

  if (!classData) return null;

  const studentCount = classData.students.length;
  const avgAccuracy =
    studentCount > 0
      ? classData.students.reduce((sum, s) => sum + (s.overallAccuracy ?? 0), 0) /
        studentCount
      : 0;
  const avgXp =
    studentCount > 0
      ? classData.students.reduce((sum, s) => sum + s.xp, 0) / studentCount
      : 0;

  return { studentCount, avgAccuracy, avgXp };
}

// ============================================
// Mutations
// ============================================

export async function createClass(data: Prisma.ClassCreateInput) {
  return db.class.create({ data });
}

export async function updateClass(id: string, data: Prisma.ClassUpdateInput) {
  return db.class.update({ where: { id }, data });
}

export async function assignTeacherToClass(classId: string, teacherId: string, isFormTeacher = false) {
  return db.teacherClass.upsert({
    where: {
      teacherId_classId: { teacherId, classId },
    },
    create: { teacherId, classId, isFormTeacher },
    update: { isFormTeacher },
  });
}

export async function assignStudentToClass(studentId: string, classId: string) {
  const classData = await db.class.findUnique({ where: { id: classId } });
  return db.user.update({
    where: { id: studentId },
    data: {
      classId,
      level: classData?.gradeLevel ?? undefined,
    },
  });
}
