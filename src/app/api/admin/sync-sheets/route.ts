// ============================================
// POST /api/admin/sync-sheets — 從 Google Sheets 同步班別名單
//
// 使用場景：
//   教師在 Google Sheets 中維護各班學生名單（真相來源），
//   一鍵同步到平台資料庫，徹底解決班別資料錯誤問題。
//
// Google Sheet 格式（第一個分頁）：
//   Email | Class | ClassNumber | NameZh | NameEn | Level
//   ------|-------|-------------|--------|--------|------
//   student1@school.hk | 4A | 15 | 陳大文 | Chan Tai Man | S4
//
// 環境變數：
//   GOOGLE_SHEETS_CLASS_ROSTER_ID — Google Sheet ID（從網址列取得）
//   GCP_SERVICE_ACCOUNT_JSON — Service Account JSON（與 OCR 共用）
//
// 請求參數（optional）：
//   { dryRun: true } — 預覽模式，不實際寫入
//   { sheetName: "S4" } — 指定分頁名稱（預設第一個分頁）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { adminDbDirect as db } from '@/modules/admin/services/admin-operations';
import { verifyAdmin } from '@/shared/auth/admin-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { logger } from '@/shared/logger/logger';
import { GoogleAuth } from 'google-auth-library';

// ============================================
// 類型定義
// ============================================

interface SheetRow {
  email: string;
  class: string;
  classNumber: string;
  nameZh: string;
  nameEn: string;
  level: string;
}

interface SyncResult {
  mode: 'dryRun' | 'live';
  sheetName: string;
  totalRows: number;
  created: number;
  updated: number;
  classFixed: number;   // 班別被修正的學生數
  unassigned: number;   // 不在名單中被解除班別的學生數（畢業生/轉校生）
  skipped: number;
  errors: string[];
  details: {
    email: string;
    nameZh: string;
    action: 'created' | 'updated' | 'class_fixed' | 'skipped' | 'error';
    oldClass?: string;
    newClass?: string;
    reason?: string;
  }[];
  classDistribution: Record<string, number>;
}

// ============================================
// Google Sheets 認證與讀取
// ============================================

function getServiceAccountCredentials(): string {
  // 優先使用環境變數中的 JSON 內容（部署環境用）
  if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
    return process.env.GCP_SERVICE_ACCOUNT_JSON;
  }
  // 本地開發：讀取檔案
  throw new Error(
    '缺少 GCP 憑證。請在環境變數中設定 GCP_SERVICE_ACCOUNT_JSON（貼上完整的 service account JSON 內容）。'
  );
}

