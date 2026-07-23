    // v5: AdminOperations — single service for all admin db operations
// Exists ONLY to eliminate db imports from admin routes.
// Each method corresponds to a route's db needs.
import { db, getBulkDb } from '@/shared/db/db';

// ── admin/classes ──
export async function adminGetClasses() {
  return db.class.findMany({ where: { name: { not: 'Demo' } }, include: { _count: { select: { students: true, assignments: true } } }, orderBy: { name: 'asc' } });
}
export async function adminCreateClass(data: { name: string; gradeLevel: string; academicYear?: string }) {
  return db.class.create({ data: { ...data, academicYear: data.academicYear || '2025-2026' } });
}
export async function adminDeleteClass(id: string) {
  return db.class.delete({ where: { id } });
}
export async function adminLinkEducators(cls: any, educators: any[]) {
  for (const educator of educators) {
    await (db as any).teacherClass.upsert({ where: { teacherId_classId: { teacherId: educator.id, classId: cls.id } }, update: {}, create: { teacherId: educator.id, classId: cls.id } });
  }
}
export async function adminFindEducators() {
  return db.user.findMany({ where: { role: { in: ['teacher', 'admin'] } }, select: { id: true, role: true } });
}

// ── admin/ensure-admin ──
export async function adminEnsureGetUser(email: string) {
  return db.user.findUnique({ where: { email }, select: { id: true, role: true } });
}
export async function adminEnsureUpdateUser(email: string, data: any) {
  return db.user.update({ where: { email }, data });
}
export async function adminEnsureCreateUser(data: any) {
  return db.user.create({ data });
}

// ── admin/cleanup-mock-data ──
export async function adminCleanupFindMockUsers(olderThan: Date) {
  return db.user.findMany({ where: { email: { contains: 'mock' }, createdAt: { lt: olderThan } }, select: { id: true, email: true } });
}
export async function adminCleanupDeleteNotifications(userIds: string[]) {
  return db.notification.deleteMany({ where: { userId: { in: userIds } } });
}
export async function adminCleanupDeleteWritingDrafts(studentIds: string[]) {
  return db.writingDraft.deleteMany({ where: { studentId: { in: studentIds } } });
}
export async function adminCleanupDeleteVocabItems(studentIds: string[]) {
  return db.vocabItem.deleteMany({ where: { studentId: { in: studentIds } } });
}
export async function adminCleanupDeleteMistakes(studentIds: string[]) {
  return db.mistake.deleteMany({ where: { studentId: { in: studentIds } } });
}
export async function adminCleanupDeletePracticeSessions(studentIds: string[]) {
  return db.practiceSession.deleteMany({ where: { studentId: { in: studentIds } } });
}
export async function adminCleanupDeleteSubmissions(studentIds: string[]) {
  return db.submission.deleteMany({ where: { studentId: { in: studentIds } } });
}
export async function adminCleanupDeleteAccounts(userIds: string[]) {
  return (db as any).account.deleteMany({ where: { userId: { in: userIds } } });
}
export async function adminCleanupDeleteSessions(userIds: string[]) {
  return db.practiceSession.deleteMany({ where: { studentId: { in: userIds } } });
}
export async function adminCleanupDeleteMaterials(uploaderIds: string[]) {
  return db.material.deleteMany({ where: { uploadedBy: { in: uploaderIds } } });
}
export async function adminCleanupDeleteAssignments(creatorIds: string[]) {
  return db.assignment.deleteMany({ where: { createdBy: { in: creatorIds } } });
}
export async function adminCleanupDeleteClasses() {
  return db.class.deleteMany({ where: { students: { none: {} } } });
}
export async function adminCleanupDeleteUsers(userIds: string[]) {
  return db.user.deleteMany({ where: { id: { in: userIds } } });
}
export async function adminCleanupCountAllUsers() {
  return db.user.count();
}

// ── Bulk import operations ──
export function adminGetBulkDb() { return getBulkDb(); }
export { db as adminDb } from '@/shared/db/db';

// ── admin/export-sheets ──
export async function adminExportGroupByUsers(args: any) { return db.user.groupBy(args as any); }
export async function adminExportCountUsers(args: any) { return db.user.count(args); }

// ── admin/export/students ──
export async function adminExportFindStudents(where: any) {
  return db.user.findMany({ where, orderBy: { classNumber: 'asc' }, select: { id: true, name: true, nameZh: true, nameEn: true, email: true, classNumber: true, level: true, xp: true, streakDays: true, overallAccuracy: true, class: { select: { name: true, gradeLevel: true } } } });
}

// ── admin/export/teachers ──
export async function adminExportFindTeachers() {
  return db.user.findMany({ where: { role: 'teacher' }, select: { id: true, name: true, nameZh: true, nameEn: true, email: true }, orderBy: { name: 'asc' } });
}

// ── admin/export/stream/students ──
export async function adminExportStreamStudents(where: any, skip: number, take: number) {
  return db.user.findMany({ where, select: { id: true, name: true, nameZh: true, nameEn: true, email: true, classNumber: true, xp: true, streakDays: true, overallAccuracy: true, class: { select: { name: true } } }, orderBy: { classNumber: 'asc' }, skip, take });
}

