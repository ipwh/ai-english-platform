import { db } from '@/shared/db/db';
export async function findUserById(id: string) { return db.user.findUnique({ where: { id }, include: { class: true } }); }
export async function findUserByEmail(email: string) { return db.user.findUnique({ where: { email: email.toLowerCase() }, include: { class: true } }); }
export async function updateUserPassword(id: string, hash: string) { return db.user.update({ where: { id }, data: { passwordHash: hash } }); }
export async function updateUser(id: string, data: any) { return db.user.update({ where: { id }, data }); }
