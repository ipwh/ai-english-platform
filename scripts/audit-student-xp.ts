// ============================================
// 稽核：查核某學生的 XP 來源（單一學生、低 egress）
//
// 用法：
//   npx tsx scripts/audit-student-xp.ts --name=翁晟燁
//   npx tsx scripts/audit-student-xp.ts --name=翁晟燁 --days=14
//
// 設計原則（見 AGENTS.md egress 紀律）：
//   - 只查一名學生；累計一律用 SQL groupBy（回傳 ~10 列），永不逐列搬全歷史
//   - 近日明細有限筆（預設 300 列），只作顯示
//   - 日界線一律用香港日（`hkDayKey`），不得用 UTC 日
//
// DATABASE_URL 來源：環境變數優先，否則依序讀 .env.local / .env
// ============================================

import { argValue, getDbUrl } from './lib/db-env';

async function main() {
  const name = argValue('--name') ?? process.argv[2] ?? '翁晟燁';
  const days = Number(argValue('--days') ?? '14');

  process.env.DATABASE_URL = getDbUrl(); // 必須在載入應用模組之前設定

  const { db } = await import('@/shared/db/db');
  const { hkDayKey, hkDaysAgo, hkDayStartUtc } = await import('@/shared/utils/hk-date');

  // --top：全校 masterWord 刷分排行（單一 SQL 聚合，僅回傳 15 列）
  if (process.argv.includes('--top')) {
    const top = await db.$queryRaw<Array<{ name: string | null; nameZh: string | null; level: string | null; n: bigint; xp: bigint }>>`
      SELECT u.name, u."nameZh", u.level, count(*) AS n, sum(x."xpAmount") AS xp
      FROM "XpTransaction" x JOIN "User" u ON u.id = x."userId"
      WHERE x.event = 'masterWord'
      GROUP BY 1, 2, 3
      ORDER BY count(*) DESC
      LIMIT 15
    `;
    console.log('\n── masterWord 次數排行（全校前 15）──');
    console.log('   ' + '學生'.padEnd(22) + '次數'.padStart(8) + 'XP'.padStart(10));
    for (const r of top) {
      console.log('   ' + String(r.nameZh ?? r.name ?? '—').padEnd(22) + String(r.n).padStart(8) + String(r.xp).padStart(10));
    }
    console.log('');
    return;
  }

  const students = await db.user.findMany({
    where: {
      OR: [
        { name: { contains: name, mode: 'insensitive' } },
        { nameZh: { contains: name } },
        { nameEn: { contains: name, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, nameZh: true, nameEn: true, email: true, role: true, level: true, xp: true, streakDays: true, overallAccuracy: true },
    take: 10,
  });

  if (students.length === 0) {
    console.log(`\n找不到姓名含「${name}」的使用者（已查 name / nameZh / nameEn）。`);
    return;
  }
  if (students.length > 1) {
    console.log(`\n⚠️  有 ${students.length} 筆姓名相符，全部列出：`);
    for (const s of students) console.log(`   - ${s.nameZh ?? s.name ?? s.nameEn} | ${s.email} | role=${s.role} | level=${s.level} | id=${s.id}`);
  }

  const since = hkDayStartUtc(hkDaysAgo(days));
  console.log(`\n香港時間 now=${hkDayKey(new Date())}；近日窗口自 ${hkDayKey(since)} 起（${days} 日）\n`);
  console.log('='.repeat(72));

  for (const student of students) {
    console.log(`\n👤 ${student.nameZh ?? student.name ?? student.nameEn}  <${student.email}>`);
    console.log(`   id=${student.id}  role=${student.role}  level=${student.level ?? '—'}`);
    console.log(`   總 XP=${student.xp}  streakDays=${student.streakDays}  overallAccuracy=${student.overallAccuracy ?? 'null（無可驗證資料）'}`);

    // 1) 全時 XP 來源（SQL 聚合，回傳每個 event 一列）
    const allTime = await db.xpTransaction.groupBy({
      by: ['event'],
      where: { userId: student.id },
      _count: { _all: true },
      _sum: { xpAmount: true },
      _min: { xpAmount: true },
      _max: { xpAmount: true },
      orderBy: { event: 'asc' },
    });

    console.log('\n   ── 全時 XP 來源（依事件）──');
    console.log('   ' + '事件'.padEnd(20) + '次數'.padStart(6) + '總XP'.padStart(8) + '最小'.padStart(6) + '最大'.padStart(6));
    let grand = 0;
    for (const row of allTime) {
      const sum = row._sum.xpAmount ?? 0;
      grand += sum;
      console.log('   ' + row.event.padEnd(20) + String(row._count._all).padStart(6) + String(sum).padStart(8) + String(row._min.xpAmount ?? 0).padStart(6) + String(row._max.xpAmount ?? 0).padStart(6));
    }
    console.log('   ' + '合計'.padEnd(20) + ''.padStart(6) + String(grand).padStart(8));

    // 1b) 帳本 vs 餘額對帳（兩者應相等；不等代表有列未被計入 User.xp 或反之）
    const ledgerAgg = await db.xpTransaction.aggregate({ where: { userId: student.id }, _sum: { xpAmount: true } });
    const ledgerSum = ledgerAgg._sum.xpAmount ?? 0;
    const delta = ledgerSum - student.xp;
    console.log(`   帳本合計=${ledgerSum}  User.xp=${student.xp}  差額=${delta}`);
    if (delta !== 0) {
      const nullMeta = await db.xpTransaction.groupBy({
        by: ['event'],
        where: { userId: student.id, metadata: null },
        _count: { _all: true },
        _sum: { xpAmount: true },
      });
      console.log('   差額來源調查 —— metadata 為 NULL 的列（舊 `/api/daily-challenge` 只寫帳本、未加 User.xp）：');
      for (const r of nullMeta) {
        console.log(`     event=${r.event.padEnd(16)} 次數=${r._count._all} 合計XP=${r._sum.xpAmount ?? 0}`);
      }
    }

    // 2) 近日明細（有限筆，只作顯示）
    const rows = await db.xpTransaction.findMany({
      where: { userId: student.id, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: { event: true, xpAmount: true, idempotencyKey: true, metadata: true, createdAt: true },
    });

    if (rows.length === 0) {
      console.log(`\n   ── 近 ${days} 日：無 XP 記錄 ──`);
      continue;
    }

    // 3) SQL 聚合：每香港日 × 事件（回傳少量列，永不逐列搬全歷史）
    //    SQL 端直接輸出字串，避免 JS Date 的時區二次偏移。
    const daily = await db.$queryRaw<Array<{ day: string; event: string; n: bigint; xp: bigint }>>`
      SELECT to_char("createdAt" + interval '8 hours', 'YYYY-MM-DD') AS day,
             event, count(*) AS n, sum("xpAmount") AS xp
      FROM "XpTransaction"
      WHERE "userId" = ${student.id}
      GROUP BY 1, 2
      ORDER BY 1 DESC
      LIMIT 200
    `;
    const dayMap = new Map<string, Array<{ event: string; n: number; xp: number }>>();
    for (const row of daily) {
      if (!dayMap.has(row.day)) dayMap.set(row.day, []);
      dayMap.get(row.day)!.push({ event: row.event, n: Number(row.n), xp: Number(row.xp) });
    }
    console.log('\n   ── 各香港日 XP 彙總（SQL 聚合，全時；近 30 日）──');
    for (const key of [...dayMap.keys()].sort().reverse().slice(0, 30)) {
      const evs = dayMap.get(key)!;
      const total = evs.reduce((s, e) => s + e.xp, 0);
      console.log(`   ${key}  合計 ${String(total).padStart(6)}   ${evs.map(e => `${e.event} ${e.xp}(${e.n})`).join('  ')}`);
    }

    // 4) 爆量偵測：同一分鐘內的重複事件（刷分特徵）
    const bursts = await db.$queryRaw<Array<{ bucket: string; n: bigint; xp: bigint; event: string }>>`
      SELECT to_char(date_trunc('minute', "createdAt" + interval '8 hours'), 'YYYY-MM-DD HH24:MI') AS bucket,
             event, count(*) AS n, sum("xpAmount") AS xp
      FROM "XpTransaction"
      WHERE "userId" = ${student.id}
      GROUP BY 1, 2
      HAVING count(*) >= 5
      ORDER BY n DESC
      LIMIT 10
    `;
    console.log('\n   ── 同一分鐘內 ≥5 筆的爆量（刷分特徵，前 10）──');
    if (bursts.length === 0) console.log('   （無）');
    for (const b of bursts) {
      console.log(`   ${b.bucket}  ${b.event.padEnd(18)} ${String(b.n).padStart(4)} 筆 / ${b.xp} XP`);
    }

    // 5) 生字簿實況（解釋 learnWord / masterWord 次數）
    const vocabCount = await db.vocabItem.count({ where: { studentId: student.id } });
    const familiarityDist = await db.vocabItem.groupBy({
      by: ['familiarity'],
      where: { studentId: student.id },
      _count: { _all: true },
    });
    console.log(`\n   ── 生字簿實況 ──`);
    console.log(`   生字總數 = ${vocabCount}`);
    for (const f of familiarityDist) console.log(`   familiarity=${String(f.familiarity).padEnd(12)} ${f._count._all} 個`);

    console.log(`\n   ── 最近記錄（最多 60 列，新→舊）──`);
    for (const r of rows.slice(0, 60)) {
      const ts = new Date(r.createdAt).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong', hour12: false });
      const meta = r.metadata && r.metadata !== '{}' ? `  meta=${r.metadata}` : '';
      const key = r.idempotencyKey ? `  key=${r.idempotencyKey}` : '';
      console.log(`   ${ts}  +${String(r.xpAmount).padStart(4)}  ${r.event.padEnd(18)}${key}${meta}`);
    }
  }
  console.log('\n' + '='.repeat(72) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
