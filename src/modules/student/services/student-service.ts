// Sprint 4: Student Service — profiles, preferences, class enrollment
import {
  findUserById, findUserByEmail, createUser, updateUser, updateUserXp,
  updateUserStreak, getUserPreferences, listUsers, findUsers
} from '@/modules/student/repositories/student-repo';
import { logger } from '@/shared/logger/logger';

export interface StudentProfile {
  id: string; name: string; email: string; role: string; gradeLevel?: string;
  xp?: number; streakDays?: number;
}

export async function getStudentById(id: string) {
  const user = await findUserById(id);
  if (!user) throw new Error('Student not found');
  return user;
}

export async function getStudentByEmail(email: string) { return findUserByEmail(email); }

export async function registerStudent(data: { name: string; email: string; gradeLevel?: string }) {
  logger.info({ module: 'student-service', email: data.email }, 'Registering student');
  return createUser({ ...data, role: 'student' });
}

export async function updateStudentProfile(id: string, data: Record<string, unknown>) {
  return updateUser(id, data);
}

export async function addXp(studentId: string, xp: number) {
  return updateUserXp(studentId, xp);
}

export async function updateStreak(studentId: string, days: number) {
  return updateUserStreak(studentId, days);
}

export async function getLanguagePreference(userId: string): Promise<'zh' | 'en'> {
  const prefs = await getUserPreferences(userId);
  return prefs?.language === 'en' ? 'en' : 'zh';
}

export async function listStudentsByClass(classId: string) {
  return findUsers(
    { role: 'student', studentClasses: { some: { classId } } },
    { id: true, name: true, email: true, gradeLevel: true }
  );
}

export async function listAllStudents(page = 1, pageSize = 20) {
  return listUsers({ role: 'student', page, pageSize });
}
