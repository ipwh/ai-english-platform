// Sprint 2: Student Repository — user profiles, classes, groups, preferences
import { db } from '@/shared/db/db';

export async function findUserById(id: string) { return db.user.findUnique({ where: { id }, include: { class: true } }); }
export async function findUserByEmail(email: string) { return db.user.findUnique({ where: { email: email.toLowerCase() }, include: { class: true } }); }
export async function findUserByEmailMinimal(email: string) { return db.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true, role: true, name: true, nameEn: true, image: true } }); }
export async function createUser(data: any) { return db.user.create({ data }); }
export async function updateUser(id: string, data: any) { return db.user.update({ where: { id }, data }); }
export async function updateUserPassword(id: string, hash: string) { return db.user.update({ where: { id }, data: { passwordHash: hash } }); }
export async function updateUserXp(id: string, xp: number) { return db.user.update({ where: { id }, data: { xp: { increment: xp } } }); }
export async function updateUserStreak(id: string, streakDays: number) { return db.user.update({ where: { id }, data: { streakDays } }); }
export async function getUserPreferences(userId: string) { return db.userPreferences.findUnique({ where: { userId } }); }
export async function listUsers(filters: any) { const where: any = {}; if (filters.role) where.role = filters.role; if (filters.level) where.level = filters.level; if (filters.search) where.OR = [{ name: { contains: filters.search, mode: 'insensitive' } }, { email: { contains: filters.search, mode: 'insensitive' } }]; const p = filters.page ?? 1; const ps = Math.min(100, filters.pageSize ?? 20); const [users, total] = await Promise.all([db.user.findMany({ where, include: { class: true }, orderBy: { createdAt: 'desc' }, take: ps, skip: (p - 1) * ps }), db.user.count({ where })]); return { users, total, page: p, pageSize: ps }; }
export async function deleteUser(id: string) { return db.user.delete({ where: { id } }); }
export async function findRecordOwner(table: string, resourceId: string, ownerField: string) { return (db as any)[table].findUnique({ where: { id: resourceId }, select: { [ownerField]: true } }); }
export async function findUsers(where: any, select?: any) { return db.user.findMany({ where, select }); }
