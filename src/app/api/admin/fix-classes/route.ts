// ============================================
// POST /api/admin/fix-classes — 一鍵修復所有學生班級關聯
// 自動建立缺失班級，然後將學生分配給他們年級中的現有班級
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAdmin } from '@/lib/admin-auth';

const STANDARD_CLASSES = [
  { name: '1A', gradeLevel: 'S1' }, { name: '1B', gradeLevel: 'S1' },
  { name: '1C', gradeLevel: 'S1' }, { name: '1D', gradeLevel: 'S1' },
  { name: '2A', gradeLevel: 'S2' }, { name: '2B', gradeLevel: 'S2' },
  { name: '2C', gradeLevel: 'S2' }, { name: '2D', gradeLevel: 'S2' },
  { name: '3A', gradeLevel: 'S3' }, { name: '3B', gradeLevel: 'S3' },
  { name: '3C', gradeLevel: 'S3' }, { name: '3D', gradeLevel: 'S3' },
  { name: '4A', gradeLevel: 'S4' }, { name: '4B', gradeLevel: 'S4' },
  { name: '4C', gradeLevel: 'S4' }, { name: '4D', gradeLevel: 'S4' },
  { name: '5A', gradeLevel: 'S5' }, { name: '5B', gradeLevel: 'S5' },
  { name: '5C', gradeLevel: 'S5' }, { name: '5D', gradeLevel: 'S5' },
  { name: '6A', gradeLevel: 'S6' }, { name: '6B', gradeLevel: 'S6' },
  { name: '6C', gradeLevel: 'S6' }, { name: '6D', gradeLevel: 'S6' },
];

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    // Step 1: Create missing classes
    const existingClasses = await db.class.findMany();
    const existingNames = new Set(existingClasses.map(c => c.name));
    let createdClasses = 0;

    for (const cls of STANDARD_CLASSES) {
      if (!existingNames.has(cls.name)) {
        await db.class.create({ data: cls });
        createdClasses++;
      }
    }

    // Step 2: Reload all classes
    const allClasses = await db.class.findMany();
    const classByLevel = new Map<string, { id: string; name: string }[]>();
    for (const c of allClasses) {
      if (!classByLevel.has(c.gradeLevel)) classByLevel.set(c.gradeLevel, []);
      classByLevel.get(c.gradeLevel)!.push({ id: c.id, name: c.name });
    }

    // Step 3: Get students without classId
    const studentsWithoutClass = await db.user.findMany({
      where: { role: 'student', classId: null },
      select: { id: true, email: true, level: true },
    });

    // Step 4: Assign — round-robin for balanced distribution
    let updatedStudents = 0;
    let skippedStudents = 0;
    const levelIndex = new Map<string, number>();
    const errors: string[] = [];

    for (const s of studentsWithoutClass) {
      try {
        let classId: string | null = null;

        if (s.level) {
          const levelClasses = classByLevel.get(s.level);
          if (levelClasses && levelClasses.length > 0) {
            const idx = levelIndex.get(s.level) || 0;
            classId = levelClasses[idx % levelClasses.length].id;
            levelIndex.set(s.level, idx + 1);
          }
        }

        if (classId) {
          await db.user.update({ where: { id: s.id }, data: { classId } });
          updatedStudents++;
        } else {
          skippedStudents++;
          errors.push(`${s.email}: no class for level=${s.level}`);
        }
      } catch (err: unknown) {
        skippedStudents++;
        errors.push(`${s.email}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    // Step 5: Distribution summary
    const remaining = await db.user.count({
      where: { role: 'student', classId: null },
    });

    const distribution = await db.user.groupBy({
      by: ['classId'],
      where: { role: 'student', classId: { not: null } },
      _count: true,
    });

    const classDist: Record<string, number> = {};
    for (const d of distribution) {
      const cls = allClasses.find(c => c.id === d.classId);
      if (cls) classDist[cls.name] = d._count;
    }

    return NextResponse.json({
      createdClasses,
      updatedStudents,
      skippedStudents,
      remainingWithoutClass: remaining,
      classDistribution: classDist,
      errors: errors.slice(0, 20),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
