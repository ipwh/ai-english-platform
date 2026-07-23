// v5: Writing Draft Repository — data access for writing drafts
import { db } from '@/shared/db/db';

export async function listDrafts(studentId: string, status?: string) {
  return db.writingDraft.findMany({
    where: { studentId, ...(status ? { status } : {}) },
    select: {
      id: true, title: true, prompt: true, draft: true,
      revisedVersion: true, status: true, aiSuggestions: true,
      chinglishWarnings: true, teacherComment: true,
      createdAt: true, updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
}

export async function findDraftById(id: string) {
  return db.writingDraft.findUnique({ where: { id } });
}

export async function createDraft(data: {
  studentId: string; title: string; prompt?: string;
  draft?: string; aiSuggestions?: unknown; chinglishWarnings?: unknown;
}) {
  return db.writingDraft.create({
    data: {
      studentId: data.studentId,
      title: data.title,
      prompt: data.prompt || '',
      draft: data.draft || '',
      aiSuggestions: data.aiSuggestions ? JSON.stringify(data.aiSuggestions) : null,
      chinglishWarnings: data.chinglishWarnings ? JSON.stringify(data.chinglishWarnings) : null,
      status: 'draft',
    },
  });
}

export async function updateDraft(id: string, data: Record<string, unknown>) {
  return db.writingDraft.update({ where: { id }, data });
}

export async function findDraftWithRevisions(id: string) {
  return db.writingDraft.findUnique({
    where: { id },
    select: { id: true, revisions: true, draft: true, studentId: true },
  });
}

export async function findLatestDraft(studentId: string) {
  return db.writingDraft.findFirst({
    where: { studentId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, revisions: true, draft: true },
  });
}

export async function countDrafts(studentId: string) {
  return db.writingDraft.count({ where: { studentId } });
}
