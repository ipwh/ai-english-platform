// ============================================
// POST /api/admin/fix-classes — 一鍵修復所有學生班級關聯
// 1. 建立 Demo 班別 + 將 @school.hk 學生移入
// 2. 自動建立缺失標準班級 (1A–6D)
// 3. 平均重編 S4 學生至 4A/4B/4C/4D
// 4. 平均重編 S5 學生至 5A/5B/5C/5D
// 5. 將剩餘未分配學生以輪詢方式分配
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

const DEMO_CLASS_NAME = 'Demo';

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    // Step 1: Ensure standard classes exist
    const existingClasses = await db.class.findMany();
    const existingNames = new Set(existingClasses.map(c => c.name));
    let createdClasses = 0;
    for (const cls of STANDARD_CLASSES) {
      if (!existingNames.has(cls.name)) {
        await db.class.create({ data: cls });
        createdClasses++;
      }
    }

    // Step 2: Ensure Demo class exists
    let demoClass = existingClasses.find(c => c.name === DEMO_CLASS_NAME);
    if (!demoClass) {
      demoClass = await db.class.create({ data: { name: DEMO_CLASS_NAME, gradeLevel: 'Demo' } });
    }

    // Step 3: Move all @school.hk students to Demo class
    const demosMoved = await db.user.updateMany({
      where: { role: 'student', email: { contains: '@school.hk' } },
      data: { classId: demoClass.id, level: 'Demo' },
    });

    // Reload classes
    const allClasses = await db.class.findMany();

    // Step 4: Redistribute S4 students evenly (exclude demo)
    const s4Classes = allClasses.filter(c => c.gradeLevel === 'S4').sort((a, b) => a.name.localeCompare(b.name));
    if (s4Classes.length === 4) {
      const s4Students = await db.user.findMany({
        where: { role: 'student', level: 'S4', email: { not: { contains: '@school.hk' } } },
        select: { id: true },
        orderBy: { classNumber: 'asc' },
      });
      for (let i = 0; i < s4Students.length; i++) {
        await db.user.update({ where: { id: s4Students[i].id }, data: { classId: s4Classes[i % 4].id } });
      }
    }

    // Step 5: Redistribute S5 students evenly (exclude demo)
    const s5Classes = allClasses.filter(c => c.gradeLevel === 'S5').sort((a, b) => a.name.localeCompare(b.name));
    if (s5Classes.length === 4) {
      const s5Students = await db.user.findMany({
        where: { role: 'student', level: 'S5', email: { not: { contains: '@school.hk' } } },
        select: { id: true },
        orderBy: { classNumber: 'asc' },
      });
      for (let i = 0; i < s5Students.length; i++) {
        await db.user.update({ where: { id: s5Students[i].id }, data: { classId: s5Classes[i % 4].id } });
      }
    }

    // Step 6: Assign remaining unassigned (non-demo)
    const classByLevel = new Map<string, { id: string; name: string }[]>();
    for (const c of allClasses) {
      if (c.name === DEMO_CLASS_NAME) continue;
      if (!classByLevel.has(c.gradeLevel)) classByLevel.set(c.gradeLevel, []);
      classByLevel.get(c.gradeLevel)!.push({ id: c.id, name: c.name });
    }

    const unassigned = await db.user.findMany({
      where: { role: 'student', classId: null, email: { not: { contains: '@school.hk' } } },
      select: { id: true, email: true, level: true },
    });

    let assigned = 0, skipped = 0;
    const levelIdx = new Map<string, number>();
    const errors: string[] = [];
    for (const s of unassigned) {
      const level = s.level!;
      const classes = classByLevel.get(level);
      if (classes && classes.length > 0) {
        const idx = levelIdx.get(level) || 0;
        await db.user.update({ where: { id: s.id }, data: { classId: classes[idx % classes.length].id } });
        levelIdx.set(level, idx + 1);
        assigned++;
      } else {
        skipped++;
        errors.push(`${s.email}: no class for level=${s.level}`);
      }
    }

    // Final stats
    const remaining = await db.user.count({ where: { role: 'student', classId: null } });
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
      demosMoved: demosMoved.count,
      s4Redistributed: s4Classes.length === 4,
      s5Redistributed: s5Classes.length === 4,
      assigned,
      skipped,
      remainingWithoutClass: remaining,
      classDistribution: classDist,
      errors: errors.slice(0, 20),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
