// ============================================
// 查詢層級實測（pg_stat_statements）—— 補上 egress 歸因唯一缺失的實證
// ============================================
// 為什麼需要它：先前的歸因是用「校準到已消耗量」的模型推出來的，會把**所有**
// egress 來源都吸進同一個係數（k≈11），因此無法分辨
//   (a) 練習全歷史投影
//   (b) 通知輪詢等非練習路徑
// 各佔多少。這直接決定步驟 5 的優先序，以及「修完能否回到 Free」。
//
// `rows` 是本擴充唯一可得的 egress 代理指標 —— Neon 官方文件亦以 `rows`
// 排序來找高流量查詢（無逐查詢位元組統計）。
//
// 用法：
//   npx tsx scripts/db-query-stats.ts --enable   # 建立擴充（對 DB 的寫入；可逆）
//   npx tsx scripts/db-query-stats.ts            # 只讀：查詢排行
//   npx tsx scripts/db-query-stats.ts --reset    # 清空統計以定義乾淨觀測窗
//
// ⚠️ 觀測窗注意：Neon 的 scale-to-zero 會**清空**統計。若 `stats_reset` 顯示
//    時間很近（或每次執行都變），代表 compute 曾休眠 → 該在 Console 暫時關閉
//    scale-to-zero（Launch 可關）再量，量完開回。
//
// ⚠️ 刻意**不**做成 Prisma migration：CI 的 Postgres 未以
//    shared_preload_libraries 載入此模組 → `CREATE EXTENSION` 會失敗並令
//    migration 中斷。這是 Neon 上的營運設定，不是 schema 的一部分。
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

