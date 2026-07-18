import { db } from '@/shared/db/db';
export async function findAssignmentById(id: string) { return db.assignment.findUnique({ where: { id }, include: { questions: true, class: true } }); }
export async function listAssignments(filters: any) { const where: any = {}; if (filters.teacherId) where.createdBy = filters.teacherId; if (filters.classId) where.classId = filters.classId; return db.assignment.findMany({ where, include: { class: { select: { name: true } }, _count: { select: { submissions: true } } }, orderBy: { createdAt: 'desc' } }); }
export async function getSubmissions(assignmentId: string) { return db.submission.findMany({ where: { assignmentId }, include: { student: { select: { id: true, name: true, nameZh: true } } }, orderBy: { submittedAt: 'desc' } }); }
export async function getStudentSubmission(assignmentId: string, studentId: string) { return db.submission.findFirst({ where: { assignmentId, studentId } }); }
export async function createSubmission(data: any) { return db.submission.create({ data }); }
export async function listMistakes(studentId: string) { return db.mistake.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } }); }
export async function createMistake(data: any) { return db.mistake.create({ data }); }
export async function listWritingDrafts(studentId: string) { return db.writingDraft.findMany({ where: { studentId }, orderBy: { updatedAt: 'desc' } }); }
export async function createWritingDraft(data: any) { return db.writingDraft.create({ data }); }
export async function updateWritingDraft(id: string, data: any) { return db.writingDraft.update({ where: { id }, data }); }
