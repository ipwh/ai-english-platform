// v5: AdminUserRepository — user, practiceSession, xpTransaction, loginLog, vocabItem, mistake, weeklySnapshot
import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';

export async function adminFindUser(args: Prisma.UserFindUniqueArgs) { return db.user.findUnique(args); }
export async function adminFindUsers(args: Prisma.UserFindManyArgs) { return db.user.findMany(args); }
export async function adminUpdateUser(args: Prisma.UserUpdateArgs) { return db.user.update(args); }
export async function adminCreateUser(args: Prisma.UserCreateArgs) { return db.user.create(args); }
export async function adminDeleteUsers(args: Prisma.UserDeleteManyArgs) { return db.user.deleteMany(args); }
export async function adminCountUsers(args?: Prisma.UserCountArgs) { return db.user.count(args!); }
export async function adminGroupUsers(args: Prisma.UserGroupByArgs) { return db.user.groupBy(args!); }

export async function adminFindPracticeSessions(args: Prisma.PracticeSessionFindManyArgs) { return db.practiceSession.findMany(args); }
export async function adminCountPracticeSessions(args?: Prisma.PracticeSessionCountArgs) { return db.practiceSession.count(args!); }

export async function adminFindXpTransactions(args: Prisma.XpTransactionFindManyArgs) { return db.xpTransaction.findMany(args); }
export async function adminAggregateXp(args: Prisma.XpTransactionAggregateArgs) { return db.xpTransaction.aggregate(args); }
export async function adminCreateXpTransaction(args: Prisma.XpTransactionCreateArgs) { return db.xpTransaction.create(args); }

export async function adminFindLoginLogs(args: Prisma.LoginLogFindManyArgs) { return db.loginLog.findMany(args); }
export async function adminCreateLoginLog(args: Prisma.LoginLogCreateArgs) { return db.loginLog.create(args); }
export async function adminCountLoginLogs(args?: Prisma.LoginLogCountArgs) { return db.loginLog.count(args!); }

export async function adminCountVocab(args?: Prisma.VocabItemCountArgs) { return db.vocabItem.count(args!); }
export async function adminFindVocab(args: Prisma.VocabItemFindManyArgs) { return db.vocabItem.findMany(args); }
export async function adminGroupVocab(args: Prisma.VocabItemGroupByArgs) { return db.vocabItem.groupBy(args!); }

export async function adminCountMistakes(args?: Prisma.MistakeCountArgs) { return db.mistake.count(args!); }
export async function adminFindMistakes(args: Prisma.MistakeFindManyArgs) { return db.mistake.findMany(args); }

export async function adminFindWeeklySnapshots(args: Prisma.WeeklySnapshotFindManyArgs) { return db.weeklySnapshot.findMany(args); }

export async function adminTransaction(ops: any[]) { return db.$transaction(ops); }
