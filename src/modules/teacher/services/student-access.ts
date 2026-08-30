// ============================================
// 教師 ↔ 學生存取權核驗（單一正典）
// 學生屬於教師管轄範圍 ⇔ 主班級（User.classId，admin import / Google Sheets 同步寫入）
// 或混合上課關聯（StudentClass）。任何地方不可只查其一（R5.10 審核修正）。
// ============================================

import { db } from '@/shared/db/db';

/** 學生是否屬於教師任教的班級（主班級 ∪ StudentClass 混合上課） */
export async function studentBelongsToTeacher(studentId: string, teacherId: string): Promise<boolean> {
  const primary = await db.user.findFirst({
    where: { id: studentId, role: 'student', class: { teachers: { some: { teacherId } } } },
    select: { id: true },
  });
  if (primary) return true;
  const mixed = await db.studentClass.findFirst({
    where: { studentId, class: { teachers: { some: { teacherId } } } },
    select: { id: true },
  });
  return mixed !== null;
}
