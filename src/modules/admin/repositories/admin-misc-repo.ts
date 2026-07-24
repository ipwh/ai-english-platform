// v5: AdminMiscRepository — notification, writingDraft, integratedSkillsDraft, studentMastery, teacherClass, group
// Thin delegation wrappers over Prisma. All models verified in schema.prisma.
import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma args are complex conditional types; Record<string, unknown> loses inference
type PrismaArgs = any;

export async function adminDeleteNotifications(args: PrismaArgs) { return db.notification.deleteMany(args as Prisma.NotificationDeleteManyArgs); }
export async function adminDeleteWritingDrafts(args: PrismaArgs) { return db.writingDraft.deleteMany(args as Prisma.WritingDraftDeleteManyArgs); }
export async function adminFindIntegratedDraft(args: PrismaArgs) { return db.integratedSkillsDraft.findUnique(args as Prisma.IntegratedSkillsDraftFindUniqueArgs); }
export async function adminUpsertMastery(args: PrismaArgs) { return db.studentMastery.upsert(args as Prisma.StudentMasteryUpsertArgs); }
export async function adminUpsertTeacherClass(args: PrismaArgs) { return db.teacherClass.upsert(args as Prisma.TeacherClassUpsertArgs); }
export async function adminDeleteTeacherClasses(args: PrismaArgs) { return db.teacherClass.deleteMany(args as Prisma.TeacherClassDeleteManyArgs); }
export async function adminCreateTeacherClass(args: PrismaArgs) { return db.teacherClass.create(args as Prisma.TeacherClassCreateArgs); }
export async function adminDeleteSessions(args: PrismaArgs) { return db.practiceSession.deleteMany(args as Prisma.PracticeSessionDeleteManyArgs); }
export async function adminDeleteGroups(args: PrismaArgs) { return db.group.deleteMany(args as Prisma.GroupDeleteManyArgs); }
export async function adminDeleteGroupMembers(args: PrismaArgs) { return db.groupMember.deleteMany(args as Prisma.GroupMemberDeleteManyArgs); }
export async function adminDeleteAccounts(args: PrismaArgs) { return db.account.deleteMany(args as Prisma.AccountDeleteManyArgs); }
export async function adminDeleteStudentClasses(args: PrismaArgs) { return db.studentClass.deleteMany(args as Prisma.StudentClassDeleteManyArgs); }
export async function adminDeleteUserPreferences(args: PrismaArgs) { return db.userPreferences.deleteMany(args as Prisma.UserPreferencesDeleteManyArgs); }
export async function adminDeleteVocabItems(args: PrismaArgs) { return db.vocabItem.deleteMany(args as Prisma.VocabItemDeleteManyArgs); }
export async function adminFindAssignmentGroup(args: PrismaArgs) { return db.assignmentGroup.findMany(args as Prisma.AssignmentGroupFindManyArgs); }
export async function adminCountAssignmentStudent(args: PrismaArgs) { return db.assignmentStudent.count(args as Prisma.AssignmentStudentCountArgs); }
export async function adminCountGroupMember(args: PrismaArgs) { return db.groupMember.count(args as Prisma.GroupMemberCountArgs); }
export async function adminFindGroupMember(args: PrismaArgs) { return db.groupMember.findMany(args as Prisma.GroupMemberFindManyArgs); }
export async function adminFindTeacherClass(args: PrismaArgs) { return db.teacherClass.findFirst(args as Prisma.TeacherClassFindFirstArgs); }
