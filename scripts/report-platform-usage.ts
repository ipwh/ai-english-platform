// ============================================
// 報告：最近 N 個香港日的平台使用狀況（唯讀）
// ============================================
// 用途：學校層級的用量觀測 —— 使用人數、練習次數、每級使用次數最多的班別、
//       每班使用次數最多的學生，另附其他活動（寫作／IELTS／拼字／作業／XP）。
//
// 用法：
//   npx tsx scripts/report-platform-usage.ts [--days=7] [--json]
//   npx tsx scripts/report-platform-usage.ts --unassigned [--json]
//     → 列出「未分班」學生（無有效非 Demo 班別；無法計入任何班別統計）
//
// 語意（契約）：
// - 窗口：最近 N 個**香港日**（今日本地 00:00 起回推 N-1 日）；日界線一律經
//   `@/shared/utils/hk-date` 取得，**不得**用 UTC 日（見 AGENTS.md）。
// - 「練習次數」= `PracticeSession` 場次數（每次提交練習頁一筆）；
//   「使用人數」= 窗口內有 ≥1 場練習的學生數。`LoginLog` 目前為 0 列
//   （平台未寫入登入紀錄），故不以登入數當活躍指標。
// - 班別歸屬：`User.classId`（主班級）∪ `StudentClass`（混合上課）；排除
//   `role <> 'student'`、`level = 'Demo'` 與 `Class.name = 'Demo'`
//   （與 `getClassPracticeStats()` 的 roster 語意一致）。
//   無班別的學生另列為「未分班」。
// - egress 紀律（AGENTS.md／ADR-046）：全部查詢皆為**聚合**（每班／每日一列），
//   永不逐列搬全歷史。
// - 唯讀：本腳本不含任何寫入。
// ============================================

import { Pool } from 'pg';
import { argValue, getDbUrl } from './lib/db-env';
import { hkDayKey, hkDayStartUtc, hkDaysAgo } from '@/shared/utils/hk-date';

interface DayRow {
  day: string;
  sessions: number;
  students: number;
  questions: number;
}

interface ClassRow {
  class_id: string;
  class_name: string;
  grade: string;
  roster_size: number;
  participants: number;
  sessions: number;
  questions: number;
}

interface TopStudentRow {
  class_id: string;
  class_name: string;
  grade: string;
  student_name: string;
  sessions: number;
  questions: number;
  active_days: number;
}

interface OtherActivityRow {
  label: string;
  n: number;
  students: number;
}

interface UnassignedRow {
  id: string;
  name: string;
  email: string;
  level: string | null;
  class_number: string | null;
  academic_year: string | null;
  xp: number;
  joined_hk: string;
  class_id: string | null;
  sessions: number;
  last_practice: string | null;
}

/** `timestamp without time zone` 欄位以 UTC 協調世界時儲存 → 轉為可比較的 naive 字串 */
function pgNaiveUtc(at: Date): string {
  return at.toISOString().replace('T', ' ').replace('Z', '');
}

/** 以顯示寬度對齊（CJK 字元佔 2 欄） */
function padW(text: string, width: number, align: 'left' | 'right' = 'left'): string {
  const displayWidth = [...text].reduce((sum, ch) => sum + (ch.codePointAt(0)! > 0x2e80 ? 2 : 1), 0);
  const padding = ' '.repeat(Math.max(0, width - displayWidth));
  return align === 'left' ? text + padding : padding + text;
}

