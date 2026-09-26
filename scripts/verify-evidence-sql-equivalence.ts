// ============================================
// 等價性驗證：SQL 證據聚合 vs TS 正典投影
//
// `practice-repo.aggregateVerifiedTotals*()` 把「全歷史列串流」換成 SQL 聚合
// （治 Neon egress）。SQL 與 TS 必須給出**完全相同**的答案，否則就是兩套口徑。
//
// 本腳本對**真實資料**逐名學生比對：
//   TS  : getCumulativeSkillTotals() / aggregateStudentPracticeTotals()
//   SQL : aggregateVerifiedTotalsBySkillForStudent() / aggregateVerifiedTotalsForStudent()
// 任一學生任一數字不符即 exit 1。
//
// 用法：npx tsx scripts/verify-evidence-sql-equivalence.ts
// 全程唯讀（只 SELECT）。
// ============================================

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readEnvValue(path: string, key: string): string | null {
  try {
    const content = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
    const match = content.match(new RegExp(`^${key}\\s*[:=]\\s*"?([^"\\r\\n]+?)"?\\s*$`, 'm'));
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getDbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const path of ['.env.local', '.env']) {
    const url = readEnvValue(resolve(process.cwd(), path), 'DATABASE_URL');
    if (url) return url;
  }
  throw new Error('找不到 DATABASE_URL（請設定環境變數，或確認 .env.local 存在）');
}

interface Mismatch {
  studentId: string;
  field: string;
  ts: number | string;
  sql: number | string;
}

