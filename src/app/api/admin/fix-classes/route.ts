// ============================================
// POST /api/admin/fix-classes — 一鍵修復所有學生班級關聯
// 支援兩種模式：
//   - 預設模式：只修復 classId=null 的學生（安全，不影響已分配學生）
//   - forceRedistribute=true：清除所有非 Demo 學生的班別，全部重新平均分配
//     （用於班別資料大規模錯誤時的徹底修復）
//
// 流程：
// 1. 建立 Demo 班別 + 將 @school.hk 學生移入
// 2. 自動建立缺失標準班級 (1A–6D)
// 3. 平均重編 S4 學生至 4A/4B/4C/4D
// 4. 平均重編 S5 學生至 5A/5B/5C/5D
// 5. 將剩餘未分配學生以輪詢方式分配
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifyAdmin } from '@/shared/auth/admin-auth';

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

    // 讀取選用參數
    let forceRedistribute = false;
    let targetLevels: string[] = []; // 空白 = 全部級別
    try {
      const body = await request.json().catch(() => ({}));
      forceRedistribute = body.forceRedistribute === true;
      if (body.levels && Array.isArray(body.levels)) targetLevels = body.levels;
    } catch {
      // 無 body 時使用預設值
    }

    console.log(`[fix-classes] forceRedistribute=${forceRedistribute}, targetLevels=${targetLevels.join(',') || 'all'}`);

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

    // === 強制重新分配模式：先清除所有非 Demo 學生的班別 ===
    let clearedCount = 0;
    if (forceRedistribute) {
      const clearWhere: Record<string, unknown> = {
        role: 'student',
        email: { not: { contains: '@school.hk' } },
        classId: { not: null },
      };
      if (targetLevels.length > 0) {
        clearWhere.level = { in: targetLevels };
      }
      const cleared = await db.user.updateMany({
        where: clearWhere,
        data: { classId: null },
      });
      clearedCount = cleared.count;
      console.log(`[fix-classes] forceRedistribute: cleared ${clearedCount} students' class assignments`);
    }

    // Reload classes
    const allClasses = await db.class.findMany();

    // === 輔助函數：將指定 level 的 classId=null 學生 round-robin 分配 ===
    async function redistributeLevel(level: string, classes: { id: string; name: string }[]): Promise<number> {
      const students = await db.user.findMany({
        where: {
          role: 'student',
          level,
          classId: null,
          email: { not: { contains: '@school.hk' } },
        },
        select: { id: true },
        orderBy: { classNumber: 'asc' },
      });
      // 🔥 Batch update with transaction to avoid N+1
      if (students.length > 0) {
        await db.$transaction(
          students.map((s, i) =>
            db.user.update({
              where: { id: s.id },
              data: { classId: classes[i % classes.length].id },
            })
          )
        );
      }
      return students.length;
    }

    // Step 4: S4 重新分配
    const s4Classes = allClasses.filter(c => c.gradeLevel === 'S4').sort((a, b) => a.name.localeCompare(b.name));
    const s4Assigned = s4Classes.length === 4 ? await redistributeLevel('S4', s4Classes) : 0;

    // Step 5: S5 重新分配
    const s5Classes = allClasses.filter(c => c.gradeLevel === 'S5').sort((a, b) => a.name.localeCompare(b.name));
    const s5Assigned = s5Classes.length === 4 ? await redistributeLevel('S5', s5Classes) : 0;

    // Step 6: 其他級別未分配學生
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
      mode: forceRedistribute ? 'forceRedistribute' : 'fixUnassignedOnly',
      clearedCount,
      createdClasses,
      demosMoved: demosMoved.count,
      s4Assigned,
      s5Assigned,
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