function gradeRank(grade: string): number {
  const match = /^S(\d)$/.exec(grade);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * 未分班學生清單（唯讀）。
 *
 * 判準與使用狀況報告一致：`role = 'student'`、`level <> 'Demo'`，且
 * **沒有**任何有效的非 Demo 班別（`User.classId` ∪ `StudentClass` 皆為空／
 * 指向不存在的班別或 Demo 班）。這些學生不會出現在任何班別統計中。
 */
async function reportUnassigned(client: Pool, asJson: boolean) {
  const { rows: students } = await client.query<{
    id: string; name: string; email: string; level: string | null;
    class_number: string | null; academic_year: string | null; xp: number;
    joined_hk: string; class_id: string | null;
  }>(`
    SELECT u.id,
           coalesce(nullif(u."nameZh", ''), nullif(u."name", ''), nullif(u."nameEn", ''), u.email) AS name,
           u.email, u.level, u."classNumber" AS class_number, u."academicYear" AS academic_year, u.xp,
           to_char(u."joinedAt" + interval '8 hours', 'YYYY-MM-DD') AS joined_hk,
           u."classId" AS class_id
    FROM "User" u
    WHERE u.role = 'student' AND coalesce(u.level, '') <> 'Demo'
      AND (u."classId" IS NULL
           OR NOT EXISTS (SELECT 1 FROM "Class" c WHERE c.id = u."classId" AND c.name <> 'Demo'))
      AND NOT EXISTS (
            SELECT 1 FROM "StudentClass" sc
            JOIN "Class" c2 ON c2.id = sc."classId"
            WHERE sc."studentId" = u.id AND c2.name <> 'Demo')
  `);

  const ids = students.map(row => row.id);
  const activity = new Map<string, { sessions: number; last_practice: string | null }>();
  if (ids.length > 0) {
    const { rows } = await client.query<{ studentId: string; sessions: number; last_practice: string | null }>(`
      SELECT "studentId", count(*)::int AS sessions,
             to_char(max("startedAt" + interval '8 hours'), 'YYYY-MM-DD') AS last_practice
      FROM "PracticeSession"
      WHERE "studentId" = ANY($1::text[])
      GROUP BY 1
    `, [ids]);
    for (const row of rows) activity.set(row.studentId, { sessions: row.sessions, last_practice: row.last_practice });
  }

  const list: UnassignedRow[] = students.map(row => ({
    ...row,
    sessions: activity.get(row.id)?.sessions ?? 0,
    last_practice: activity.get(row.id)?.last_practice ?? null,
  }));

  const byLevel = new Map<string, UnassignedRow[]>();
  for (const row of list) {
    const level = row.level ?? '(無級別)';
    const bucket = byLevel.get(level) ?? [];
    bucket.push(row);
    byLevel.set(level, bucket);
  }
  const levels = [...byLevel.keys()].sort((a, b) => {
    const rankA = a.startsWith('S') ? gradeRank(a) : Number.MAX_SAFE_INTEGER - 1;
    const rankB = b.startsWith('S') ? gradeRank(b) : Number.MAX_SAFE_INTEGER - 1;
    return rankA - rankB || a.localeCompare(b);
  });
  for (const level of levels) {
    byLevel.get(level)!.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  }

  if (asJson) {
    console.log(JSON.stringify({
      total: list.length,
      byLevel: Object.fromEntries(levels.map(level => [level, byLevel.get(level)!.length])),
      students: list,
    }, null, 2));
    return;
  }

  console.log('');
  console.log('='.repeat(78));
  console.log(`未分班學生清單（無有效非 Demo 班別）— 共 ${list.length} 人`);
  console.log('='.repeat(78));
  console.log('  這些學生不會計入任何班別統計（練習歸屬／最活躍班別／每班最活躍學生）。');
  console.log('');

  for (const level of levels) {
    const rows = byLevel.get(level)!;
    const everPracticed = rows.filter(row => row.sessions > 0).length;
    console.log(`【${level}】${rows.length} 人（其中 ${everPracticed} 人曾練習）`);
    console.log(`  ${padW('姓名', 16)}${padW('班號', 6)}${padW('電郵', 34)}${padW('學年', 11)}` +
      `${padW('XP', 7, 'right')}${padW('練習場次', 9, 'right')}${padW('最後練習', 12, 'right')}`);
    for (const row of rows) {
      console.log(
        `  ${padW(row.name, 16)}${padW(row.class_number ?? '—', 6)}${padW(row.email, 34)}${padW(row.academic_year ?? '—', 11)}`
        + `${padW(String(row.xp), 7, 'right')}${padW(String(row.sessions), 9, 'right')}${padW(row.last_practice ?? '—', 12, 'right')}`,
      );
    }
    console.log('');
  }

  console.log('  註：未分班判定＝`User.classId` 為空或指向不存在的班別／Demo 班，且無 `StudentClass`');
  console.log('      有效班別。指派班別的正典路徑是 `POST /api/admin/sync-sheets`（Google Sheet 名單同步）。');
  console.log('');
}

async function main() {
  const days = Number(argValue('--days') ?? '7');
  const asJson = process.argv.includes('--json');
  const listUnassigned = process.argv.includes('--unassigned');

  const startKey = hkDaysAgo(days - 1);
  const from = hkDayStartUtc(startKey);
  const to = new Date();
  const p1 = pgNaiveUtc(from);
  const p2 = pgNaiveUtc(to);

  const client = new Pool({ connectionString: getDbUrl(), max: 4 });

  try {
    if (listUnassigned) {
      await reportUnassigned(client, asJson);
      return;
    }
    const rosterCte = `
      roster AS (
        SELECT u.id,
               coalesce(nullif(u."nameZh", ''), nullif(u."name", ''), nullif(u."nameEn", ''), u.email) AS name,
               u."classId" AS class_id
        FROM "User" u
        WHERE u.role = 'student' AND coalesce(u.level, '') <> 'Demo'
        UNION
        SELECT u.id,
               coalesce(nullif(u."nameZh", ''), nullif(u."name", ''), nullif(u."nameEn", ''), u.email) AS name,
               sc."classId" AS class_id
        FROM "StudentClass" sc
        JOIN "User" u ON u.id = sc."studentId"
        WHERE u.role = 'student' AND coalesce(u.level, '') <> 'Demo'
      ),
      win AS (
        SELECT "studentId" AS sid,
               count(*)::int AS sessions,
               coalesce(sum("totalQuestions"), 0)::int AS questions,
               count(DISTINCT ("startedAt" + interval '8 hours')::date)::int AS active_days
        FROM "PracticeSession"
        WHERE "startedAt" >= $1::timestamp AND "startedAt" < $2::timestamp
        GROUP BY 1
      )`;

    const [overall, rosterCount, daily, classes, topStudents, unassigned, activeAny, logins, unassignedStudents, other] = await Promise.all([
      client.query(`
        SELECT count(*)::int AS sessions,
               count(DISTINCT "studentId")::int AS students,
               coalesce(sum("totalQuestions"), 0)::int AS questions
        FROM "PracticeSession"
        WHERE "startedAt" >= $1::timestamp AND "startedAt" < $2::timestamp
      `, [p1, p2]),

      client.query(`
        SELECT count(*)::int AS n
        FROM "User"
        WHERE role = 'student' AND coalesce(level, '') <> 'Demo'
      `),

      client.query(`
        SELECT to_char(("startedAt" + interval '8 hours')::date, 'YYYY-MM-DD') AS day,
               count(*)::int AS sessions,
               count(DISTINCT "studentId")::int AS students,
               coalesce(sum("totalQuestions"), 0)::int AS questions
        FROM "PracticeSession"
        WHERE "startedAt" >= $1::timestamp AND "startedAt" < $2::timestamp
        GROUP BY 1
        ORDER BY 1
      `, [p1, p2]),

      client.query(`
        WITH ${rosterCte}
        SELECT r.class_id, c.name AS class_name, c."gradeLevel" AS grade,
               count(*)::int AS roster_size,
               count(w.sid)::int AS participants,
               coalesce(sum(w.sessions), 0)::int AS sessions,
               coalesce(sum(w.questions), 0)::int AS questions
        FROM roster r
        JOIN "Class" c ON c.id = r.class_id
        LEFT JOIN win w ON w.sid = r.id
        WHERE c.name <> 'Demo'
        GROUP BY 1, 2, 3
      `, [p1, p2]),

      client.query(`
        WITH ${rosterCte}
        SELECT DISTINCT ON (r.class_id)
               r.class_id, c.name AS class_name, c."gradeLevel" AS grade,
               r.name AS student_name, w.sessions, w.questions, w.active_days
        FROM roster r
        JOIN "Class" c ON c.id = r.class_id
        JOIN win w ON w.sid = r.id
        WHERE c.name <> 'Demo'
        ORDER BY r.class_id, w.sessions DESC, w.questions DESC, r.name
      `, [p1, p2]),

      client.query(`
        WITH ${rosterCte}
        SELECT count(*)::int AS participants,
               coalesce(sum(w.sessions), 0)::int AS sessions,
               coalesce(sum(w.questions), 0)::int AS questions
        FROM win w
        JOIN roster r ON r.id = w.sid
        WHERE r.class_id IS NULL
           OR NOT EXISTS (SELECT 1 FROM "Class" c WHERE c.id = r.class_id AND c.name <> 'Demo')
      `, [p1, p2]),

      client.query(`
        SELECT count(DISTINCT events.id)::int AS users
        FROM (
          SELECT "studentId" AS id FROM "PracticeSession"
            WHERE "startedAt" >= $1::timestamp AND "startedAt" < $2::timestamp
          UNION ALL SELECT "userId" FROM "XpTransaction"
            WHERE "createdAt" >= $1::timestamp AND "createdAt" < $2::timestamp
          UNION ALL SELECT "studentId" FROM "WritingDraft"
            WHERE "createdAt" >= $1::timestamp AND "createdAt" < $2::timestamp
          UNION ALL SELECT "userId" FROM "IeltsAttempt"
            WHERE "startedAt" >= $1::timestamp AND "startedAt" < $2::timestamp
          UNION ALL SELECT "studentId" FROM "SpellingSession"
            WHERE "startedAt" >= $1::timestamp AND "startedAt" < $2::timestamp
          UNION ALL SELECT "studentId" FROM "Submission"
            WHERE "createdAt" >= $1::timestamp AND "createdAt" < $2::timestamp
        ) events
        JOIN "User" u ON u.id = events.id
        WHERE u.role = 'student' AND coalesce(u.level, '') <> 'Demo'
      `, [p1, p2]),

      client.query(`
        SELECT count(DISTINCT x."userId")::int AS users, count(*)::int AS login_days
        FROM "XpTransaction" x
        JOIN "User" u ON u.id = x."userId"
        WHERE x.event = 'dailyLogin'
          AND x."createdAt" >= $1::timestamp AND x."createdAt" < $2::timestamp
          AND u.role = 'student' AND coalesce(u.level, '') <> 'Demo'
      `, [p1, p2]),

      client.query(`
        SELECT count(*)::int AS n
        FROM "User" u
        WHERE u.role = 'student' AND coalesce(u.level, '') <> 'Demo'
          AND (u."classId" IS NULL
               OR NOT EXISTS (SELECT 1 FROM "Class" c WHERE c.id = u."classId" AND c.name <> 'Demo'))
      `),

      client.query(`
        WITH ok AS (
          SELECT id FROM "User" WHERE role = 'student' AND coalesce(level, '') <> 'Demo'
        )
        SELECT '寫作草稿' AS label, count(*)::int AS n, count(DISTINCT w."studentId")::int AS students
          FROM "WritingDraft" w JOIN ok ON ok.id = w."studentId"
         WHERE w."createdAt" >= $1::timestamp AND w."createdAt" < $2::timestamp
        UNION ALL
        SELECT 'IELTS 練習卷', count(*)::int, count(DISTINCT a."userId")::int
          FROM "IeltsAttempt" a JOIN ok ON ok.id = a."userId"
         WHERE a."startedAt" >= $1::timestamp AND a."startedAt" < $2::timestamp
        UNION ALL
        SELECT '拼字練習', count(*)::int, count(DISTINCT s."studentId")::int
          FROM "SpellingSession" s JOIN ok ON ok.id = s."studentId"
         WHERE s."startedAt" >= $1::timestamp AND s."startedAt" < $2::timestamp
        UNION ALL
        SELECT '作業提交', count(*)::int, count(DISTINCT sub."studentId")::int
          FROM "Submission" sub JOIN ok ON ok.id = sub."studentId"
         WHERE sub."createdAt" >= $1::timestamp AND sub."createdAt" < $2::timestamp
        UNION ALL
        SELECT 'XP 事件（答題／複習／單字／登入）', count(*)::int, count(DISTINCT x."userId")::int
          FROM "XpTransaction" x JOIN ok ON ok.id = x."userId"
         WHERE x."createdAt" >= $1::timestamp AND x."createdAt" < $2::timestamp
      `, [p1, p2]),
    ]);

    const overallRow = overall.rows[0] as { sessions: number; students: number; questions: number };
    const rosterSize = (rosterCount.rows[0] as { n: number }).n;
    const dayRows = daily.rows as DayRow[];
    const classRows = (classes.rows as ClassRow[]).sort((a, b) =>
      gradeRank(a.grade) - gradeRank(b.grade)
      || a.grade.localeCompare(b.grade)
      || a.class_name.localeCompare(b.class_name),
    );
    const topByClass = new Map((topStudents.rows as TopStudentRow[]).map(row => [row.class_id, row]));
    const unassignedRow = unassigned.rows[0] as { participants: number; sessions: number; questions: number };
    const activeAnyUsers = (activeAny.rows[0] as { users: number }).users;
    const loginRow = logins.rows[0] as { users: number; login_days: number };
    const unassignedStudentCount = (unassignedStudents.rows[0] as { n: number }).n;
    const otherRows = other.rows as OtherActivityRow[];

    // 每級最活躍班別：先依使用次數，再依使用人數、班名
    const byGrade = new Map<string, ClassRow[]>();
    for (const row of classRows) {
      const list = byGrade.get(row.grade) ?? [];
      list.push(row);
      byGrade.set(row.grade, list);
    }

    if (asJson) {
      console.log(JSON.stringify({
        window: { days, fromHk: startKey, toHk: hkDayKey(to), fromUtc: p1, toUtc: p2 },
        overall: { rosterSize, activeAnyUsers, unassignedStudents: unassignedStudentCount, logins: loginRow, ...overallRow },
        daily: dayRows,
        classes: classRows,
        topStudentPerClass: [...topByClass.values()],
        unassigned: unassignedRow,
        otherActivity: otherRows,
      }, null, 2));
      return;
    }

    const totalSessions = classRows.reduce((sum, row) => sum + row.sessions, 0) + unassignedRow.sessions;
    const totalParticipants = classRows.reduce((sum, row) => sum + row.participants, 0) + unassignedRow.participants;

    console.log('');
    console.log('='.repeat(78));
    console.log(`平台使用狀況報告 — 最近 ${days} 個香港日（${startKey} → ${hkDayKey(to)}）`);
    console.log('='.repeat(78));
    console.log('');
    console.log('【一、總覽】');
    console.log(`  學生總數（排除 Demo）      : ${rosterSize}（其中 ${unassignedStudentCount} 人未分班）`);
    console.log(`  使用人數（有練習的學生）   : ${totalParticipants}`);
    console.log(`  使用人數（有登入紀錄）     : ${loginRow.users}（登入日數合計 ${loginRow.login_days} 人日）`);
    console.log(`  活躍使用者（任一活動）     : ${activeAnyUsers}（練習／登入／單字／錯題／IELTS／拼字／作業）`);
    console.log(`  練習參與率                 : ${rosterSize > 0 ? ((totalParticipants / rosterSize) * 100).toFixed(1) : '—'}%`);
    console.log(`  練習次數（練習場次）       : ${totalSessions}`);
    console.log(`  作答題數                   : ${overallRow.questions}`);
    console.log(`  平均每名使用者練習次數     : ${totalParticipants > 0 ? (totalSessions / totalParticipants).toFixed(2) : '—'}`);
    console.log(`  有使用紀錄的班別數         : ${classRows.filter(row => row.sessions > 0).length} / ${classRows.length}`);
    if (unassignedRow.sessions > 0 || unassignedRow.participants > 0) {
      console.log(`  （其中未分班學生：${unassignedRow.participants} 人 / ${unassignedRow.sessions} 次）`);
    }
    console.log('');

    console.log('【二、逐日趨勢（香港日）】');
    console.log(`  ${padW('日期', 12)}${padW('使用人數', 10, 'right')}${padW('練習次數', 10, 'right')}${padW('作答題數', 10, 'right')}`);
    for (const row of dayRows) {
      console.log(`  ${padW(row.day, 12)}${padW(String(row.students), 10, 'right')}${padW(String(row.sessions), 10, 'right')}${padW(String(row.questions), 10, 'right')}`);
    }
    if (dayRows.length === 0) console.log('  （窗口內無練習紀錄）');
    console.log('');

    console.log('【三、各級使用狀況＋該級使用次數最多的班別】');
    console.log(`  ${padW('級別', 6)}${padW('練習次數', 10, 'right')}${padW('使用人數', 10, 'right')}${padW('名單人數', 10, 'right')}${padW('使用率', 9, 'right')}    最活躍班別`);
    const grades = [...byGrade.keys()].sort((a, b) => gradeRank(a) - gradeRank(b) || a.localeCompare(b));
    for (const grade of grades) {
      const rows = byGrade.get(grade)!;
      const sessions = rows.reduce((sum, row) => sum + row.sessions, 0);
      const participants = rows.reduce((sum, row) => sum + row.participants, 0);
      const roster = rows.reduce((sum, row) => sum + row.roster_size, 0);
      const top = [...rows].sort((a, b) => b.sessions - a.sessions || b.participants - a.participants || a.class_name.localeCompare(b.class_name))[0];
      const topLabel = top.sessions > 0
        ? `${top.class_name}（${top.sessions} 次 / ${top.participants} 人）`
        : '（無使用紀錄）';
      console.log(
        `  ${padW(grade, 6)}${padW(String(sessions), 10, 'right')}${padW(String(participants), 10, 'right')}${padW(String(roster), 10, 'right')}`
        + `${padW(roster > 0 ? `${((participants / roster) * 100).toFixed(0)}%` : '—', 9, 'right')}    ${topLabel}`,
      );
    }
    console.log('');

    console.log('【四、各級完整班別排行（依使用次數）】');
    for (const grade of grades) {
      const rows = [...byGrade.get(grade)!].sort((a, b) => b.sessions - a.sessions || b.participants - a.participants || a.class_name.localeCompare(b.class_name));
      const summary = rows.map(row => `${row.class_name} ${row.sessions}次/${row.participants}人`).join('　');
      console.log(`  ${padW(grade, 5)}${summary}`);
    }
    console.log('');

    console.log('【五、每班使用次數最多的學生】');
    console.log(`  ${padW('班別', 8)}${padW('最活躍學生', 20)}${padW('練習次數', 10, 'right')}${padW('作答題數', 10, 'right')}${padW('活躍日數', 10, 'right')}${padW('全班次數', 10, 'right')}`);
    for (const row of classRows) {
      const top = topByClass.get(row.class_id);
      const studentName = top ? top.student_name : '（無）';
      console.log(
        `  ${padW(row.class_name, 8)}${padW(studentName, 20)}`
        + `${padW(top ? String(top.sessions) : '—', 10, 'right')}${padW(top ? String(top.questions) : '—', 10, 'right')}`
        + `${padW(top ? String(top.active_days) : '—', 10, 'right')}${padW(String(row.sessions), 10, 'right')}`,
      );
    }
    console.log('');

    console.log('【六、其他活動（同期間）】');
    console.log(`  ${padW('活動', 36)}${padW('次數', 10, 'right')}${padW('使用人數', 10, 'right')}`);
    for (const row of otherRows) {
      console.log(`  ${padW(row.label, 36)}${padW(String(row.n), 10, 'right')}${padW(String(row.students), 10, 'right')}`);
    }
    console.log('');
    console.log('  註：「練習次數」＝PracticeSession 場次（每次提交練習頁一筆）；「有登入紀錄」＝該學生於');
    console.log('      窗口內取得 dailyLogin XP 事件（學生端每次載入即經 /api/streak 發放，每香港日最多一次；');
    console.log('      LoginLog 表為 0 列，平台未寫入登入紀錄）。');
    console.log('      班別歸屬＝User.classId ∪ StudentClass；未分班的學生不計入任何班別。');
    console.log('      以上統計只計學生帳號（role=student、排除 Demo）；教師／管理員的操作不計入。');
    console.log('');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