async function main() {
  process.env.DATABASE_URL = getDbUrl();

  const { db } = await import('@/shared/db/db');
  const { listAllSessionsWithEvidence, getCumulativeSkillTotals } = await import('@/modules/exercise/services/practice-history-service');
  const { aggregateStudentPracticeTotals } = await import('@/modules/exercise/services/practice-evidence-service');
  const {
    aggregateVerifiedTotalsForStudent,
    aggregateVerifiedTotalsBySkillForStudent,
  } = await import('@/modules/exercise/repositories/practice-repo');

  const students = await db.practiceSession.findMany({
    distinct: ['studentId'],
    select: { studentId: true },
    orderBy: { studentId: 'asc' },
  });

  console.log(`\n=== 等價性驗證：SQL 聚合 vs TS 正典投影（${students.length} 名學生）===`);
  console.log('（唯讀；SQL 與 TS 必須給出完全相同的數字）\n');

  const mismatches: Mismatch[] = [];
  let totalSessions = 0;
  let totalAnswers = 0;
  let verifiedStudents = 0;
  let newPayloadBytes = 0;

  for (const { studentId } of students) {
    const sessions = await listAllSessionsWithEvidence(studentId);
    totalSessions += sessions.length;
    totalAnswers += sessions.reduce((n, s) => n + (s.answers?.length ?? 0), 0);

    // --- TS：全學生彙總 ---
    const tsTotals = aggregateStudentPracticeTotals(
      sessions.map(s => ({ totalQuestions: s.totalQuestions, correctCount: s.correctCount, answers: s.answers })),
    );
    const tsSessionsCount = sessions.length;

    // --- TS：每技能（現行 canonical 實作，逐列加總） ---
    const { evaluatePracticeEvidence } = await import('@/modules/exercise/services/practice-evidence-service');
    const tsBySkill = new Map<string, { skillZh: string; questions: number; correct: number }>();
    for (const session of sessions) {
      const evidence = evaluatePracticeEvidence(session.answers);
      if (evidence.status !== 'verified') continue;
      const entry = tsBySkill.get(session.skill) ?? { skillZh: session.skillZh || session.skill, questions: 0, correct: 0 };
      entry.questions += evidence.totalQuestions;
      entry.correct += evidence.correctCount;
      tsBySkill.set(session.skill, entry);
    }
    if (tsTotals.verifiedTotalQuestions > 0) verifiedStudents += 1;

    // --- SQL ---
    const sqlTotals = await aggregateVerifiedTotalsForStudent(studentId);
    const sqlBySkill = await aggregateVerifiedTotalsBySkillForStudent(studentId);
    // 實測新投影的回傳量（= 真正會經過 Neon proxy 的位元組）
    newPayloadBytes += Buffer.byteLength(JSON.stringify(sqlTotals)) + Buffer.byteLength(JSON.stringify(sqlBySkill));

    const check = (field: string, ts: number | string, sql: number | string) => {
      if (ts !== sql) mismatches.push({ studentId, field, ts, sql });
    };

    check('verifiedTotalQuestions', tsTotals.verifiedTotalQuestions, sqlTotals.verifiedTotalQuestions);
    check('verifiedCorrectCount', tsTotals.verifiedCorrectCount, sqlTotals.verifiedCorrectCount);
    check('recordedTotalQuestions', tsTotals.recordedTotalQuestions, sqlTotals.recordedTotalQuestions);
    check('recordedCorrectCount', tsTotals.recordedCorrectCount, sqlTotals.recordedCorrectCount);
    check('sessionsCount', tsSessionsCount, sqlTotals.sessionsCount);

    // 每技能：忽略「verified 0 題」的技能（SQL 仍會回傳該列，TS 不建立條目）
    const sqlSkillMap = new Map(sqlBySkill.map(r => [r.skill, r]));
    for (const [skill, ts] of tsBySkill) {
      const sql = sqlSkillMap.get(skill);
      if (!sql) {
        mismatches.push({ studentId, field: `skill:${skill} (SQL 缺列)`, ts: `q=${ts.questions}`, sql: 'missing' });
        continue;
      }
      check(`skill:${skill}.questions`, ts.questions, sql.verifiedTotalQuestions);
      check(`skill:${skill}.correct`, ts.correct, sql.verifiedCorrectCount);
    }
    for (const sql of sqlBySkill) {
      if (!tsBySkill.has(sql.skill) && sql.verifiedTotalQuestions > 0) {
        mismatches.push({ studentId, field: `skill:${sql.skill} (TS 缺列)`, ts: 'missing', sql: `q=${sql.verifiedTotalQuestions}` });
      }
    }

    // --- 實際出貨的服務函式（端到端） ---
    const serviceTotals = await getCumulativeSkillTotals(studentId);
    const serviceMap = new Map(serviceTotals.map(t => [t.skill, t]));
    if (serviceMap.size !== tsBySkill.size) {
      mismatches.push({ studentId, field: 'service:技能列數', ts: tsBySkill.size, sql: serviceMap.size });
    }
    for (const [skill, ts] of tsBySkill) {
      const shipped = serviceMap.get(skill);
      if (!shipped) {
        mismatches.push({ studentId, field: `service:${skill} (缺列)`, ts: `q=${ts.questions}`, sql: 'missing' });
        continue;
      }
      check(`service:${skill}.questions`, ts.questions, shipped.questions);
      check(`service:${skill}.correct`, ts.correct, shipped.correct);
      if (shipped.skillZh !== ts.skillZh) {
        mismatches.push({ studentId, field: `service:${skill}.skillZh`, ts: ts.skillZh, sql: shipped.skillZh });
      }
    }
  }

  console.log(`已掃描 ${totalSessions} 場 / ${totalAnswers} 答案列，其中 ${verifiedStudents} 名學生有已驗證證據。`);
  console.log(`新投影（${students.length} 名學生的聚合結果）合計回傳: ${newPayloadBytes} bytes`);
  console.log(`（舊投影需把上述所有列搬進 Node：以全校一次掃描計約 3.2 MB）`);

  if (mismatches.length === 0) {
    console.log('\n✅ 完全等價：SQL 聚合與 TS 正典投影在所有真實資料上數字一致。\n');
  } else {
    console.log(`\n❌ 發現 ${mismatches.length} 處不一致（SQL 與 TS 已分歧，不可上線）：\n`);
    for (const m of mismatches.slice(0, 40)) {
      console.log(`  ${m.studentId} | ${m.field} | TS=${m.ts} SQL=${m.sql}`);
    }
    if (mismatches.length > 40) console.log(`  …另有 ${mismatches.length - 40} 處`);
    console.log('');
    process.exit(1);
  }

  await db.$disconnect();
}

main().catch(err => {
  console.error('驗證失敗:', err instanceof Error ? err.message : err);
  process.exit(1);
});
