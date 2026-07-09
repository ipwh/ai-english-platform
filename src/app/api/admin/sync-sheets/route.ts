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
import { db } from '@/lib/db';
import { verifyAdmin } from '@/lib/admin-auth';
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
  // 優先使用環境變數中的 JSON 內容（Vercel 部署用）
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
// POST Handler
// ============================================

export async function POST(request: NextRequest) {
  const result: SyncResult = {
    mode: 'live',
    sheetName: '',
    totalRows: 0,
    created: 0,
    updated: 0,
    classFixed: 0,
    skipped: 0,
    errors: [],
    details: [],
    classDistribution: {},
  };

  try {
    // 驗證管理員權限
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
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
        { error: '缺少環境變數 GOOGLE_SHEETS_CLASS_ROSTER_ID。請在 Vercel 設定中新增此變數，值為 Google Sheet 的 ID。' },
        { status: 400 }
      );
    }

    // 從 Google Sheets 讀取資料
    console.log(`[sync-sheets] Reading spreadsheet ${spreadsheetId}...`);
    const { rows, sheetName: actualSheetName } = await fetchSheetData(spreadsheetId, sheetName);
    result.sheetName = actualSheetName;
    result.totalRows = rows.length;

    console.log(`[sync-sheets] Fetched ${rows.length} rows from sheet "${actualSheetName}"`);

    if (rows.length === 0) {
      return NextResponse.json({ ...result, message: 'Sheet 中沒有有效資料列' });
    }

    // 預覽模式：只回傳將要做的變更
    if (dryRun) {
      for (const row of rows) {
        const existing = await db.user.findUnique({
          where: { email: row.email },
          select: { id: true, nameZh: true, class: { select: { name: true } }, classNumber: true, level: true },
        });

        if (!existing) {
          result.details.push({
            email: row.email,
            nameZh: row.nameZh,
            action: 'created',
            newClass: row.class || '(無)',
            reason: '新學生，將被建立',
          });
          result.created++;
        } else {
          const oldClass = existing.class?.name || '(無)';
          const newClass = row.class || oldClass;
          if (row.class && oldClass !== newClass) {
            result.details.push({
              email: row.email,
              nameZh: existing.nameZh || row.nameZh,
              action: 'class_fixed',
              oldClass,
              newClass,
              reason: `班別將從 ${oldClass} 修正為 ${newClass}`,
            });
            result.classFixed++;
          } else {
            result.details.push({
              email: row.email,
              nameZh: existing.nameZh || row.nameZh,
              action: 'updated',
              oldClass,
              newClass,
              reason: '資料將被更新',
            });
            result.updated++;
          }
        }
      }

      // 預覽模式也顯示預計的班別分布
      const previewDist: Record<string, number> = {};
      for (const row of rows) {
        if (row.class) {
          previewDist[row.class] = (previewDist[row.class] || 0) + 1;
        }
      }
      result.classDistribution = previewDist;

      return NextResponse.json(result);
    }

    // === 實際同步模式 ===

    // 先確保所有需要的班級存在
    const uniqueClasses = [...new Set(rows.map(r => r.class).filter(Boolean))];
    const classMap = new Map<string, string>(); // className → classId
    for (const className of uniqueClasses) {
      const cls = await db.class.upsert({
        where: { name: className },
        update: {},
        create: {
          name: className,
          gradeLevel: inferGradeLevel(className),
        },
      });
      classMap.set(className, cls.id);
    }

    // 逐筆同步學生資料
    for (const row of rows) {
      try {
        const classId = row.class ? classMap.get(row.class) : undefined;
        const level = row.level || (row.class ? inferGradeLevel(row.class) : undefined);

        const existing = await db.user.findUnique({
          where: { email: row.email },
          select: { id: true, nameZh: true, class: { select: { name: true } }, role: true },
        });

        if (!existing) {
          // 新學生：自動建立
          await db.user.create({
            data: {
              email: row.email,
              nameZh: row.nameZh || row.email.split('@')[0],
              nameEn: row.nameEn || row.nameZh || undefined,
              role: 'student',
              classId: classId || undefined,
              classNumber: row.classNumber || undefined,
              level: level || undefined,
            },
          });
          result.created++;
          result.details.push({
            email: row.email,
            nameZh: row.nameZh,
            action: 'created',
            newClass: row.class || '(無)',
          });
        } else {
          // 現有學生：強制更新班別（Sheets 是真相來源）
          const oldClass = existing.class?.name || '(無)';
          const isClassChanged = row.class && oldClass !== row.class;

          await db.user.update({
            where: { email: row.email },
            data: {
              nameZh: row.nameZh || existing.nameZh || undefined,
              nameEn: row.nameEn || undefined,
              classId: classId || undefined,  // 若 Sheets 中 class 為空，則清除班別
              classNumber: row.classNumber || undefined,
              level: level || undefined,
              role: existing.role, // 保留原有角色（不把老師降級為學生）
            },
          });

          if (isClassChanged) {
            result.classFixed++;
            result.details.push({
              email: row.email,
              nameZh: existing.nameZh || row.nameZh,
              action: 'class_fixed',
              oldClass,
              newClass: row.class,
              reason: `班別已從 ${oldClass} 修正為 ${row.class}`,
            });
          } else {
            result.updated++;
            result.details.push({
              email: row.email,
              nameZh: existing.nameZh || row.nameZh,
              action: 'updated',
              oldClass,
              newClass: row.class || oldClass,
              reason: '資料已更新',
            });
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '未知錯誤';
        result.errors.push(`${row.email}: ${msg}`);
        result.details.push({
          email: row.email,
          nameZh: row.nameZh,
          action: 'error',
          reason: msg,
        });
      }
    }

    // 計算最終班別分布
    const distribution = await db.user.groupBy({
      by: ['classId'],
      where: { role: 'student', classId: { not: null } },
      _count: true,
    });
    const allClasses = await db.class.findMany({ select: { id: true, name: true } });
    for (const d of distribution) {
      const cls = allClasses.find(c => c.id === d.classId);
      if (cls) result.classDistribution[cls.name] = d._count;
    }

    console.log(`[sync-sheets] Done: created=${result.created}, updated=${result.updated}, classFixed=${result.classFixed}, errors=${result.errors.length}`);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    console.error('[sync-sheets] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
