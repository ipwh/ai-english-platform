// ============================================
// Google Sheets 自動同步工具
//
// 當在平台中新增班級或學生時，自動將資料寫入 Google Sheet，
// 保持 Google Sheet 與資料庫同步。
//
// Google Sheet 格式（第一個分頁 — 學生名單）：
//   Email | Class | ClassNumber | NameZh | NameEn | Level
//
// 環境變數：
//   GOOGLE_SHEETS_CLASS_ROSTER_ID — Google Sheet ID
//   GCP_SERVICE_ACCOUNT_JSON        — Service Account JSON
// ============================================

import { GoogleAuth } from 'google-auth-library';
import { logger } from '@/shared/logger/logger';

// ============================================
// 認證輔助
// ============================================

function getServiceAccountCredentials(): string {
  if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
    return process.env.GCP_SERVICE_ACCOUNT_JSON;
  }
  throw new Error('缺少 GCP 憑證。請設定 GCP_SERVICE_ACCOUNT_JSON 環境變數。');
}

async function getAccessToken(): Promise<string> {
  const credentials = JSON.parse(getServiceAccountCredentials());
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('無法取得 Google 訪問令牌');
  return token.token;
}

function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEETS_CLASS_ROSTER_ID;
  if (!id) throw new Error('缺少 GOOGLE_SHEETS_CLASS_ROSTER_ID 環境變數');
  return id;
}

// ============================================
// 取得或建立分頁
// ============================================

async function ensureSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  headers?: string[],
): Promise<void> {
  // 檢查分頁是否存在
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!metaRes.ok) {
    throw new Error(`無法讀取 Google Sheet 資訊 (${metaRes.status})`);
  }

  const meta = (await metaRes.json()) as { sheets: { properties: { title: string } }[] };
  const existingSheets = meta.sheets.map(s => s.properties.title);

  if (existingSheets.includes(sheetName)) return;

  // 建立新分頁
  const createRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      }),
    },
  );

  if (!createRes.ok) {
    throw new Error(`無法建立分頁「${sheetName}」(status ${createRes.status})`);
  }

  // 寫入標題列
  if (headers && headers.length > 0) {
    const range = encodeURIComponent(`'${sheetName}'!A1`);
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [headers] }),
      },
    );
  }
}

// ============================================
// 在分頁末尾附加一行
// ============================================

async function appendRow(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  row: string[],
): Promise<void> {
  const range = encodeURIComponent(`'${sheetName}'!A1`);

  // 先讀取現有資料以確認最後一列位置，避免覆蓋
  const dataRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  let nextRow = 1;
  if (dataRes.ok) {
    const data = (await dataRes.json()) as { values?: string[][] };
    nextRow = (data.values?.length ?? 0) + 1;
  }

  // 寫入新資料列
  const writeRange = encodeURIComponent(`'${sheetName}'!A${nextRow}`);
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
    },
  );
}

// ============================================
// 公開 API
// ============================================

/**
 * 新增班級時，同步至 Google Sheets 的「班級列表」分頁。
 * 此函式不回傳錯誤（fire-and-forget），失敗會記錄到 logger。
 */
export async function syncClassToSheet(
  className: string,
  gradeLevel: string,
  academicYear?: string,
): Promise<void> {
  try {
    const spreadsheetId = getSpreadsheetId();
    const accessToken = await getAccessToken();

    const sheetName = '班級列表';
    const headers = ['班級名稱', '年級', '學年', '建立時間'];

    await ensureSheet(accessToken, spreadsheetId, sheetName, headers);

    const now = new Date().toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' });
    await appendRow(accessToken, spreadsheetId, sheetName, [
      className,
      gradeLevel,
      academicYear || '2025-2026',
      now,
    ]);

    logger.info(
      { module: 'sheets-sync', className, gradeLevel },
      'Synced class to Google Sheets',
    );
  } catch (err: unknown) {
    logger.error(
      {
        module: 'sheets-sync',
        className,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to sync class to Google Sheets (non-critical)',
    );
  }
}

/**
 * 新增學生時，同步至 Google Sheets 學生名單（第一個分頁）。
 * 此函式不回傳錯誤（fire-and-forget），失敗會記錄到 logger。
 */
export async function syncStudentToSheet(params: {
  email: string;
  className: string;
  classNumber?: string;
  nameZh: string;
  nameEn?: string;
  level?: string;
}): Promise<void> {
  try {
    const spreadsheetId = getSpreadsheetId();
    const accessToken = await getAccessToken();

    // 學生名單使用第一個分頁（與 sync-sheets import 格式一致）
    const firstSheet = await getFirstSheetName(accessToken, spreadsheetId);
    await appendRow(accessToken, spreadsheetId, firstSheet, [
      params.email,
      params.className,
      params.classNumber || '',
      params.nameZh,
      params.nameEn || '',
      params.level || '',
    ]);

    logger.info(
      { module: 'sheets-sync', email: params.email, className: params.className },
      'Synced student to Google Sheets',
    );
  } catch (err: unknown) {
    logger.error(
      {
        module: 'sheets-sync',
        email: params.email,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to sync student to Google Sheets (non-critical)',
    );
  }
}

/**
 * 批量新增學生後，一次性將所有學生追加至 Google Sheets。
 * 此函式不回傳錯誤（fire-and-forget），失敗會記錄到 logger。
 */
export async function syncStudentsToSheet(
  students: {
    email: string;
    className: string;
    classNumber?: string;
    nameZh: string;
    nameEn?: string;
    level?: string;
  }[],
): Promise<void> {
  if (students.length === 0) return;

  try {
    const spreadsheetId = getSpreadsheetId();
    const accessToken = await getAccessToken();

    const firstSheet = await getFirstSheetName(accessToken, spreadsheetId);

    // 一次寫入多列（在現有資料之後附加）
    const range = encodeURIComponent(`'${firstSheet}'!A1`);
    const dataRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    let nextRow = 1;
    if (dataRes.ok) {
      const data = (await dataRes.json()) as { values?: string[][] };
      nextRow = (data.values?.length ?? 0) + 1;
    }

    const rows = students.map(s => [
      s.email,
      s.className,
      s.classNumber || '',
      s.nameZh,
      s.nameEn || '',
      s.level || '',
    ]);

    const writeRange = encodeURIComponent(`'${firstSheet}'!A${nextRow}`);
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: rows }),
      },
    );

    logger.info(
      { module: 'sheets-sync', count: students.length },
      'Batch synced students to Google Sheets',
    );
  } catch (err: unknown) {
    logger.error(
      {
        module: 'sheets-sync',
        count: students.length,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to batch sync students to Google Sheets (non-critical)',
    );
  }
}

/** 取得 Google Sheet 第一個分頁的名稱 */
async function getFirstSheetName(
  accessToken: string,
  spreadsheetId: string,
): Promise<string> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!metaRes.ok) {
    throw new Error(`無法讀取 Google Sheet 資訊 (${metaRes.status})`);
  }

  const meta = (await metaRes.json()) as { sheets: { properties: { title: string } }[] };
  if (meta.sheets.length === 0) {
    throw new Error('Google Sheet 中沒有任何分頁');
  }

  return meta.sheets[0].properties.title;
}
