// ============================================
// 診斷：Neon 網路傳輸（egress）來源量測
//
// 背景（2026-09-25）：Neon Free plan 的 public network transfer 為
// 5 GB/project/月，實測已用 4 GB（80%）。Neon 只計算「由資料庫經 proxy
// 送出的位元組」，即應用端實際讀回的資料量，與 DB 大小無關。
//
// 本腳本用**實測位元組**回答一個問題：
//   「一次全歷史投影（full-history projection）到底搬了多少資料？」
// 並以此推算每月 egress，避免以猜測代替證據（AGENTS.md: Evidence over speculation）。
//
// 量測方式：對正典投影的**同一組欄位**取 `octet_length(to_jsonb(row)::text)`，
// 即 Prisma 實際收到的文字值大小（不含 wire protocol 的欄位標頭，屬保守下限）。
//
// 全程唯讀（只 SELECT）。用法：
//   npx tsx scripts/diagnose-db-egress.ts
//   npx tsx scripts/diagnose-db-egress.ts --passes-per-day 3 --active-students 200
//   npx tsx scripts/diagnose-db-egress.ts --used-gb 4 --limit-gb 5
//     ↑ 計費週期消耗推算：以已消耗量反推校準係數，預估會否在週期結束前觸頂。
//       週期預設為本月 1 日 → 下月 1 日（Neon 每月 1 日重置）。
//
// DATABASE_URL 來源：環境變數優先，否則依序讀 .env.local / .env
// ============================================

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

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

