    // v5: AdminOperations — single service for all admin db operations
// Exists ONLY to eliminate db imports from admin routes.
// Each method corresponds to a route's db needs.
import { db, getBulkDb } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';
import { SCHOOL_EMAIL_DOMAINS, isSchoolDomainEmail } from '@/shared/auth/sign-in-role';

// ── admin/classes ──
export async function adminGetClasses() {
  return db.class.findMany({ where: { name: { not: 'Demo' } }, include: { _count: { select: { students: true, assignments: true } } }, orderBy: { name: 'asc' } });
}
export async function adminCreateClass(data: { name: string; gradeLevel: string; academicYear?: string }) {
  return db.class.create({ data: { ...data, academicYear: data.academicYear || '2026-2027' } });
}
export async function adminDeleteClass(id: string) {
  return db.class.delete({ where: { id } });
}
/**
 * 把班級連結到指定的教師／管理員（冪等）。
 *
 * 2026-10-08：由 `/api/admin/classes` POST 抽出的**唯一實作**，修復腳本
 * `scripts/link-teachers-to-classes.ts` 亦呼叫同一函式 —— 教師名單／作答情況
 * 的授權一律以 `TeacherClass` 為權威，兩處各自手寫 upsert 會再次分歧。
 * 回傳已建立／已存在的關聯數（＝educators.length）。
 */
export async function adminLinkEducators(classId: string, educators: Array<{ id: string }>) {
  for (const educator of educators) {
    await db.teacherClass.upsert({
      where: { teacherId_classId: { teacherId: educator.id, classId } },
      update: {},
      create: { teacherId: educator.id, classId },
    });
  }
  return educators.length;
}
/**
 * 教師／管理員名單（自動連結的對象）。
 *
 * 2026-10-08 政策：**只有校內網域帳號**可以取得教師權限（規則單一 owner：
 * `@/shared/auth/sign-in-role`）⇒ 這裡一併以網域過濾，非校內網域帳號永不
 * 取得任何班級關聯（此過濾同時適用於管理員路由與
 * `scripts/link-teachers-to-classes.ts`）。
 */
export async function adminFindEducators() {
  return db.user.findMany({
    where: {
      role: { in: ['teacher', 'admin'] },
      OR: SCHOOL_EMAIL_DOMAINS.map(domain => ({ email: { endsWith: `@${domain}`, mode: 'insensitive' as const } })),
    },
    select: { id: true, role: true, email: true },
  });
}

/**
 * 新教師首次登入的自動授權：把該教師連結到**所有現行班級**（不含 Demo）。
 *
 * 2026-10-08 生產事故：教師帳號由首次 Google 登入自動建立，該路徑只寫 `User`,
 * 令 `TeacherClass` 全空 ⇒ 教師端學生名單／班級清單／作答情況全部看不到。
 * 與 `adminLinkEducators()` 共用同一 upsert 實作（TeacherClass 寫入單一 owner）。
 *
 * 護欄：**只有校內網域的教師／管理員**會被連結（非校內網域帳號一律判定為學生，
 * 永不取得班級關聯）；不合法或查不到的帳號回 0 並不做任何寫入（fail-closed）。
 *
 * **刻意只在帳號建立時呼叫**：管理員日後移除某教師的全部班級即可收回權限，
 * 之後的登入不會自動復原（否則無法用「解除關聯」撤權）。
 */
export async function adminLinkTeacherToAllClasses(teacherId: string): Promise<number> {
  const teacher = await db.user.findUnique({ where: { id: teacherId }, select: { role: true, email: true } });
  const isEducator = teacher?.role === 'teacher' || teacher?.role === 'admin';
  if (!teacher || !isEducator || !isSchoolDomainEmail(teacher.email)) return 0;

  const classes = await adminGetClasses();
  for (const cls of classes) {
    await adminLinkEducators(cls.id, [{ id: teacherId }]);
  }
  return classes.length;
}

