// ============================================
// POST /api/admin/export-sheets — 匯出統計數據到 Google Sheets
//
// 將全校學習統計（各班平均分、常見錯誤等）寫入指定的 Google Sheet，
// 方便科主任無需登入平台即可查看。
//
// 請求參數：
//   { sheetName?: string } — 指定寫入哪個分頁（預設 "Dashboard"）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAdmin } from '@/lib/admin-auth';
import { GoogleAuth } from 'google-auth-library';

function getServiceAccountCredentials(): string {
  if (process.env.GCP_SERVICE_ACCOUNT_JSON) return process.env.GCP_SERVICE_ACCOUNT_JSON;
  throw new Error('缺少 GCP 憑證。請設定 GCP_SERVICE_ACCOUNT_JSON 環境變數。');
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const spreadsheetId = process.env.GOOGLE_SHEETS_CLASS_ROSTER_ID;
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: '缺少 GOOGLE_SHEETS_CLASS_ROSTER_ID 環境變數' },
        { status: 400 },
      );
    }

    let sheetName = 'Dashboard';
    try {
      const body = await request.json().catch(() => ({}));
      if (body.sheetName) sheetName = body.sheetName;
    } catch { /* default */ }

    // === 收集統計數據 ===

    // 1. 各班平均準確率
    const classStats = await db.user.groupBy({
      by: ['classId'],
      where: { role: 'student', classId: { not: null }, overallAccuracy: { not: null } },
      _avg: { overallAccuracy: true },
      _count: true,
    });

    const allClasses = await db.class.findMany({ select: { id: true, name: true } });
    const classMap = new Map(allClasses.map(c => [c.id, c.name]));

    // 2. 各年級統計
    const levelStats = await db.user.groupBy({
      by: ['level'],
      where: { role: 'student', level: { not: null }, overallAccuracy: { not: null } },
      _avg: { overallAccuracy: true },
      _count: true,
    });

    // 3. 最近練習活躍度（過去 30 天的 submissions）
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentSubmissions = await db.submission.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    });

    // 4. 總學生數
    const totalStudents = await db.user.count({ where: { role: 'student' } });

    // === 認證並寫入 Google Sheets ===
    const credentials = JSON.parse(getServiceAccountCredentials());
    const googleAuth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await googleAuth.getClient();
    const accessToken = await client.getAccessToken();

    // 確保 Dashboard 分頁存在
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      { headers: { Authorization: `Bearer ${accessToken.token}` } },
    );
    const meta = await metaRes.json() as { sheets: { properties: { title: string } }[] };
    const existingSheets = meta.sheets.map(s => s.properties.title);

    if (!existingSheets.includes(sheetName)) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [{ addSheet: { properties: { title: sheetName } } }],
          }),
        },
      );
    }

    // 建立數據
    const now = new Date().toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' });
    const rows = [
      [`=== AI English Platform 學習數據儀表板 ===`],
      [`更新時間：${now}`],
      [''],
      ['【基本數據】'],
      ['總學生數', String(totalStudents)],
      ['30 天內練習次數', String(recentSubmissions)],
      [''],
      ['【各年級平均準確率】'],
      ['年級', '平均準確率 (%)', '學生數'],
      ...levelStats
        .filter(l => l.level)
        .sort((a, b) => (a.level || '').localeCompare(b.level || ''))
        .map(l => [
          l.level || '',
          l._avg.overallAccuracy ? String(Math.round(l._avg.overallAccuracy)) : '-',
          String(l._count),
        ]),
      [''],
      ['【各班平均準確率】'],
      ['班級', '平均準確率 (%)', '學生數'],
      ...classStats
        .map(c => ({
          name: classMap.get(c.classId || '') || 'Unknown',
          accuracy: c._avg.overallAccuracy,
          count: c._count,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => [
          c.name,
          c.accuracy ? String(Math.round(c.accuracy)) : '-',
          String(c.count),
        ]),
    ];

    // 清除舊數據並寫入新數據
    const range = encodeURIComponent(`'${sheetName}'!A1`);
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken.token}` },
      },
    );

    // 寫入新數據
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: rows }),
      },
    );

    return NextResponse.json({
      success: true,
      sheetName,
      updatedAt: now,
      stats: {
        totalStudents,
        recentSubmissions,
        levelsReported: levelStats.length,
        classesReported: classStats.length,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    console.error('[export-sheets] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