function argValue(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  const raw = process.argv[idx + 1];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** 人類可讀位元組 */
function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// 正典投影欄位（與 practice-repo.ts 的 select 完全一致）
const SESSION_PROJECTION_COLUMNS = [
  'id', 'skill', 'skillZh', 'difficulty', 'totalQuestions', 'correctCount',
  'source', 'startedAt', 'completedAt',
];

const ANSWER_PROJECTION_COLUMNS = [
  'questionId', 'result', 'awardedScore', 'maxScore',
  'countsTowardScore', 'scoredBy', 'scoringMethod',
];

// 批次投影（listPracticeSessionsWithEvidenceForStudents）少幾欄
const BATCH_SESSION_PROJECTION_COLUMNS = [
  'studentId', 'skill', 'totalQuestions', 'correctCount', 'source', 'startedAt',
];

const BATCH_ANSWER_PROJECTION_COLUMNS = [
  'countsTowardScore', 'awardedScore', 'maxScore', 'result', 'scoredBy', 'scoringMethod',
];

function projectionCte(
  sessionCols: string[],
  answerCols: string[],
  studentFilter: string,
): string {
  const sessionSelect = sessionCols.map(c => `s."${c}"`).join(', ');
  const answerSelect = answerCols.map(c => `a."${c}"`).join(', ');
  return `
    WITH target_sessions AS (
      SELECT s.id FROM "PracticeSession" s WHERE ${studentFilter}
    ),
    sess AS (
      SELECT ${sessionSelect}
      FROM "PracticeSession" s
      WHERE s.id IN (SELECT id FROM target_sessions)
    ),
    ans AS (
      SELECT ${answerSelect}
      FROM "PracticeAnswer" a
      WHERE a."sessionId" IN (SELECT id FROM target_sessions)
    )
  `;
}

interface PassMeasurement {
  sessions: number;
  answers: number;
  sessionBytes: number;
  answerBytes: number;
  totalBytes: number;
}

async function measurePass(
  client: Client,
  sessionCols: string[],
  answerCols: string[],
  studentFilter: string,
  params: unknown[],
): Promise<PassMeasurement> {
  const sql = `
    ${projectionCte(sessionCols, answerCols, studentFilter)}
    SELECT
      (SELECT count(*) FROM sess)::int AS sessions,
      (SELECT count(*) FROM ans)::int AS answers,
      (SELECT COALESCE(sum(octet_length(to_jsonb(x)::text)), 0)::bigint FROM sess x) AS session_bytes,
      (SELECT COALESCE(sum(octet_length(to_jsonb(y)::text)), 0)::bigint FROM ans y) AS answer_bytes
  `;
  const { rows } = await client.query(sql, params);
  const row = rows[0];
  const sessionBytes = Number(row.session_bytes);
  const answerBytes = Number(row.answer_bytes);
  return {
    sessions: row.sessions,
    answers: row.answers,
    sessionBytes,
    answerBytes,
    totalBytes: sessionBytes + answerBytes,
  };
}

async function main() {
  const passesPerDay = argValue('--passes-per-day', 3);
  const activeStudents = argValue('--active-students', 200);
  const daysPerMonth = argValue('--days-per-month', 30);

  const url = getDbUrl();
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const client = new Client({
    connectionString: url,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    application_name: 'diagnose-db-egress',
  });
  await client.connect();

  console.log('\n=== Neon egress 診斷（唯讀） ===');
  const host = (() => {
    try { return new URL(url).host; } catch { return '(unparsed)'; }
  })();
  console.log(`DB host: ${host}${host.includes('pooler') ? '  [pooled endpoint]' : ''}`);

  // ---------- 0. 資料庫與資料表大小（對照組：egress ≠ 資料量） ----------
  const { rows: sizeRows } = await client.query(`
    SELECT
      pg_database_size(current_database())::bigint AS db_bytes,
      (SELECT pg_total_relation_size('"PracticeSession"'))::bigint AS session_bytes,
      (SELECT pg_total_relation_size('"PracticeAnswer"'))::bigint AS answer_bytes
  `);
  const size = sizeRows[0];
  console.log('\n--- 資料庫實際大小（與 egress 無關，作對照） ---');
  console.log(`  database:        ${fmt(Number(size.db_bytes))}`);
  console.log(`  PracticeSession: ${fmt(Number(size.session_bytes))}`);
  console.log(`  PracticeAnswer:  ${fmt(Number(size.answer_bytes))}`);

  // ---------- 1. 資料列總數與分布 ----------
  const { rows: countRows } = await client.query(`
    SELECT
      (SELECT count(*) FROM "PracticeSession")::int AS sessions,
      (SELECT count(*) FROM "PracticeAnswer")::int AS answers,
      (SELECT count(*) FROM "PracticeSession" WHERE "studentId" IS NOT NULL)::int AS sessions_with_student,
      (SELECT count(DISTINCT "studentId") FROM "PracticeSession")::int AS students_with_practice,
      (SELECT count(*) FROM "User")::int AS users
  `);
  const counts = countRows[0];
  console.log('\n--- 資料列總數 ---');
  console.log(`  User:            ${counts.users}`);
  console.log(`  PracticeSession: ${counts.sessions}（${counts.students_with_practice} 名學生有練習）`);
  console.log(`  PracticeAnswer:  ${counts.answers}`);
  console.log(`  平均每場答案列:  ${counts.sessions > 0 ? (counts.answers / counts.sessions).toFixed(1) : '0'}`);

  // ---------- 2. 每名學生的全歷史投影大小（最重者） ----------
  const { rows: topStudents } = await client.query(`
    SELECT "studentId", count(*)::int AS session_count
    FROM "PracticeSession"
    GROUP BY "studentId"
    ORDER BY count(*) DESC
    LIMIT 5
  `);

  console.log('\n--- 單一學生「一次全歷史投影」實測位元組（呼叫端：syncActivityMetrics / getCumulativeSkillTotals） ---');
  console.log('  （= 每次練習提交、每次累積徽章檢查、每次練習頁載入，都重複搬一次的資料量）\n');
  console.log('  場次 |    場次列 |    答案列 |     合計 | 學生');

  const perStudent: Array<{ studentId: string; bytes: number }> = [];
  for (const row of topStudents) {
    const m = await measurePass(
      client,
      SESSION_PROJECTION_COLUMNS,
      ANSWER_PROJECTION_COLUMNS,
      's."studentId" = $1',
      [row.studentId],
    );
    perStudent.push({ studentId: row.studentId, bytes: m.totalBytes });
    console.log(
      `  ${String(m.sessions).padStart(4)} | ${fmt(m.sessionBytes).padStart(9)} | ${fmt(m.answerBytes).padStart(9)} | ${fmt(m.totalBytes).padStart(8)} | ${row.studentId}`,
    );
  }

  // ---------- 3. 全校「一次全歷史投影」總量 ----------
  const allStudents = await measurePass(
    client,
    SESSION_PROJECTION_COLUMNS,
    ANSWER_PROJECTION_COLUMNS,
    'TRUE',
    [],
  );
  const batchAll = await measurePass(
    client,
    BATCH_SESSION_PROJECTION_COLUMNS,
    BATCH_ANSWER_PROJECTION_COLUMNS,
    'TRUE',
    [],
  );

  console.log('\n--- 全校掃描一次的成本 ---');
  console.log(`  逐學生投影（合計）:            ${fmt(allStudents.totalBytes)}（${allStudents.sessions} 場 / ${allStudents.answers} 答案列）`);
  console.log(`  批次投影（admin export 一次）: ${fmt(batchAll.totalBytes)}（欄位較少）`);

  // ---------- 4. 逐學生「每次投影位元組 × 本期活動」→ 推算 egress ----------
  // 一次查詢取得每名學生的 (a) 全歷史投影位元組 (b) 近 30 日場次數。
  // 成因是乘積效應：投影大小隨「終身場次」單調成長，而每次活動都重跑一次。
  const sessExpr = SESSION_PROJECTION_COLUMNS.map(c => `'${c}', s."${c}"`).join(', ');
  const ansExpr = ANSWER_PROJECTION_COLUMNS.map(c => `'${c}', a."${c}"`).join(', ');

  const { rows: perStudentRows } = await client.query(`
    WITH sess AS (
      SELECT s."studentId" AS sid,
             octet_length(jsonb_build_object(${sessExpr})::text)::bigint AS b
      FROM "PracticeSession" s
    ),
    ans AS (
      SELECT s."studentId" AS sid,
             octet_length(jsonb_build_object(${ansExpr})::text)::bigint AS b
      FROM "PracticeAnswer" a
      JOIN "PracticeSession" s ON s.id = a."sessionId"
    ),
    proj AS (
      SELECT sid, sum(b)::bigint AS projection_bytes
      FROM (SELECT * FROM sess UNION ALL SELECT * FROM ans) t
      GROUP BY sid
    ),
    recent AS (
      SELECT "studentId" AS sid, count(*)::int AS sessions_30d
      FROM "PracticeSession"
      WHERE "startedAt" >= now() - interval '30 days'
      GROUP BY 1
    )
    SELECT proj.sid AS "studentId",
           proj.projection_bytes::bigint AS projection_bytes,
           COALESCE(recent.sessions_30d, 0) AS sessions_30d
    FROM proj
    LEFT JOIN recent ON recent.sid = proj.sid
    ORDER BY proj.projection_bytes DESC
  `);

  interface StudentEgress { studentId: string; bytes: number; sessions30d: number; cost: number; }
  const studentEgress: StudentEgress[] = perStudentRows.map(r => {
    const bytes = Number(r.projection_bytes);
    const sessions30d = Number(r.sessions_30d);
    return { studentId: r.studentId, bytes, sessions30d, cost: bytes * sessions30d };
  });

  // 寫入路徑：每次練習提交觸發的完整掃描次數
  //   syncActivityMetrics()      → 1 次（listAllSessionsWithEvidence）
  //   checkAndAwardBadges()      → 1 次（getCumulativeSkillTotals，於 /api/gamification）
  const WRITE_PASSES_PER_SUBMISSION = 2;
  // 讀取路徑：練習頁等每次載入 → 1 次（getCumulativeSkillTotals）
  const READ_PASSES_PER_LOAD = 1;

  const totalSessions30d = studentEgress.reduce((s, x) => s + x.sessions30d, 0);
  const oneExtraPassPerSession = studentEgress.reduce((s, x) => s + x.cost, 0);
  const writePath = oneExtraPassPerSession * WRITE_PASSES_PER_SUBMISSION;

  console.log('\n--- 以「近 30 日實際活動」推算 egress ---');
  console.log(`  近 30 日場次總數: ${totalSessions30d}（活躍學生 ${studentEgress.filter(x => x.sessions30d > 0).length} 名）`);
  console.log(`  本模型單位: 全校每多跑一次全歷史投影 = ${fmt(oneExtraPassPerSession)}`);
  console.log(`\n  寫入路徑（每次提交 ${WRITE_PASSES_PER_SUBMISSION} 次掃描）: ${fmt(writePath)}`);
  console.log(`  讀取路徑（每次頁面載入 ${READ_PASSES_PER_LOAD} 次掃描）: 每次載入另加 ${fmt(oneExtraPassPerSession / Math.max(totalSessions30d, 1))}（每名學生）`);
  console.log(`\n  貢獻前 5 名學生: 場次 | 每次投影 | 本期寫入路徑成本 | 佔比`);
  const writeTotalForPct = writePath || 1;
  for (const s of studentEgress.slice(0, 5)) {
    const cost = s.cost * WRITE_PASSES_PER_SUBMISSION;
    console.log(
      `    ${String(s.sessions30d).padStart(5)} | ${fmt(s.bytes).padStart(9)} | ${fmt(cost).padStart(14)} | ${((cost / writeTotalForPct) * 100).toFixed(1)}%  ${s.studentId}`,
    );
  }

  console.log('\n--- 誰是主要消耗者（安全優先：先確認是否為測試／開發帳號） ---\n');
  const topForWho = studentEgress.slice(0, 5);
  const { rows: whoRows } = await client.query(`
    SELECT u.id, u.role, COALESCE(u."nameZh", u.name, '(未命名)') AS display_name, u.email,
           u."classId" AS class_id, u."academicYear" AS academic_year,
           (SELECT max(s."startedAt") FROM "PracticeSession" s WHERE s."studentId" = u.id) AS last_session
    FROM "User" u
    WHERE u.id = ANY($1::text[])
  `, [topForWho.map(s => s.studentId)]);

  interface WhoRow { id: string; role: string; display_name: string; email: string; class_id: string | null; academic_year: string | null; last_session: Date | null }
  const whoById = new Map((whoRows as WhoRow[]).map(r => [r.id, r]));

  console.log('      場次 |      投影 | 角色    | 班別 | 姓名 / email                              | 最後練習');
  for (const s of topForWho) {
    const w = whoById.get(s.studentId);
    if (!w) {
      console.log(`  ${String(s.sessions30d).padStart(6)} | ${fmt(s.bytes).padStart(8)} | (找不到 User 列) ${s.studentId}`);
      continue;
    }
    const label = `${w.display_name} / ${w.email}`.slice(0, 41).padEnd(41);
    const last = w.last_session ? new Date(w.last_session).toISOString().slice(0, 10) : '(無)';
    console.log(
      `  ${String(s.sessions30d).padStart(6)} | ${fmt(s.bytes).padStart(8)} | ${w.role.padEnd(7)} | ${(w.class_id ? '有' : '—').padEnd(4)} | ${label} | ${last}`,
    );
  }
  console.log('\n  判讀：role 非 student、無班別、或 email 屬個人／測試網域者 ⇒ 可先停用該帳號流量');
  console.log('        （零程式碼變更、完全可逆，且不影響真實學生）。\n');

  // ---------- 5. 計費週期消耗推算（Neon 每月 1 日重置） ----------
  // 目的：判斷「會在週期結束前用盡 5 GB 而被暫停 compute」的風險。
  // 方法：以**已消耗量反推校準係數** k（吸納重複掃描次數與讀取路徑等未知量），
  //       再以最近 7 日活動推估週期剩餘日數。避免用猜測的「每次提交跑幾次」。
  const nowDate = new Date();
  const cycleStart = process.env.CYCLE_START
    ? new Date(process.env.CYCLE_START)
    : new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1));
  const cycleEnd = new Date(Date.UTC(cycleStart.getUTCFullYear(), cycleStart.getUTCMonth() + 1, 1));
  const usedGb = argValue('--used-gb', 4);
  const limitGb = argValue('--limit-gb', 5);

  const { rows: dailyRows } = await client.query(`
    SELECT
      -- 香港日界線（UTC+8，無夏令）
      to_char((("startedAt" AT TIME ZONE 'UTC') + interval '8 hours')::date, 'YYYY-MM-DD') AS hk_day,
      "studentId" AS student_id,
      count(*)::int AS n
    FROM "PracticeSession"
    WHERE "startedAt" >= $1 AND "startedAt" < $2
    GROUP BY 1, 2
    ORDER BY 1
  `, [cycleStart, cycleEnd]);

  interface DailyRow { hk_day: string; student_id: string; n: number }
  const bytesByStudent = new Map(studentEgress.map(e => [e.studentId, e.bytes]));
  const rawByDay = new Map<string, number>();
  const rawByStudent = new Map<string, number>();

  for (const r of dailyRows as DailyRow[]) {
    const perSession = bytesByStudent.get(r.student_id) ?? 0;
    const cost = perSession * Number(r.n);
    rawByDay.set(r.hk_day, (rawByDay.get(r.hk_day) ?? 0) + cost);
    rawByStudent.set(r.student_id, (rawByStudent.get(r.student_id) ?? 0) + cost);
  }

  const rawTotal = [...rawByDay.values()].reduce((a, b) => a + b, 0);
  // 校準係數：把「模型位元組」換算成「Neon 實計 egress」
  const calibration = rawTotal > 0 ? (usedGb * 1e9) / rawTotal : 0;

  const allDays = [...rawByDay.keys()].sort();
  const recentDays = allDays.slice(-7);
  const recentMeanRaw = recentDays.length > 0
    ? recentDays.reduce((a, d) => a + (rawByDay.get(d) ?? 0), 0) / recentDays.length
    : 0;
  const remainingDays = Math.max(0, Math.ceil((cycleEnd.getTime() - nowDate.getTime()) / 86_400_000));
  const usedBytes = usedGb * 1e9;
  const projectedBytes = usedBytes + calibration * recentMeanRaw * remainingDays;

  console.log('\n--- 計費週期消耗推算（每月 1 日重置） ---');
  console.log(`  週期: ${cycleStart.toISOString().slice(0, 10)} → ${cycleEnd.toISOString().slice(0, 10)}（剩餘 ${remainingDays} 日）`);
  console.log(`  已消耗: ${fmt(usedBytes)} / ${fmt(limitGb * 1e9)}（剩餘 ${fmt(Math.max(0, limitGb * 1e9 - usedBytes))}）`);
  console.log(`  校準係數 k = ${calibration.toFixed(2)}（模型位元組 → 實計 egress，含重複掃描與讀取路徑）`);

  console.log('\n  近期每日模型量（最近 10 日，香港日界線）：');
  for (const d of allDays.slice(-10)) {
    const raw = rawByDay.get(d) ?? 0;
    console.log(`    ${d}  →  模型 ${fmt(raw).padStart(9)}  ≈ 實計 ${fmt(raw * calibration).padStart(9)}`);
  }
  console.log(`    最近 7 日均值: 模型 ${fmt(recentMeanRaw)} ≈ 實計 ${fmt(recentMeanRaw * calibration)}/日`);

  console.log('\n  預估週期結束:');
  console.log(`    維持最近速率 → 累計 ${fmt(projectedBytes)}（上限 ${fmt(limitGb * 1e9)}）`);

  if (projectedBytes >= limitGb * 1e9) {
    const daysToLimit = recentMeanRaw * calibration > 0
      ? Math.max(0, (limitGb * 1e9 - usedBytes) / (recentMeanRaw * calibration))
      : Infinity;
    console.log(`    ⚠️ 風險：預計在週期結束前用盡 → compute 將被暫停（全校停用）`);
    console.log(`       以最近速率估算，約 ${daysToLimit.toFixed(1)} 日後觸頂。`);
    console.log(`       ⇒ 安全為先：立即取得餘裕（升級方案或部署已完成的讀取路徑修正）。`);
  } else {
    console.log(`    ✅ 以最近速率估算，本期不會觸頂（餘裕 ${fmt(limitGb * 1e9 - projectedBytes)}）。`);
  }

  console.log('\n  本期累計貢獻者（依本期模型量 × 校準係數，總和應接近已消耗量）：');
  const topContributors = [...rawByStudent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [sid, raw] of topContributors) {
    const w = whoById.get(sid);
    const label = w ? `${w.role}:${w.display_name}` : sid;
    console.log(`    ${fmt(raw * calibration).padStart(9)}  ${label}`);
  }

  console.log('\n--- 敏感度（調整假設後重跑：--passes-per-day / --active-students） ---');
  const avgPerStudent = perStudent.length > 0
    ? perStudent.reduce((s, p) => s + p.bytes, 0) / perStudent.length
    : 0;
  const monthlyFromReads = avgPerStudent * passesPerDay * activeStudents * daysPerMonth;
  console.log(`  假設：活躍學生 ${activeStudents} 名 × 每人每日 ${passesPerDay} 次全歷史投影 × ${daysPerMonth} 日`);
  console.log(`  每名學生每次投影（前 5 重平均）: ${fmt(avgPerStudent)} → ${fmt(monthlyFromReads)}`);
  console.log(`  admin export（批次投影）每日一次: ${fmt(batchAll.totalBytes * daysPerMonth)}`);
  console.log(`  Neon Free 額度: 5.00 GB / project / 月\n`);

  // ---------- 5. pg_stat_statements（若已啟用） ----------
  const { rows: extRows } = await client.query(`
    SELECT
      EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS enabled,
      EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_stat_statements') AS available
  `);
  const ext = extRows[0];

  console.log('--- pg_stat_statements（實際查詢排行） ---');
  if (!ext.enabled) {
    console.log(`  未啟用（可安裝: ${ext.available ? '是' : '否'}）。`);
    console.log('  啟用方式（Neon Console → SQL Editor，需重啟 compute 才生效）：');
    console.log('    CREATE EXTENSION IF NOT EXISTS pg_stat_statements;');
    if (ext.available) console.log('  啟用後重跑本腳本即可看到真實排行。');
  } else {
    const { rows: top } = await client.query(`
      SELECT calls, rows AS total_rows,
             round(rows::numeric / NULLIF(calls, 0), 1) AS avg_rows,
             left(regexp_replace(query, '\\s+', ' ', 'g'), 90) AS query
      FROM pg_stat_statements
      WHERE calls > 0 AND query NOT ILIKE '%pg_stat_statements%'
      ORDER BY rows DESC
      LIMIT 12
    `);
    console.log('  依「回傳列數」排序（最可能造成 egress 者在前）：\n');
    console.log('      calls | total_rows | avg_rows | query');
    for (const t of top) {
      console.log(
        `  ${String(t.calls).padStart(8)} | ${String(t.total_rows).padStart(10)} | ${String(t.avg_rows).padStart(8)} | ${t.query}`,
      );
    }
    console.log('\n  提示：Neon scale-to-zero 會清空 pg_stat_statements；如需乾淨觀測窗請先執行');
    console.log('    SELECT pg_stat_statements_reset();');
  }

  await client.end();
  console.log('\n=== 診斷完成（未寫入任何資料） ===\n');
}

main().catch(err => {
  console.error('診斷失敗:', err instanceof Error ? err.message : err);
  process.exit(1);
});
