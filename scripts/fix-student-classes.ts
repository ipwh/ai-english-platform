// Direct database fix: create missing classes + assign classId to all students
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

async function main() {
  console.log('🔍 Checking database...\n');

  // Get all existing classes
  const allClasses = await db.class.findMany();
  console.log(`Existing classes (${allClasses.length}):`);
  for (const c of allClasses) console.log(`  ${c.name} | ${c.gradeLevel}`);

  // Create missing classes
  const existingNames = new Set(allClasses.map(c => c.name));
  let created = 0;
  for (const cls of STANDARD_CLASSES) {
    if (!existingNames.has(cls.name)) {
      await db.class.create({ data: cls });
      console.log(`  ✅ Created ${cls.name} (${cls.gradeLevel})`);
      created++;
    }
  }
  console.log(`\n📊 Created ${created} new classes\n`);

  // Reload all classes
  const updatedClasses = await db.class.findMany();
  const classByLevel = new Map<string, { id: string; name: string }[]>();
  for (const c of updatedClasses) {
    if (!classByLevel.has(c.gradeLevel)) classByLevel.set(c.gradeLevel, []);
    classByLevel.get(c.gradeLevel)!.push({ id: c.id, name: c.name });
  }

  // Get students without classId
  const studentsWithoutClass = await db.user.findMany({
    where: { role: 'student', classId: null },
    select: { id: true, email: true, level: true, classNumber: true },
  });
  console.log(`📊 Students without classId: ${studentsWithoutClass.length}\n`);

  // Assign classes — round-robin for balanced distribution
  let updated = 0, skipped = 0;
  const levelIndex = new Map<string, number>();

  for (const s of studentsWithoutClass) {
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
      updated++;
      if (updated % 100 === 0) console.log(`  Updated ${updated} students...`);
    } else {
      skipped++;
    }
  }

  console.log(`\n✅ Done! Updated: ${updated}, Skipped: ${skipped}`);

  // Verify
  const remaining = await db.user.count({ where: { role: 'student', classId: null } });
  console.log(`📊 Still without classId: ${remaining}\n`);

  // Distribution
  console.log('📊 Class distribution:');
  const dist = await db.user.groupBy({
    by: ['classId'],
    where: { role: 'student', classId: { not: null } },
    _count: true,
  });
  for (const d of dist) {
    const cls = updatedClasses.find(c => c.id === d.classId);
    console.log(`  ${cls?.name || '?'}: ${d._count}`);
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