// ── admin/fix-classes ──
export async function adminFixGetUsersWithoutClass() {
  return db.user.findMany({ where: { role: 'student', OR: [{ classId: null }, { class: null }] }, select: { id: true, classNumber: true } });
}
export async function adminFixGetAllClasses() { return db.class.findMany(); }
export async function adminFixCreateClass(data: any) { return db.class.create({ data }); }
export async function adminFixUpdateUserClass(userId: string, classId: string) {
  return db.user.update({ where: { id: userId }, data: { classId } });
}

// ── admin/login-logs ──
export async function adminLoginLogsFind(take: number) { return db.loginLog.findMany({ orderBy: { loginAt: 'desc' }, take }); }
export async function adminLoginLogsCount() { return db.loginLog.count(); }
export async function adminLoginLogsCreate(data: any) { return db.loginLog.create({ data }); }

// ── admin/stats ──
export async function adminStatsGroupUsers(args: any) { return (db.user as any).groupBy(args); }
export async function adminStatsCountUsers(where: any) { return db.user.count({ where }); }
export async function adminStatsCountClasses() { return db.class.count(); }
export async function adminStatsCountAssignments() { return db.assignment.count(); }
export async function adminStatsCountSubmissions() { return db.submission.count(); }

// ── admin/students/[id]/analytics ──
export async function adminAnalyticsFindUser(id: string) {
  return db.user.findUnique({ where: { id }, select: { id: true, email: true, nameZh: true, nameEn: true, level: true, overallAccuracy: true, classNumber: true, xp: true, badgeIds: true, streakDays: true, academicYear: true, classId: true, class: { select: { id: true, name: true, gradeLevel: true } }, studentClasses: { select: { classId: true } } } });
}
export async function adminAnalyticsFindSessions(studentId: string) {
  return db.practiceSession.findMany({ where: { studentId }, orderBy: { startedAt: 'desc' }, take: 50 });
}
export async function adminAnalyticsFindMistakes(studentId: string) {
  return db.mistake.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' }, take: 50 });
}
export async function adminAnalyticsCountVocab(studentId: string, familiarity?: string) {
  return db.vocabItem.count({ where: { studentId, ...(familiarity ? { familiarity } : {}) } });
}
export async function adminAnalyticsFindDrafts(studentId: string) {
  return db.writingDraft.findMany({ where: { studentId }, orderBy: { updatedAt: 'desc' }, take: 20 });
}
export async function adminAnalyticsFindXp(userId: string) {
  return db.xpTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
}
export async function adminAnalyticsFindSnapshots(studentId: string) {
  return (db as any).weeklySnapshot.findMany({ where: { studentId }, orderBy: { weekStart: 'desc' }, take: 12 });
}
export async function adminAnalyticsFindSubmissions(studentId: string) {
  return db.submission.findMany({ where: { studentId }, orderBy: { submittedAt: 'desc' }, take: 50 });
}

// ── admin/users/[userId] ──
export async function adminUserFindById(id: string) { return db.user.findUnique({ where: { id } }); }
export async function adminUserUpsertClass(name: string, gradeLevel: string) {
  return db.class.upsert({ where: { name }, update: {}, create: { name, gradeLevel } });
}
export async function adminUserUpdate(id: string, data: any) { return db.user.update({ where: { id }, data }); }
export async function adminUserDeleteCascade(userId: string) {
  await db.$transaction([
    db.submission.deleteMany({ where: { studentId: userId } }),
    (db as any).review.deleteMany({ where: { OR: [{ studentId: userId }, { teacherId: userId }] } }),
    db.assignment.deleteMany({ where: { createdBy: userId } }),
    db.material.deleteMany({ where: { uploadedBy: userId } }),
    (db as any).group.deleteMany({ where: { createdBy: userId } }),
    (db as any).groupMember.deleteMany({ where: { studentId: userId } }),
    (db as any).assignmentStudent.deleteMany({ where: { studentId: userId } }),
    (db as any).account.deleteMany({ where: { userId } }),
    (db as any).session.deleteMany({ where: { userId } }),
    db.practiceSession.deleteMany({ where: { studentId: userId } }),
    (db as any).integratedSkillsDraft.deleteMany({ where: { studentId: userId } }),
    (db as any).userPreferences.deleteMany({ where: { userId } }),
    (db as any).studentClass.deleteMany({ where: { studentId: userId } }),
  ]);
  return db.user.delete({ where: { id: userId } });
}

// ── admin/sync-sheets ──
export { db as adminDbDirect } from '@/shared/db/db';

// ── admin/import routes ──
// adminGetBulkDb already defined above

// ── api/import ──
export async function adminImportFindUser(email: string) {
  return db.user.findUnique({ where: { email }, select: { id: true, role: true } });
}

// ── admin/import/teachers ──
export async function adminImportTeachersFindUsers(emails: string[]) {
  return db.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
}

// ── Generic catch-all for admin routes (use as LAST RESORT only) ──
export async function adminDbQuery(model: string, method: string, args: any) {
  return (db as any)[model][method](args);
}
