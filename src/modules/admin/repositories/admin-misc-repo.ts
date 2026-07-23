// v5: AdminMiscRepository — notification, writingDraft, integratedSkillsDraft, studentMastery, teacherClass, group
import { db } from '@/shared/db/db';

export async function adminDeleteNotifications(args: any) { return db.notification.deleteMany(args); }
export async function adminDeleteWritingDrafts(args: any) { return db.writingDraft.deleteMany(args); }
export async function adminFindIntegratedDraft(args: any) { return db.integratedSkillsDraft.findUnique(args); }
export async function adminUpsertMastery(args: any) { return (db as any).studentMastery.upsert(args); }
export async function adminUpsertTeacherClass(args: any) { return (db as any).teacherClass.upsert(args); }
export async function adminDeleteTeacherClasses(args: any) { return (db as any).teacherClass.deleteMany(args); }
export async function adminCreateTeacherClass(args: any) { return (db as any).teacherClass.create(args); }
export async function adminDeleteSessions(args: any) { return db.practiceSession.deleteMany(args); }
export async function adminDeleteGroups(args: any) { return (db as any).group.deleteMany(args); }
export async function adminDeleteGroupMembers(args: any) { return (db as any).groupMember.deleteMany(args); }
export async function adminDeleteAccounts(args: any) { return (db as any).account.deleteMany(args); }
export async function adminDeleteStudentClasses(args: any) { return (db as any).studentClass.deleteMany(args); }
export async function adminDeleteUserPreferences(args: any) { return (db as any).userPreferences.deleteMany(args); }
export async function adminDeleteVocabItems(args: any) { return db.vocabItem.deleteMany(args); }
export async function adminFindAssignmentGroup(args: any) { return (db as any).assignmentGroup.findMany(args); }
export async function adminCountAssignmentStudent(args: any) { return (db as any).assignmentStudent.count(args); }
export async function adminCountGroupMember(args: any) { return (db as any).groupMember.count(args); }
export async function adminFindGroupMember(args: any) { return (db as any).groupMember.findMany(args); }
export async function adminFindTeacherClass(args: any) { return (db as any).teacherClass.findFirst(args); }
