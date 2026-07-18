const fs = require('fs');
const repos = {
  'src/modules/student/repositories/student-repo.ts': `import { db } from '@/shared/db/db';
export async function findUserById(id: string) { return db.user.findUnique({ where: { id }, include: { class: true } }); }
export async function findUserByEmail(email: string) { return db.user.findUnique({ where: { email: email.toLowerCase() }, include: { class: true } }); }
export async function updateUserPassword(id: string, hash: string) { return db.user.update({ where: { id }, data: { passwordHash: hash } }); }
export async function updateUser(id: string, data: any) { return db.user.update({ where: { id }, data }); }
`,
  'src/modules/assessment/repositories/assessment-repo.ts': `import { db } from '@/shared/db/db';
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
`,
  'src/modules/vocabulary/repositories/vocabulary-repo.ts': `import { db } from '@/shared/db/db';
export async function listVocab(studentId: string) { return db.vocabItem.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } }); }
export async function findVocabById(id: string) { return db.vocabItem.findUnique({ where: { id } }); }
export async function findVocabByWord(studentId: string, word: string) { return db.vocabItem.findFirst({ where: { studentId, word } }); }
export async function createVocab(data: any) { return db.vocabItem.create({ data }); }
export async function updateVocab(id: string, data: any) { return db.vocabItem.update({ where: { id }, data }); }
export async function deleteVocab(id: string) { return db.vocabItem.delete({ where: { id } }); }
export async function getDueVocabForReview(studentId: string, limit = 20) { return db.vocabItem.findMany({ where: { studentId, nextReviewDate: { lte: new Date() } }, orderBy: { nextReviewDate: 'asc' }, take: limit }); }
export async function countVocab(studentId: string) { return db.vocabItem.count({ where: { studentId } }); }
export async function getVocabStats(studentId: string) { const [total, mastered] = await Promise.all([db.vocabItem.count({ where: { studentId } }), db.vocabItem.count({ where: { studentId, familiarity: { in: ['familiar','mastered'] } } })]); return { total, mastered, learning: total - mastered }; }
`,
};

for (const [filepath, content] of Object.entries(repos)) {
  const dir = require('path').dirname(filepath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch(e) { if (e.code !== 'EEXIST') throw e; }
  // If it exists but is a file/junction, remove it first
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory()) { fs.unlinkSync(dir); fs.mkdirSync(dir, { recursive: true }); }
  fs.writeFileSync(filepath, content, 'utf8');
  console.log('Written:', filepath);
}
console.log('All repos written.');