async function fetchSheetData(
  spreadsheetId: string,
  sheetName?: string
): Promise<{ rows: SheetRow[]; sheetName: string }> {
  const credentialsStr = getServiceAccountCredentials();
  const credentials = JSON.parse(credentialsStr);

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  // 先取得所有分頁名稱
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken.token}` },
  });

  if (!metaRes.ok) {
    const errText = await metaRes.text();
    throw new Error(`無法讀取 Google Sheet 資訊 (${metaRes.status}): ${errText}`);
  }

  const meta = await metaRes.json() as { sheets: { properties: { title: string } }[] };
  const availableSheets = meta.sheets.map((s: { properties: { title: string } }) => s.properties.title);

  // 決定要讀取的分頁
  let targetSheet = sheetName;
  if (!targetSheet || !availableSheets.includes(targetSheet)) {
    targetSheet = availableSheets[0];
  }

  if (!targetSheet) {
    throw new Error('Google Sheet 中沒有任何分頁');
  }

  // 讀取分頁資料（A:F 欄位）
  const range = encodeURIComponent(`'${targetSheet}'!A:F`);
  const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const dataRes = await fetch(dataUrl, {
    headers: { Authorization: `Bearer ${accessToken.token}` },
  });

  if (!dataRes.ok) {
    const errText = await dataRes.text();
    throw new Error(`無法讀取 Google Sheet 資料 (${dataRes.status}): ${errText}`);
  }

  const data = await dataRes.json() as { values?: string[][] };
  const values = data.values || [];

  if (values.length < 2) {
    throw new Error(`分頁「${targetSheet}」沒有資料（需要標題列 + 至少一筆學生資料）`);
  }

  // 解析標題列（支援多種常見欄位名稱變體）
  const headers = values[0].map((h: string) => h.trim().toLowerCase());
  const emailIdx = headers.findIndex((h: string) =>
    h === 'email' || h === '電郵' || h === '電郵地址' || h === 'e-mail'
  );
  const classIdx = headers.findIndex((h: string) =>
    h === 'class' || h === '班級' || h === 'classname' || h === 'classcode' || h === '班別'
  );
  const classNoIdx = headers.findIndex((h: string) =>
    h === 'classnumber' || h === '班號' || h === 'classno' || h === '學號'
  );
  const nameZhIdx = headers.findIndex((h: string) =>
    h === 'namezh' || h === '中文姓名' || h === 'chname' || h === '中文名' || h === '姓名'
  );
  const nameEnIdx = headers.findIndex((h: string) =>
    h === 'nameen' || h === '英文姓名' || h === 'enname' || h === '英文名'
  );
  const levelIdx = headers.findIndex((h: string) =>
    h === 'level' || h === '年級' || h === 'grade' || h === 'gradelevel'
  );

  if (emailIdx === -1) {
    throw new Error(`找不到「Email」欄位。可用欄位：${headers.join(', ')}`);
  }

  // 解析資料列
  const rows: SheetRow[] = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const email = (row[emailIdx] || '').trim().toLowerCase();
    if (!email) continue; // 跳過空白列

    rows.push({
      email,
      class: classIdx >= 0 ? (row[classIdx] || '').trim().toUpperCase() : '',
      classNumber: classNoIdx >= 0 ? (row[classNoIdx] || '').trim() : '',
      nameZh: nameZhIdx >= 0 ? (row[nameZhIdx] || '').trim() : '',
      nameEn: nameEnIdx >= 0 ? (row[nameEnIdx] || '').trim() : '',
      level: levelIdx >= 0 ? (row[levelIdx] || '').trim() : '',
    });
  }

  return { rows, sheetName: targetSheet };
}

// ============================================
// 推斷級別
// ============================================

function inferGradeLevel(className: string): string {
  const match = className.trim().match(/^(\d)/);
  if (match) return `S${match[1]}`;
  return 'S4';
}

// ============================================
  // POST Handler — 批量優化版（避免請求逾時）
// ============================================

export async function POST(request: NextRequest) {
  const result: SyncResult = {
    mode: 'live',
    sheetName: '',
    totalRows: 0,
    created: 0,
    updated: 0,
    classFixed: 0,
    unassigned: 0,
    skipped: 0,
    errors: [],
    details: [],
    classDistribution: {},
  };

  try {
    // 驗證管理員權限；另接受排程（cron）以 x-cron-secret 作 server-to-server 授權
    // （secret 只存在於伺服器 env，未設定 CRON_SECRET 時此路徑自動停用）
    const auth = await verifyAdmin(request);
    const cronSecret = request.headers.get('x-cron-secret');
    const cronAuthorized =
      !!process.env.CRON_SECRET && !!cronSecret && cronSecret === process.env.CRON_SECRET;
    if (!auth.authorized && !cronAuthorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    // Rate limiting: 3 sync operations per 60 seconds per IP
    const rateLimit = await checkRateLimit({
      maxRequests: 3,
      windowMs: 60_000,
      identifier: `sync-sheets:${request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'}`,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.message || '請求過於頻繁，請稍後重試' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      );
    }

    // 解析請求參數
    let dryRun = false;
    let sheetName: string | undefined;
    try {
      const body = await request.json().catch(() => ({}));
      dryRun = body.dryRun === true;
      sheetName = body.sheetName || undefined;
    } catch {
      // 無 body
    }

    result.mode = dryRun ? 'dryRun' : 'live';

    // 讀取 Google Sheet ID
    const spreadsheetId = process.env.GOOGLE_SHEETS_CLASS_ROSTER_ID;
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: '缺少環境變數 GOOGLE_SHEETS_CLASS_ROSTER_ID。請在 Cloud Run 環境變數中新增此變數，值為 Google Sheet 的 ID。/ Missing environment variable GOOGLE_SHEETS_CLASS_ROSTER_ID. Add it to the Cloud Run environment variables; its value is the Google Sheet ID.' },
        { status: 400 }
      );
    }

    // 從 Google Sheets 讀取資料
    logger.info({ module: 'sync-sheets', spreadsheetId }, 'Reading spreadsheet');
    const { rows, sheetName: actualSheetName } = await fetchSheetData(spreadsheetId, sheetName);
    result.sheetName = actualSheetName;
    result.totalRows = rows.length;

    logger.info({ module: 'sync-sheets', rowCount: rows.length, sheetName: actualSheetName }, 'Fetched rows from sheet');

    if (rows.length === 0) {
      return NextResponse.json({ ...result, message: 'Sheet 中沒有有效資料列 / No valid data rows found in the sheet' });
    }

    // === 批量查詢所有現有學生（1 次 DB 查詢取代 N 次）===
    const allEmails = rows.map(r => r.email);
    const existingUsers = await db.user.findMany({
      where: { email: { in: allEmails } },
      select: { id: true, email: true, nameZh: true, role: true, class: { select: { name: true } }, classNumber: true, level: true },
    });

    // 建立 email → user 的快速查找 Map
    const existingMap = new Map(existingUsers.map(u => [u.email.toLowerCase(), u]));

    // 計算所有需要的班級
    const uniqueClasses = [...new Set(rows.map(r => r.class).filter(Boolean))];

    // === 分析每筆資料（記憶體中比對，不查 DB）===
    const toCreate: SheetRow[] = [];
    const toUpdate: { row: SheetRow; oldClass: string }[] = [];

    for (const row of rows) {
      const existing = existingMap.get(row.email);
      if (!existing) {
        toCreate.push(row);
      } else {
        const oldClass = existing.class?.name || '';
        toUpdate.push({ row, oldClass });
      }
    }

    // === 預覽模式：直接回傳分析結果 ===
    if (dryRun) {
      // 快速計算預期的 class distribution
      const previewDist: Record<string, number> = {};
      for (const row of rows) {
        if (row.class) previewDist[row.class] = (previewDist[row.class] || 0) + 1;
      }

      for (const row of toCreate) {
        result.details.push({
          email: row.email, nameZh: row.nameZh,
          action: 'created', newClass: row.class || '(無)',
          reason: '新學生，將被建立',
        });
        result.created++;
      }
      for (const { row, oldClass } of toUpdate) {
        const newClass = row.class || oldClass;
        if (row.class && oldClass !== newClass) {
          result.details.push({
            email: row.email,
            nameZh: existingMap.get(row.email)?.nameZh || row.nameZh,
            action: 'class_fixed',
            oldClass: oldClass || '(無)', newClass,
            reason: `班別將從 ${oldClass || '(無)'} 修正為 ${newClass}`,
          });
          result.classFixed++;
        } else { result.updated++; }
      }
      result.classDistribution = previewDist;

      // 預覽：不在名單中的現有學生（畢業生/轉校生）將被解除班別（保留學習紀錄）
      result.unassigned = await db.user.count({
        where: {
          role: 'student',
          email: { notIn: allEmails, not: { endsWith: '@school.hk' } },
          class: { isNot: { name: 'Demo' } },
        },
      });

      return NextResponse.json(result);
    }

    // === 實際同步模式（以下只在 !dryRun 時執行）===

    // 快速建立 classMap：先查現有班級，只建立缺少的
    const existingClasses = await db.class.findMany({
      where: { name: { in: uniqueClasses } },
      select: { id: true, name: true },
    });
    const classMap = new Map(existingClasses.map(c => [c.name, c.id]));

    // 只建立不存在的班級 (use createMany for batch efficiency)
    const missingClasses = uniqueClasses.filter(c => !classMap.has(c));
    if (missingClasses.length > 0) {
      await db.class.createMany({
        data: missingClasses.map(className => ({
          name: className,
          gradeLevel: inferGradeLevel(className),
        })),
        skipDuplicates: true,
      });
      const newClasses = await db.class.findMany({
        where: { name: { in: missingClasses } },
        select: { id: true, name: true },
      });
      for (const c of newClasses) {
        classMap.set(c.name, c.id);
      }
    }

    // 批量建立新學生
    if (toCreate.length > 0) {
      try {
        await db.user.createMany({
          data: toCreate.map(row => ({
            email: row.email,
            nameZh: row.nameZh || row.email.split('@')[0],
            nameEn: row.nameEn || row.nameZh || undefined,
            role: 'student' as const,
            classId: row.class ? classMap.get(row.class) : undefined,
            classNumber: row.classNumber || undefined,
            level: row.level || (row.class ? inferGradeLevel(row.class) : undefined),
          })),
          skipDuplicates: true,
        });
        result.created = toCreate.length;
        logger.info({ module: 'sync-sheets', created: toCreate.length }, 'Created new students');
      } catch (err: unknown) {
        result.errors.push(`批量建立失敗: ${(err as Error).message}`);
      }
    }

    // 批量更新 — 使用 unnest 陣列，只用 6 個參數處理全部學生
    if (toUpdate.length > 0) {
      try {
        const emails: string[] = [];
        const cids: (string | null)[] = [];
        const cnos: (string | null)[] = [];
        const lvls: (string | null)[] = [];
        const nzhs: (string | null)[] = [];
        const nens: (string | null)[] = [];

        for (const { row } of toUpdate) {
          emails.push(row.email);
          cids.push(row.class ? (classMap.get(row.class) || null) : null);
          cnos.push(row.classNumber || null);
          lvls.push(row.level || (row.class ? inferGradeLevel(row.class) : null));
          nzhs.push(row.nameZh || null);
          nens.push(row.nameEn || null);
        }

        await db.$executeRawUnsafe(
          `UPDATE "User" SET
            "classId" = v.cid::text,
            "classNumber" = v.cno::text,
            "level" = v.lvl::text,
            "nameZh" = COALESCE(NULLIF(v.nzh::text, ''), "User"."nameZh"),
            "nameEn" = COALESCE(NULLIF(v.nen::text, ''), "User"."nameEn"),
            "updatedAt" = NOW()
          FROM (
            SELECT
              unnest($1::text[]) AS email,
              unnest($2::text[]) AS cid,
              unnest($3::text[]) AS cno,
              unnest($4::text[]) AS lvl,
              unnest($5::text[]) AS nzh,
              unnest($6::text[]) AS nen
          ) AS v
          WHERE "User".email = v.email::text AND "User".role = 'student'`,
          emails, cids, cnos, lvls, nzhs, nens
        );

        for (const { row, oldClass } of toUpdate) {
          if (row.class && oldClass !== row.class) result.classFixed++;
          else result.updated++;
        }
        logger.info({ module: 'sync-sheets', updated: toUpdate.length }, 'Bulk updated students');
      } catch (err: unknown) {
        result.errors.push(`批量更新失敗: ${(err as Error).message}`);
        logger.error({ module: 'sync-sheets', error: err instanceof Error ? err.message : String(err) }, 'Bulk update error');
      }
    }

    // === 解除不在名單中的學生班別（畢業生/轉校生；保留其學習紀錄）===
    try {
      const unassignedResult = await db.user.updateMany({
        where: {
          role: 'student',
          email: { notIn: allEmails, not: { endsWith: '@school.hk' } },
          class: { isNot: { name: 'Demo' } },
        },
        data: { classId: null, classNumber: null },
      });
      result.unassigned = unassignedResult.count;
      if (unassignedResult.count > 0) {
        logger.info({ module: 'sync-sheets', unassigned: unassignedResult.count }, 'Unassigned students not in roster');
      }
    } catch (err: unknown) {
      result.errors.push(`解除畢業生班別失敗: ${(err as Error).message}`);
      logger.error({ module: 'sync-sheets', error: err instanceof Error ? err.message : String(err) }, 'Unassign failed');
    }

    // 計算最終班別分布
    const distribution = await (db.user as any).groupBy({
      by: ['classId'],
      where: { role: 'student', classId: { not: null } },
      _count: true,
    });
    const allClasses = await db.class.findMany({ select: { id: true, name: true } });
    for (const d of distribution) {
      const cls = allClasses.find(c => c.id === d.classId);
      if (cls) result.classDistribution[cls.name] = d._count;
    }

    logger.info({ module: 'sync-sheets', created: result.created, updated: result.updated, classFixed: result.classFixed, unassigned: result.unassigned, errors: result.errors.length }, 'Sync complete');

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    logger.error({ module: 'sync-sheets', error: msg }, 'Sync sheets failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