// ── admin/ensure-admin ──
export async function adminEnsureGetUser(email: string) {
  return db.user.findUnique({ where: { email }, select: { id: true, role: true } });
}
export async function adminEnsureUpdateUser(email: string, data: Prisma.UserUpdateInput) {
  return db.user.update({ where: { email }, data });
}
export async function adminEnsureCreateUser(data: Prisma.UserCreateInput) {
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
  return db.account.deleteMany({ where: { userId: { in: userIds } } });
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
export async function adminExportGroupByUsers(args: Prisma.UserGroupByArgs) {
  return db.user.groupBy(args as unknown as Parameters<typeof db.user.groupBy>[0]);
}
export async function adminExportCountUsers(args: Prisma.UserCountArgs) { return db.user.count(args); }

// ── admin/export/students ──
export async function adminExportFindStudents(where: Prisma.UserWhereInput) {
  return db.user.findMany({ where, orderBy: { classNumber: 'asc' }, select: { id: true, name: true, nameZh: true, nameEn: true, email: true, classNumber: true, level: true, xp: true, streakDays: true, overallAccuracy: true, class: { select: { name: true, gradeLevel: true } } } });
}

// ── admin/export/teachers ──
export async function adminExportFindTeachers() {
  return db.user.findMany({ where: { role: 'teacher' }, select: { id: true, name: true, nameZh: true, nameEn: true, email: true }, orderBy: { name: 'asc' } });
}

// ── admin/export/stream/students ──
export async function adminExportStreamStudents(where: Prisma.UserWhereInput, skip: number, take: number) {
  return db.user.findMany({ where, select: { id: true, name: true, nameZh: true, nameEn: true, email: true, classNumber: true, xp: true, streakDays: true, overallAccuracy: true, class: { select: { name: true } } }, orderBy: { classNumber: 'asc' }, skip, take });
}

// ── admin/fix-classes ──
export async function adminFixGetUsersWithoutClass() {
  return db.user.findMany({ where: { role: 'student', OR: [{ classId: null }, { class: null }] }, select: { id: true, classNumber: true } });
}
export async function adminFixGetAllClasses() { return db.class.findMany(); }
export async function adminFixCreateClass(data: Prisma.ClassCreateInput) { return db.class.create({ data }); }
export async function adminFixUpdateUserClass(userId: string, classId: string) {
  return db.user.update({ where: { id: userId }, data: { classId } });
}

// ── admin/login-logs ──
export async function adminLoginLogsFind(take: number) { return db.loginLog.findMany({ orderBy: { loginAt: 'desc' }, take }); }
export async function adminLoginLogsCount() { return db.loginLog.count(); }
export async function adminLoginLogsCreate(data: Prisma.LoginLogCreateInput) { return db.loginLog.create({ data }); }

// ── admin/stats ──
export async function adminStatsGroupUsers(args: Prisma.UserGroupByArgs) {
  return db.user.groupBy(args as unknown as Parameters<typeof db.user.groupBy>[0]);
}
export async function adminStatsCountUsers(where: Prisma.UserWhereInput) { return db.user.count({ where }); }
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
  return db.weeklySnapshot.findMany({ where: { userId: studentId }, orderBy: { weekStart: 'desc' }, take: 12 });
}
export async function adminAnalyticsFindSubmissions(studentId: string) {
  return db.submission.findMany({ where: { studentId }, orderBy: { submittedAt: 'desc' }, take: 50 });
}

// ── admin/users/[userId] ──
export async function adminUserFindById(id: string) { return db.user.findUnique({ where: { id } }); }
export async function adminUserUpsertClass(name: string, gradeLevel: string) {
  return db.class.upsert({ where: { name }, update: {}, create: { name, gradeLevel } });
}
export async function adminUserUpdate(id: string, data: Prisma.UserUpdateInput) { return db.user.update({ where: { id }, data }); }
export async function adminUserDeleteCascade(userId: string) {
  await db.$transaction([
    db.submission.deleteMany({ where: { studentId: userId } }),
    db.review.deleteMany({ where: { OR: [{ studentId: userId }, { teacherId: userId }] } }),
    db.assignment.deleteMany({ where: { createdBy: userId } }),
    db.material.deleteMany({ where: { uploadedBy: userId } }),
    db.group.deleteMany({ where: { createdBy: userId } }),
    db.groupMember.deleteMany({ where: { studentId: userId } }),
    db.assignmentStudent.deleteMany({ where: { studentId: userId } }),
    db.account.deleteMany({ where: { userId } }),
    db.session.deleteMany({ where: { userId } }),
    db.practiceSession.deleteMany({ where: { studentId: userId } }),
    db.integratedSkillsDraft.deleteMany({ where: { userId } }),
    db.userPreferences.deleteMany({ where: { userId } }),
    db.studentClass.deleteMany({ where: { studentId: userId } }),
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
// Deliberately untyped dynamic façade: the caller's Prisma args/result shape is only
// known at the call site, and typing this as `unknown` breaks the 40+ admin call sites
// that read the result (measured 2026-10-10: 30 TS18046/TS2339 errors). The typed
// wrappers above are the preferred path.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- documented dynamic façade (see above)
export async function adminDbQuery(model: string, method: string, args: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same façade: `db` is indexed by the caller's model name
  return (db as any)[model][method](args);
}
