// ============================================
// 種子資料腳本 — 初始化資料庫
// 支援 SQLite（開發）及 PostgreSQL（生產）
// 執行: npx tsx prisma/seed.ts
// ============================================

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { hashPasswordSync } from '../src/shared/auth/crypto';

function getDbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    throw new Error('生產環境必須設定 DATABASE_URL');
  }
  return 'file:C:/Users/TC-37/AppData/Local/Temp/english-platform-dev.db';
}

const dbUrl = getDbUrl();
const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');

console.log(`📁 資料庫: ${isPostgres ? 'PostgreSQL' : 'SQLite'} @ ${dbUrl.replace(/\/\/.*@/, '//***@')}`);

let db: PrismaClient;

if (isPostgres) {
  // PostgreSQL: 使用 pg adapter
  const { PrismaPg } = require('@prisma/adapter-pg') as typeof import('@prisma/adapter-pg');
  const { Pool } = require('pg') as typeof import('pg');
  const pool = new Pool({ connectionString: dbUrl, max: 5 });
  const adapter = new PrismaPg(pool);
  db = new PrismaClient({ adapter });
} else {
  // SQLite: 使用 libsql adapter
  const adapter = new PrismaLibSql({ url: dbUrl });
  db = new PrismaClient({ adapter });
}

