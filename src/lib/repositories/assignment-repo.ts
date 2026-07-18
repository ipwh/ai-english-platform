// ============================================
// Assignment Repository — centralized data access for Assignment operations
// Created Sprint 0.5: basic CRUD operations
// ============================================

import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface AssignmentFilters {
  teacherId?: string;
  studentId?: string;
  classId?: string;
  limit?: number;
  offset?: number;
}

// ============================================
// Queries
// ============================================

export async function findAssignmentById(id: string) {
  return db.assignment.findUnique({
    where: { id },
    include: {
      questions: true,
      class: true,
      teacher: { select: { id: true, name: true, nameZh: true } },
      submissions: {
        include: { student: { select: { id: true, name: true, nameZh: true } } },
      },
    },
  });
}

export async function listAssignments(filters: AssignmentFilters) {
  const where: Prisma.AssignmentWhereInput = {};

  if (filters.teacherId) where.createdBy = filters.teacherId;
  if (filters.classId) where.classId = filters.classId;

  if (filters.studentId) {
    where.AND = [
      {
        targetStudents: { some: { studentId: filters.studentId } },
      },
    ];
  }

  const [assignments, total] = await Promise.all([
    db.assignment.findMany({
      where,
      include: {
        class: { select: { name: true } },
        _count: { select: { submissions: true, questions: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 20,
      skip: filters.offset ?? 0,
    }),
    db.assignment.count({ where }),
  ]);

  return { assignments, total };
}

export async function getAssignmentSubmissions(assignmentId: string) {
  return db.submission.findMany({
    where: { assignmentId },
    include: {
      student: { select: { id: true, name: true, nameZh: true, class: { select: { name: true } } } },
    },
    orderBy: { submittedAt: 'desc' },
  });
}

export async function getStudentSubmission(assignmentId: string, studentId: string) {
  return db.submission.findFirst({
    where: { assignmentId, studentId },
  });
}

// ============================================
// Mutations
// ============================================

export async function createAssignment(data: Prisma.AssignmentCreateInput) {
  return db.assignment.create({ data });
}

export async function updateAssignment(id: string, data: Prisma.AssignmentUpdateInput) {
  return db.assignment.update({ where: { id }, data });
}

export async function deleteAssignment(id: string) {
  return db.assignment.delete({ where: { id } });
}

export async function createSubmission(data: Prisma.SubmissionCreateInput) {
  return db.submission.create({ data });
}

export async function gradeSubmission(
  assignmentId: string,
  studentId: string,
  score: number,
  feedback?: string,
) {
  return db.submission.updateMany({
    where: { assignmentId, studentId },
    data: { score, status: 'graded', gradedAt: new Date() },
  });
}