/** 把 SQL 壓成單行並截短，方便閱讀 */
function compact(sql: string, max = 110): string {
  const one = sql.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

async function main() {
  const enable = process.argv.includes('--enable');
  const reset = process.argv.includes('--reset');

  const url = getDbUrl();
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const client = new Client({
    connectionString: url,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    application_name: 'db-query-stats',
  });
  await client.connect();

  console.log('\n=== 查詢層級實測（pg_stat_statements） ===\n');

  // ---------- 狀態 ----------
  const { rows: statusRows } = await client.query(`
    SELECT
      EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS installed,
      EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_stat_statements') AS available,
      (SELECT setting FROM pg_settings WHERE name = 'shared_preload_libraries') AS preload,
      (SELECT setting FROM pg_settings WHERE name = 'pg_stat_statements.track') AS track
  `).catch(() => ({ rows: [{} as Record<string, unknown>] }));
  const status = statusRows[0] as Record<string, unknown> | undefined;
  const installed = status?.installed === true;

  console.log('--- 狀態 ---');
  console.log(`  模組可用:       ${status?.available === true ? '是' : '否'}`);
  console.log(`  尚未 preload:   ${String(status?.preload ?? '(查詢失敗)')}`);
  console.log(`  extension:      ${installed ? '已建立' : '未建立'}`);
  console.log(`  track:          ${String(status?.track ?? 'n/a')}`);

  if (enable && !installed) {
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
    console.log('\n  ✅ 已建立 pg_stat_statements（可逆：DROP EXTENSION pg_stat_statements;）');
  } else if (enable) {
    console.log('\n  （已存在，無需重複建立）');
  }

  if (!installed && !enable) {
    console.log('\n  尚未建立 → 請先執行：npx tsx scripts/db-query-stats.ts --enable\n');
    await client.end();
    return;
  }

  if (reset) {
    await client.query('SELECT pg_stat_statements_reset()');
    console.log('\n  ♻️  統計已清空（觀測窗起點 = 現在）');
  }

  // ---------- 觀測窗與總量 ----------
  interface InfoRow { stats_reset: Date | null; dealloc: number }
  let info: InfoRow | null = null;
  try {
    const { rows } = await client.query<InfoRow>('SELECT stats_reset, dealloc FROM pg_stat_statements_info');
    info = rows[0] ?? null;
  } catch {
    info = null;
  }

  const { rows: totalsRows } = await client.query(`
    SELECT COALESCE(sum(calls), 0)::bigint AS calls,
           COALESCE(sum(rows), 0)::bigint  AS rows,
           count(*)::int                   AS entries
    FROM pg_stat_statements
    WHERE query NOT ILIKE '%pg_stat_statements%'
  `);
  const totals = totalsRows[0] as { calls: string | number; rows: string | number; entries: number };
  const totalRows = Number(totals.rows);
  const totalCalls = Number(totals.calls);

  console.log('\n--- 觀測窗 ---');
  // compute 若曾休眠（scale-to-zero），pg_stat_statements 會被清空 → 觀測窗失效。
  // pg_postmaster_start_time() 可看出 compute 實際存活了多久。
  const { rows: upRows } = await client.query(`
    SELECT pg_postmaster_start_time() AS started, now() AS now
  `).catch(() => ({ rows: [] as Array<{ started: Date; now: Date }> }));
  const up = upRows[0];
  if (up) {
    const uptimeSec = (new Date(up.now).getTime() - new Date(up.started).getTime()) / 1000;
    console.log(`  compute 啟動於:          ${new Date(up.started).toISOString()}（已存活 ${(uptimeSec / 3600).toFixed(2)} 小時）`);
    if (info?.stats_reset && new Date(up.started).getTime() > new Date(info.stats_reset).getTime() + 5000) {
      console.log('  ⚠️ compute 啟動晚於統計起點 → 期間曾休眠，統計可能已被清空。');
    }
  }
  console.log(`  統計起點 (stats_reset): ${info?.stats_reset ? new Date(info.stats_reset).toISOString() : '(未知)'}`);
  console.log(`  曾淘汰的項目 (dealloc): ${info?.dealloc ?? 'n/a'}`);
  console.log(`  已蒐集: ${totalCalls.toLocaleString()} calls / ${totalRows.toLocaleString()} rows / ${totals.entries} 條語句`);

  if (totalCalls === 0) {
    console.log('\n  ⚠️ 尚無資料。pg_stat_statements 只從建立後開始累計 ——');
    console.log('     需要一段真實使用時間（建議涵蓋一個上課日）後再執行本腳本。');
    console.log('     若稍後仍為 0 或 stats_reset 不斷變新，代表 compute 曾休眠被清空，');
    console.log('     請在 Neon Console 暫時關閉 scale-to-zero 再量。\n');
    await client.end();
    return;
  }

  // ---------- 依 rows 排行（egress 代理） ----------
  const { rows: byRows } = await client.query(`
    SELECT calls, rows, rows::float / NULLIF(calls, 0) AS avg_rows,
           round(total_exec_time::numeric, 1) AS total_ms,
           left(regexp_replace(query, E'\\\\s+', ' ', 'g'), 150) AS query
    FROM pg_stat_statements
    WHERE calls > 0 AND query NOT ILIKE '%pg_stat_statements%'
    ORDER BY rows DESC
    LIMIT 12
  `);

  console.log('\n--- 依「回傳列數」排行（egress 代理；Neon 無逐查詢位元組統計） ---\n');
  console.log('  佔比   |     calls |       rows | avg_rows |   total_ms | 語句');
  for (const r of byRows as Array<Record<string, string | number>>) {
    const rowsN = Number(r.rows);
    const share = totalRows > 0 ? ((rowsN / totalRows) * 100).toFixed(1) : '0.0';
    console.log(
      `  ${(share + '%').padStart(6)} | ${Number(r.calls).toLocaleString().padStart(9)} | ${rowsN.toLocaleString().padStart(10)} | ${Number(r.avg_rows).toFixed(1).padStart(8)} | ${String(r.total_ms).padStart(10)} | ${compact(String(r.query))}`,
    );
  }

  // ---------- 依 calls 排行（頻率；輪詢類） ----------
  const { rows: byCalls } = await client.query(`
    SELECT calls, rows,
           left(regexp_replace(query, E'\\\\s+', ' ', 'g'), 150) AS query
    FROM pg_stat_statements
    WHERE calls > 0 AND query NOT ILIKE '%pg_stat_statements%'
    ORDER BY calls DESC
    LIMIT 10
  `);

  console.log('\n--- 依「呼叫次數」排行（高頻輪詢會在此現形） ---\n');
  console.log('  佔比   |     calls |       rows | 語句');
  for (const r of byCalls as Array<Record<string, string | number>>) {
    const callsN = Number(r.calls);
    const share = totalCalls > 0 ? ((callsN / totalCalls) * 100).toFixed(1) : '0.0';
    console.log(
      `  ${(share + '%').padStart(6)} | ${callsN.toLocaleString().padStart(9)} | ${Number(r.rows).toLocaleString().padStart(10)} | ${compact(String(r.query))}`,
    );
  }

  // ---------- 判讀 ----------
  console.log('\n--- 判讀提示 ---');
  console.log('  · 單一語句 rows 佔比高且 avg_rows 大 → 大結果集（egress 主因）');
  console.log('  · calls 佔比極高但 avg_rows 小 → 高頻輪詢（egress 小但 CPU/連線成本高）');
  console.log('  · 若練習投影相關語句 rows 佔比不高 → 步驟 5 的效益不如模型推估，');
  console.log('    應改為優先處理非練習路徑（並重新評估能否回到 Free）。\n');

  await client.end();
}

main().catch(err => {
  console.error('執行失敗:', err instanceof Error ? err.message : err);
  process.exit(1);
});
