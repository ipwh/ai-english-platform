// ============================================
// Database fix script — production-safe, idempotent
// 1. Create Demo class + move @school.hk students into it
// 2. Create missing standard classes (1A–6D)
// 3. Redistribute S4 students evenly across 4A/4B/4C/4D
// 4. Redistribute S5 students evenly across 5A/5B/5C/5D
// 5. Assign any remaining unassigned students via round-robin
// ============================================

import { db } from '../src/lib/db';

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

async function main() {
  console.log('🔍 Phase 0: Checking database...\n');

  // ── Phase 0: Ensure all standard classes exist ──
  const existingClasses = await db.class.findMany();
  const existingNames = new Set(existingClasses.map(c => c.name));
  let created = 0;
  for (const cls of STANDARD_CLASSES) {
    if (!existingNames.has(cls.name)) {
      await db.class.create({ data: cls });
      console.log(`  ✅ Created ${cls.name} (${cls.gradeLevel})`);
      created++;
    }
  }
  if (created > 0) console.log(`📊 Created ${created} new standard classes\n`);

  // ── Phase 1: Create Demo class ──
  let demoClass = existingClasses.find(c => c.name === DEMO_CLASS_NAME);
  if (!demoClass) {
    demoClass = await db.class.create({ data: { name: DEMO_CLASS_NAME, gradeLevel: 'Demo' } });
    console.log(`  ✅ Created '${DEMO_CLASS_NAME}' class\n`);
  } else {
    console.log(`  ℹ️  '${DEMO_CLASS_NAME}' class already exists\n`);
  }

  // Reload classes
  const allClasses = await db.class.findMany();

  // ── Phase 2: Move all @school.hk students to Demo class ──
  const demoNames = ['student@school.hk', 'student2@school.hk', 'student3@school.hk',
    'student4@school.hk', 'student5@school.hk', 'student6@school.hk', 'student7@school.hk',
    'student8@school.hk', 'student9@school.hk', 'student10@school.hk'];
  // Also catch any other @school.hk emails
  const demosMoved = await db.user.updateMany({
    where: { role: 'student', email: { contains: '@school.hk' } },
    data: { classId: demoClass.id, level: 'Demo' },
  });
  console.log(`📊 Moved ${demosMoved.count} demo students (@school.hk) → '${DEMO_CLASS_NAME}'\n`);

  // ── Phase 3: Redistribute S4 students evenly across 4A/4B/4C/4D ──
  const s4Classes = allClasses.filter(c => c.gradeLevel === 'S4').sort((a, b) => a.name.localeCompare(b.name));
  if (s4Classes.length === 4) {
    const s4Students = await db.user.findMany({
      where: { role: 'student', level: 'S4', email: { not: { contains: '@school.hk' } } },
      select: { id: true, email: true, classNumber: true },
      orderBy: { classNumber: 'asc' },
    });
    console.log(`📊 S4 real students: ${s4Students.length} → redistributing across 4A/4B/4C/4D...`);
    for (let i = 0; i < s4Students.length; i++) {
      const cls = s4Classes[i % 4];
      await db.user.update({ where: { id: s4Students[i].id }, data: { classId: cls.id } });
      if ((i + 1) % 50 === 0) console.log(`  S4: ${i + 1}/${s4Students.length}...`);
    }
    console.log(`  ✅ S4 redistributed: ~${Math.ceil(s4Students.length / 4)} per class\n`);
  }

  // ── Phase 4: Redistribute S5 students evenly across 5A/5B/5C/5D ──
  const s5Classes = allClasses.filter(c => c.gradeLevel === 'S5').sort((a, b) => a.name.localeCompare(b.name));
  if (s5Classes.length === 4) {
    const s5Students = await db.user.findMany({
      where: { role: 'student', level: 'S5', email: { not: { contains: '@school.hk' } } },
      select: { id: true, email: true, classNumber: true },
      orderBy: { classNumber: 'asc' },
    });
    console.log(`📊 S5 real students: ${s5Students.length} → redistributing across 5A/5B/5C/5D...`);
    for (let i = 0; i < s5Students.length; i++) {
      const cls = s5Classes[i % 4];
      await db.user.update({ where: { id: s5Students[i].id }, data: { classId: cls.id } });
      if ((i + 1) % 50 === 0) console.log(`  S5: ${i + 1}/${s5Students.length}...`);
    }
    console.log(`  ✅ S5 redistributed: ~${Math.ceil(s5Students.length / 4)} per class\n`);
  }

  // ── Phase 5: Assign any remaining unassigned (non-demo) students ──
  const classByLevel = new Map<string, { id: string; name: string }[]>();
  for (const c of allClasses) {
    if (!classByLevel.has(c.gradeLevel)) classByLevel.set(c.gradeLevel, []);
    classByLevel.get(c.gradeLevel)!.push({ id: c.id, name: c.name });
  }

  const unassigned = await db.user.findMany({
    where: { role: 'student', classId: null, email: { not: { contains: '@school.hk' } } },
    select: { id: true, email: true, level: true },
  });

  if (unassigned.length > 0) {
    console.log(`📊 Remaining unassigned (non-demo): ${unassigned.length} → round-robin assignment...`);
    let assigned = 0;
    const levelIdx = new Map<string, number>();
    for (const s of unassigned) {
      const level = s.level!;
      const classes = classByLevel.get(level);
      if (classes && classes.length > 0) {
        const idx = levelIdx.get(level) || 0;
        await db.user.update({ where: { id: s.id }, data: { classId: classes[idx % classes.length].id } });
        levelIdx.set(level, idx + 1);
        assigned++;
      }
    }
    console.log(`  ✅ Assigned: ${assigned}, Skipped: ${unassigned.length - assigned}\n`);
  } else {
    console.log('✅ No unassigned non-demo students\n');
  }

  // ── Final Report ──
  console.log('═══════════════════════════════════════');
  console.log('📊 FINAL CLASS DISTRIBUTION');
  console.log('═══════════════════════════════════════');
  const dist = await db.user.groupBy({
    by: ['classId'],
    where: { role: 'student', classId: { not: null } },
    _count: true,
  });
  const classMap = new Map(allClasses.map(c => [c.id, c]));
  const sorted = dist.sort((a, b) => {
    const ca = classMap.get(a.classId!);
    const cb = classMap.get(b.classId!);
    if (ca?.name === DEMO_CLASS_NAME) return 1;
    if (cb?.name === DEMO_CLASS_NAME) return -1;
    return (ca?.name || '').localeCompare(cb?.name || '');
  });
  let total = 0;
  for (const d of sorted) {
    const cls = classMap.get(d.classId!);
    console.log(`  ${cls?.name || '?'}: ${d._count}`);
    total += d._count;
  }
  console.log(`  ─────────────────`);
  console.log(`  TOTAL: ${total}`);

  const demoCount = await db.user.count({
    where: { role: 'student', email: { contains: '@school.hk' } },
  });
  const unassignedCount = await db.user.count({
    where: { role: 'student', classId: null },
  });
  console.log(`\n📊 Demo students: ${demoCount} | Still unassigned: ${unassignedCount}`);
  console.log('✅ All done!');
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
