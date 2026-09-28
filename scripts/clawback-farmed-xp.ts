// ============================================
// 一次性回調：刪除刷分所得的 XpTransaction 並扣減 User.xp
// ============================================
// 事故（DB 實證，見 CHANGELOG 2026-09-28）：
//   `POST /api/gamification` 從前採信客戶端 event 且多數事件無去重鍵，
//   `vocabulary/page.tsx` 的 `handleToggleFamiliarity()` 每當熟悉度循環回到
//   `mastered` 就發一次 `masterWord` → 可無限重複領取。
//   全校 masterWord 幾乎集中在兩名學生（單分鐘最多 111 / 69 筆）。
//
// 為何「刪除」而非「補一筆負數調整」：
//   這些列不是學習證據（平台原則：evidence only），保留會令任何以 event 分組的
//   統計（例如 masterWord 佔比）繼續失真；而補負數列雖保留審計卻無法還原
//   「該事件根本不曾合法發生」的事實。刪除後帳本與餘額一致。
//   * 副作用已知並接受：無法辨識「刷分前是否已有少量合法 masterWord」
//     （舊記錄 metadata 為空 `{}`，不含 wordId），故整個 event 一併移除。
//
// 用法：
//   npx tsx scripts/clawback-farmed-xp.ts                     （dry-run，只報告）
//   npx tsx scripts/clawback-farmed-xp.ts --apply              （正式寫入）
//   npx tsx scripts/clawback-farmed-xp.ts --event=masterWord   （覆寫事件，預設 masterWord）
//
// 安全設計：
//   - 交易內以「刪除前的 `User.xp` 確切值」作前置條件（`updateMany` where xp = 舊值）
//     → 期間若有新 XP 入帳則不匹配、整筆回滾，永不覆蓋並行的合法入帳。
//   - 互動交易帶 `{ maxWait, timeout }`（AGENTS.md 熱路徑護欄）。
//   - 預設 dry-run；`--apply` 才寫入。
//
// DATABASE_URL 來源：環境變數優先，否則依序讀 .env.local / .env
// ============================================

import { argValue, getDbUrl } from './lib/db-env';

/** 2026-09-28 事故所識別的兩名刷分學生（依 `User.nameZh` 精確比對）。 */
const TARGETS = [
  { nameZh: '翁晟燁', note: '單分鐘最多 111 筆（2026-09-26 19:22）' },
  { nameZh: '許樂', note: '單分鐘最多 69 筆（2026-09-26 19:36）' },
] as const;

const TX_OPTIONS = { maxWait: 5_000, timeout: 20_000 } as const;

async function main() {
  const apply = process.argv.includes('--apply');
  const event = argValue('--event') ?? 'masterWord';
  process.env.DATABASE_URL = getDbUrl(); // 必須在載入應用模組之前設定

  const { db } = await import('@/shared/db/db');

  console.log(`\n模式：${apply ? 'APPLY（會寫入）' : 'DRY-RUN（唯讀）'}   事件：${event}\n`);
  console.log('='.repeat(76));

  let grandRows = 0;
  let grandXp = 0;

  for (const target of TARGETS) {
    const users = await db.user.findMany({
      where: { nameZh: target.nameZh },
      select: { id: true, nameZh: true, name: true, level: true, xp: true },
    });

    if (users.length === 0) {
      console.log(`\n⚠️  找不到學生「${target.nameZh}」—— 跳過。`);
      continue;
    }
    if (users.length > 1) {
      console.log(`\n⚠️  「${target.nameZh}」有 ${users.length} 筆同名帳號 —— 為安全起見跳過（請以 id 指定）。`);
      for (const u of users) console.log(`     id=${u.id} level=${u.level} email=?`);
      continue;
    }

    const user = users[0];
    const [rows, agg] = await Promise.all([
      db.xpTransaction.count({ where: { userId: user.id, event } }),
      db.xpTransaction.aggregate({ where: { userId: user.id, event }, _sum: { xpAmount: true } }),
    ]);
    const ledgerTotal = await db.xpTransaction.aggregate({ where: { userId: user.id }, _sum: { xpAmount: true } });

    const farmXp = agg._sum.xpAmount ?? 0;
    const xpBefore = user.xp;
    const xpAfter = xpBefore - farmXp;

    console.log(`\n👤 ${user.nameZh}  (${user.level ?? '—'})  id=${user.id}`);
    console.log(`   事故說明：${target.note}`);
    console.log(`   ${event} 列數 = ${rows}   可疑 XP = ${farmXp}`);
    console.log(`   User.xp 目前 = ${xpBefore}   回調後 = ${xpAfter}`);
    console.log(`   帳本合計 = ${ledgerTotal._sum.xpAmount ?? 0}（與餘額差 ${(ledgerTotal._sum.xpAmount ?? 0) - xpBefore}）`);

    if (rows === 0) {
      console.log('   ✅ 已無可回調列 —— 冪等，跳過。');
      continue;
    }
    if (xpAfter < 0) {
      console.log(`   ⛔ 回調後餘額為負（${xpAfter}）—— 拒絕執行，請人工檢查。`);
      continue;
    }

    grandRows += rows;
    grandXp += farmXp;

    if (!apply) {
      console.log('   → （dry-run）將刪除上列並將 User.xp 設為 ' + xpAfter);
      continue;
    }

    const result = await db.$transaction(async (tx) => {
      const deleted = await tx.xpTransaction.deleteMany({ where: { userId: user.id, event } });
      // 前置條件：xp 必須仍是我們剛讀到的值（並行入帳時不匹配 → count 0 → 回滾）
      const updated = await tx.user.updateMany({
        where: { id: user.id, xp: xpBefore },
        data: { xp: xpAfter },
      });
      if (updated.count !== 1) {
        throw new Error(`User.xp 於讀取後被並行修改（期望 ${xpBefore}）—— 已回滾，請重跑。`);
      }
      return { deleted: deleted.count };
    }, TX_OPTIONS);

    const after = await db.user.findUnique({ where: { id: user.id }, select: { xp: true } });
    const afterLedger = await db.xpTransaction.aggregate({ where: { userId: user.id }, _sum: { xpAmount: true } });
    console.log(`   ✅ 已刪除 ${result.deleted} 列；User.xp = ${after?.xp}；帳本合計 = ${afterLedger._sum.xpAmount ?? 0}（差 ${(afterLedger._sum.xpAmount ?? 0) - (after?.xp ?? 0)}）`);
  }

  console.log('\n' + '='.repeat(76));
  console.log(`合計：${grandRows} 列 / ${grandXp} XP ${apply ? '已回調' : '（dry-run，未寫入）'}`);
  if (!apply && grandRows > 0) console.log('加上 --apply 才會實際寫入。');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