async function main() {
  console.log('🌱 開始匯入種子資料...\n');

  // ========== 1. 建立班級 (S1-S6, A-D) ==========
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
  const classes = await Promise.all(
    STANDARD_CLASSES.map(cls =>
      db.class.upsert({
        where: { name: cls.name },
        update: {},
        create: { name: cls.name, gradeLevel: cls.gradeLevel },
      })
    )
  );
  console.log(`✅ 已建立 ${classes.length} 個班級`);

  // ========== 2. 建立教師 ==========
  const teacher = await db.user.upsert({
    where: { email: 'teacher@school.hk' },
    update: {},
    create: {
      email: 'teacher@school.hk',
      passwordHash: hashPasswordSync('teacher123'),
      nameZh: '黃淑儀',
      nameEn: 'Wong Suk Yee',
      role: 'teacher',
      subjects: JSON.stringify(['English Language']),
      streakDays: 0,
    },
  });
  console.log(`✅ 教師: ${teacher.nameZh} (${teacher.email})`);

  // 教師 ↔ 班級關聯
  for (const cls of classes) {
    await db.teacherClass.upsert({
      where: { teacherId_classId: { teacherId: teacher.id, classId: cls.id } },
      update: {},
      create: {
        teacherId: teacher.id,
        classId: cls.id,
        isFormTeacher: cls.name === '4A',
      },
    });
  }
  console.log(`✅ 教師任教 ${classes.length} 個班級 (班主任: 4A)`);

  // ========== 3. 建立學生 ==========
  const studentData = [
    { email: 'student@school.hk',     nameZh: '陳家明', nameEn: 'Chan Ka Ming',   className: '4A',  classNumber: '15', level: 'S4' },
    { email: 'student2@school.hk',    nameZh: '李志偉', nameEn: 'Lee Chi Wai',    className: '4A',  classNumber: '20', level: 'S4' },
    { email: 'student3@school.hk',    nameZh: '張美玲', nameEn: 'Cheung Mei Ling', className: '4A',  classNumber: '03', level: 'S4' },
    { email: 'student4@school.hk',    nameZh: '何文傑', nameEn: 'Ho Man Kit',     className: '4B',  classNumber: '08', level: 'S4' },
    { email: 'student5@school.hk',    nameZh: '劉嘉欣', nameEn: 'Lau Ka Yan',     className: '4B',  classNumber: '12', level: 'S4' },
    { email: 'student6@school.hk',    nameZh: '吳振宇', nameEn: 'Ng Chun Yu',     className: '5C',  classNumber: '05', level: 'S5' },
    { email: 'student7@school.hk',    nameZh: '林小曼', nameEn: 'Lam Siu Man',    className: '5C',  classNumber: '18', level: 'S5' },
    { email: 'student8@school.hk',    nameZh: '周志強', nameEn: 'Chow Chi Keung', className: '5D',  classNumber: '22', level: 'S5' },
    { email: 'student9@school.hk',    nameZh: '鄭慧敏', nameEn: 'Cheng Wai Man',  className: '5D',  classNumber: '07', level: 'S5' },
    { email: 'student10@school.hk',   nameZh: '梁俊傑', nameEn: 'Leung Chun Kit', className: '5D',  classNumber: '14', level: 'S5' },
  ];

  let studentCount = 0;
  for (const s of studentData) {
    const cls = classes.find(c => c.name === s.className);
    await db.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        passwordHash: hashPasswordSync('student123'),
        nameZh: s.nameZh,
        nameEn: s.nameEn,
        role: 'student',
        classId: cls?.id,
        classNumber: s.classNumber,
        level: s.level,
        overallAccuracy: Math.random() * 30 + 55, // 55-85%
        streakDays: Math.floor(Math.random() * 14),
      },
    });
    studentCount++;
  }
  console.log(`✅ 已建立 ${studentCount} 名學生`);

  // ========== 4. 建立管理員（預設管理員 + 教師雙重身份） ==========
  // ipwh@pochiu.edu.hk — 預設為教師及管理員
  await db.user.upsert({
    where: { email: 'ipwh@pochiu.edu.hk' },
    update: {},
    create: {
      email: 'ipwh@pochiu.edu.hk',
      passwordHash: hashPasswordSync('admin123'),
      nameZh: '系統管理員',
      nameEn: 'System Admin',
      role: 'admin',
      subjects: JSON.stringify(['English Language']),
      department: 'English',
      streakDays: 0,
    },
  });
  console.log('✅ 管理員: ipwh@pochiu.edu.hk (admin + teacher)');

  await db.user.upsert({
    where: { email: 'admin@school.hk' },
    update: {},
    create: {
      email: 'admin@school.hk',
      passwordHash: hashPasswordSync('admin123'),
      nameZh: '備用管理員',
      nameEn: 'Backup Admin',
      role: 'admin',
      streakDays: 0,
    },
  });
  console.log('✅ 備用管理員: admin@school.hk');

  // ========== 5. 示範教材 (供 RAG 使用) ==========
  const materials = await Promise.all([
    db.material.create({
      data: {
        title: 'DSE English 2024 Paper 1 Reading',
        description: '2024 DSE 英文閱讀卷 Passage A & B',
        type: 'pdf',
        gradeLevel: 'S6',
        strand: 'knowledge',
        content: `DSE English Language 2024 Paper 1 Reading Passages

Passage A: The Rise of Sustainable Fashion

In recent years, the fashion industry has undergone a significant transformation. Consumers are increasingly aware of the environmental impact of fast fashion, leading to a growing demand for sustainable alternatives. The concept of "slow fashion" emphasizes quality over quantity, encouraging consumers to invest in timeless pieces rather than following fleeting trends.

According to a 2023 survey conducted by the Hong Kong Fashion Council, 67% of local consumers aged 18-35 consider sustainability when making clothing purchases. This shift in consumer behavior has prompted major retailers to adopt eco-friendly practices, such as using organic cotton, recycled polyester, and water-saving production methods.

However, challenges remain. Sustainable materials often cost 20-30% more than conventional alternatives, creating a price barrier for budget-conscious shoppers. Additionally, "greenwashing" — where companies make misleading claims about their environmental practices — has become a growing concern. The Hong Kong Consumer Council has called for stricter regulations to ensure transparency in sustainability claims.

Vocabulary in context:
- sustainable (adj.): able to be maintained at a certain rate or level without depleting natural resources
- transformation (n.): a marked change in form, nature, or appearance
- eco-friendly (adj.): not harmful to the environment
- greenwashing (n.): the practice of making misleading claims about environmental benefits`,
        tags: JSON.stringify(['DSE', 'reading', 'past paper', '2024', 'S6']),
        ocrStatus: 'done',
        ragStatus: 'done',
        fileSize: 0,
        uploadedBy: teacher.id,
      },
    }),
    db.material.create({
      data: {
        title: 'English Grammar: Conditionals Guide',
        description: '條件句完整教學 (Type 0-3 + Mixed)',
        type: 'text',
        gradeLevel: 'S4',
        strand: 'interpersonal',
        content: `English Grammar: A Complete Guide to Conditionals

Conditional sentences express the relationship between a condition and a result. There are four main types, plus mixed conditionals.

Type 0 (Zero Conditional): General Truths
Structure: If + present simple, present simple
Example: If you heat water to 100°C, it boils.
Usage: Expresses scientific facts and general truths.
Chinese equivalent: 每當...就會... (類似「如果...就...」的恆常情況)

Type 1 (First Conditional): Likely Future Events
Structure: If + present simple, will + base verb
Example: If it rains tomorrow, I will bring an umbrella.
Usage: Realistic possibilities in the future.
Common student mistake: *If it will rain → WRONG (no future tense after "if")
Chinese equivalent: 如果...將會...

Type 2 (Second Conditional): Unlikely/Hypothetical Present
Structure: If + past simple, would + base verb
Example: If I won the lottery, I would travel the world.
Usage: Imaginary situations in the present or future.
Key point: Use "were" instead of "was" in formal English: "If I were you..."
Chinese equivalent: 如果...就會... (與現在事實相反)

Type 3 (Third Conditional): Impossible Past
Structure: If + past perfect, would have + past participle
Example: If I had studied harder, I would have passed the exam.
Usage: Hypothetical past situations that did NOT happen.
Common mistake: *If I would have studied → WRONG
Chinese equivalent: 如果當初...就... (與過去事實相反)

Mixed Conditionals:
- Past condition → Present result: If + past perfect, would + base verb
  Example: If I had taken the job, I would be living in London now.
- Present condition → Past result: If + past simple, would have + past participle
  Example: If I were more organized, I would have submitted the report on time.

DSE Exam Tips:
1. Read the context carefully — is the situation real or hypothetical?
2. Check the time reference (past/present/future) before choosing the tense.
3. Mixed conditionals are common in Paper 2 (Writing) and Paper 3 (Listening).
4. Avoid double "would" — a classic Chinglish error.`,
        tags: JSON.stringify(['grammar', 'conditionals', 'S4', 'S5', 'S6']),
        ocrStatus: 'done',
        ragStatus: 'done',
        fileSize: 0,
        uploadedBy: teacher.id,
      },
    }),
  ]);

  console.log(`✅ 已建立 ${materials.length} 份示範教材 (RAG 就緒)`);

  console.log('\n🎉 種子資料匯入完成！');
  console.log('='.repeat(50));
  console.log('教師帳號: teacher@school.hk / teacher123');
  console.log('學生帳號: student@school.hk / student123');
  console.log('管理員帳號: admin@school.hk / admin123');
  console.log('='.repeat(50));
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
