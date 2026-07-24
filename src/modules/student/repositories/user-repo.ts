// v5: User Repository — data access for user/profile/class/group operations
import { db } from '@/shared/db/db';

export async function findUserById(id: string) {
  return db.user.findUnique({ where: { id } });
}

export async function findUserByIdSelect<T extends Record<string, boolean>>(id: string, select: T) {
  return db.user.findUnique({ where: { id }, select });
}

export async function updateUser(id: string, data: Record<string, unknown>) {
  return db.user.update({ where: { id }, data });
}

export async function getUserXp(userId: string) {
  const result = await db.xpTransaction.aggregate({ where: { userId }, _sum: { xpAmount: true } });
  return result._sum.xpAmount ?? 0;
}

export async function getUserStreakDays(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { streakDays: true } });
  return user?.streakDays ?? 0;
}

// Class queries
export async function listClasses(teacherId?: string) {
  return db.class.findMany({
    where: { name: { not: 'Demo' }, ...(teacherId ? { teachers: { some: { teacherId } } } : {}) },
    include: { _count: { select: { students: true, assignments: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function listAllClasses() {
  return db.class.findMany({ select: { id: true, name: true, gradeLevel: true }, orderBy: { name: 'asc' } });
}

export async function createClass(data: { name: string; gradeLevel: string; academicYear?: string }) {
  return db.class.create({ data: { name: data.name, gradeLevel: data.gradeLevel, academicYear: data.academicYear || '2025-2026' } });
}

export async function findClassByName(name: string) {
  return db.class.findFirst({ where: { name } });
}

export async function deleteClass(id: string) {
  return db.class.delete({ where: { id } });
}

// Group queries
export async function listGroups(teacherId: string) {
  return db.group.findMany({
    where: { createdBy: teacherId },
    include: { _count: { select: { members: true, assignments: true } }, members: { include: { student: { select: { id: true, name: true, nameZh: true, email: true, class: { select: { name: true } } } } } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findGroupById(id: string) {
  return db.group.findUnique({ where: { id }, select: { createdBy: true } });
}

export async function createGroup(data: { name: string; description?: string; createdBy: string }) {
  return db.group.create({ data: { name: data.name, description: data.description || '', createdBy: data.createdBy } });
}

export async function updateGroup(id: string, data: Record<string, unknown>) {
  return db.group.update({ where: { id }, data });
}

export async function deleteGroup(id: string) {
  await db.assignmentGroup.deleteMany({ where: { groupId: id } });
  await db.groupMember.deleteMany({ where: { groupId: id } });
  return db.group.delete({ where: { id } });
}

// Preferences
export async function getUserPreferences(userId: string) {
  return db.userPreferences.findUnique({ where: { userId } });
}

export async function upsertUserPreferences(userId: string, data: Record<string, unknown>) {
  return db.userPreferences.upsert({ where: { userId }, update: data, create: { userId, ...data } });
}

// Teacher class relations
export async function findTeacherClass(teacherId: string, className: string) {
  return db.teacherClass.findFirst({ where: { teacherId, class: { name: className } } });
}
export async function listTeacherClasses(teacherId: string) {
  return db.teacherClass.findMany({ where: { teacherId }, include: { class: true } });
}
export async function deleteTeacherClasses(teacherId: string) {
  return db.teacherClass.deleteMany({ where: { teacherId } });
}
export async function createTeacherClass(teacherId: string, classId: string) {
  return db.teacherClass.create({ data: { teacherId, classId } });
}

// Student analytics
export async function getStudentAnalytics(studentId: string) {
  const [sessions, mistakes, vocabTotal, vocabMastered, drafts, xp, snapshots, submissions] = await Promise.all([
    db.practiceSession.findMany({ where: { studentId }, select: { skill: true, totalQuestions: true, correctCount: true, startedAt: true }, orderBy: { startedAt: 'desc' }, take: 50 }),
    db.mistake.findMany({ where: { studentId }, select: { mistakeType: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db.vocabItem.count({ where: { studentId } }),
    db.vocabItem.count({ where: { studentId, familiarity: 'mastered' } }),
    db.writingDraft.findMany({ where: { studentId }, select: { id: true, title: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
    db.xpTransaction.findMany({ where: { userId: studentId }, select: { event: true, xpAmount: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db.weeklySnapshot.findMany({ where: { userId: studentId }, select: { weekStart: true, xpGained: true, sessionsCompleted: true, accuracy: true }, orderBy: { weekStart: 'desc' }, take: 20 }),
    db.submission.findMany({ where: { studentId }, select: { id: true, score: true, status: true, submittedAt: true, assignment: { select: { title: true } } }, orderBy: { submittedAt: 'desc' }, take: 20 }),
  ]);
  return { sessions, mistakes, vocabTotal, vocabMastered, drafts, xp, snapshots, submissions };
}

// Submission/Review queries
export async function listSubmissionsForReview(take = 50) {
  return db.submission.findMany({
    where: { status: { in: ['submitted', 'graded'] } },
    select: { id: true, score: true, aiFeedback: true, status: true, answers: true, submittedAt: true, student: { select: { id: true, nameZh: true, nameEn: true, class: { select: { name: true } } } }, assignment: { select: { id: true, title: true, questions: { select: { id: true, prompt: true, answer: true, questionType: true } } } } },
    orderBy: { submittedAt: 'desc' },
    take,
  });
}
export async function findSubmissionById(id: string) {
  return db.submission.findUnique({ where: { id } });
}
export async function updateSubmission(id: string, data: Record<string, unknown>) {
  return db.submission.update({ where: { id }, data });
}
export async function findReviewBySubmission(submissionId: string) {
  return db.review.findFirst({ where: { submissionId } });
}
export async function findReviewsBySubmissions(submissionIds: string[]) {
  return db.review.findMany({ where: { submissionId: { in: submissionIds } }, select: { submissionId: true, teacherScore: true, teacherFeedback: true, status: true } });
}
export async function createReview(data: { submissionId: string; teacherScore?: number; teacherFeedback?: string; status?: string }) {
  return db.review.create({ data } as Parameters<typeof db.review.create>[0]);
}

// Integrated Skills drafts
export async function findIntegratedSkillsDraft(studentId: string) {
  return db.integratedSkillsDraft.findUnique({ where: { userId: studentId } });
}
export async function upsertIntegratedSkillsDraft(studentId: string, data: Record<string, unknown>) {
  return db.integratedSkillsDraft.upsert({ where: { userId: studentId }, update: data, create: { userId: studentId, ...data } });
}
export async function deleteIntegratedSkillsDraft(userId: string) {
  return db.integratedSkillsDraft.deleteMany({ where: { userId } });
}

// Assignment queries
export async function listAssignments(where: Record<string, unknown>) {
  return db.assignment.findMany({ where, include: { _count: { select: { submissions: true } } }, orderBy: { createdAt: 'desc' } });
}
export async function findAssignmentById(id: string) {
  return db.assignment.findUnique({ where: { id } });
}
export async function findAssignmentSubmissions(assignmentId: string) {
  return db.submission.findMany({ where: { assignmentId }, select: { studentId: true, status: true } });
}

// SSE notifications
export async function getUnreadNotificationCount(userId: string) {
  return db.notification.count({ where: { userId, read: false } });
}
export async function markNotificationsRead(userId: string, ids: string[]) {
  return db.notification.updateMany({ where: { userId, id: { in: ids } }, data: { read: true } });
}

// Assignment mutations
export async function createAssignment(data: Record<string, unknown>) {
  return db.assignment.create({ data: data as any });
}

// Bulk DB operations (import)
export { db as bulkDb } from '@/shared/db/db';

// Admin user management
export async function listAllUsers(where?: Record<string, unknown>, take?: number) {
  return db.user.findMany({ where: where ?? {}, orderBy: { createdAt: 'desc' }, take });
}
export async function listUsersAdmin(args: { where?: any; select?: any; orderBy?: any; skip?: number; take?: number }) {
  return db.user.findMany(args);
}
export async function countUsers(where?: Record<string, unknown>) {
  return db.user.count({ where });
}
export async function deleteUser(id: string) {
  return db.user.delete({ where: { id } });
}
export async function listLoginLogs(take = 100) {
  return db.loginLog.findMany({ orderBy: { loginAt: 'desc' }, take });
}
export async function createLoginLog(data: { userId: string }) {
  return db.loginLog.create({ data: { userId: data.userId, loginAt: new Date() } } as any);
}
export async function getAdminStats() {
  const [totalUsers, totalStudents, totalTeachers, totalClasses, totalAssignments, totalSubmissions] = await Promise.all([
    db.user.count(), db.user.count({ where: { role: 'student' } }), db.user.count({ where: { role: 'teacher' } }),
    db.class.count(), db.assignment.count(), db.submission.count(),
  ]);
  return { totalUsers, totalStudents, totalTeachers, totalClasses, totalAssignments, totalSubmissions };
}
export async function cleanupMockData(olderThan: Date) {
  return db.user.deleteMany({ where: { email: { contains: 'mock' }, createdAt: { lt: olderThan } } });
}
export async function ensureAdmin(email: string) {
  return db.user.updateMany({ where: { email }, data: { role: 'admin' } });
}
export async function getClassAnalytics() {
  return db.class.findMany({ include: { _count: { select: { students: true } }, students: { select: { xp: true, streakDays: true } } } });
}

// User creation
export async function findUserByEmail(email: string) {
  return db.user.findUnique({ where: { email } });
}
export async function createUser(args: any) {
  return db.user.create(args);
}
export async function upsertClass(name: string, extra: any = {}) {
  return db.class.upsert({ where: { name }, update: {}, create: { name, ...extra } });
}

// Group member queries
export async function listGroupMembers(groupIds: string[]) {
  return db.groupMember.findMany({ where: { groupId: { in: groupIds } }, select: { groupId: true, studentId: true } });
}
