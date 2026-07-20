// Rebuild student metrics from completed self-practice and teacher assignments.

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to sync the PostgreSQL learning metrics.');
  }

  const { db } = await import('../src/shared/db/db');
  const { syncStudentActivityMetrics } = await import(
    '../src/modules/learning-analytics/services/activity-accounting-service'
  );
  const students = await db.user.findMany({
    where: {
      role: 'student',
      OR: [
        { sessions: { some: {} } },
        { submissions: { some: { status: { in: ['submitted', 'graded'] }, submittedAt: { not: null } } } },
      ],
    },
    select: { id: true },
  });

  for (const student of students) {
    await syncStudentActivityMetrics(student.id);
  }

  console.log(`Synced learning metrics for ${students.length} students.`);
}

main()
  .catch(error => {
    console.error('Learning activity metric sync failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.DATABASE_URL) {
      const { db } = await import('../src/shared/db/db');
      await db.$disconnect();
    }
  });