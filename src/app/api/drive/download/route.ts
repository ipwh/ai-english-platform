// ============================================
// API: /api/drive/download — 從 Google Drive 下載教材
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  'c:\\Users\\TC-37\\OneDrive - PO CHIU CATHOLIC SECONDARY SCHOOL\\AI\\歷史科改卷助手\\gcp-service-account.json';

let auth: GoogleAuth | null = null;
function getAuth(): GoogleAuth {
  if (!auth) {
    auth = new GoogleAuth({
      keyFile: SERVICE_ACCOUNT_KEY,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
  }
  return auth;
}

/** 從 Google Drive 分享連結提取 file ID */
function extractFileId(url: string): string | null {
  const patterns = [
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url) return NextResponse.json({ error: '請提供 Google Drive 連結' }, { status: 400 });

    const fileId = extractFileId(url);
    if (!fileId) return NextResponse.json({ error: '無效的 Google Drive 連結格式' }, { status: 400 });

    const client = getAuth();
    const token = await client.getAccessToken();

    // 取得檔案 metadata
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!metaRes.ok) {
      const err = await metaRes.text();
      return NextResponse.json({ error: `無法存取檔案 (${metaRes.status})。請確認已分享給服務帳號。` }, { status: 403 });
    }

    const meta = await metaRes.json();

    // 下載支援的文字格式
    const isText = ['text/plain', 'text/csv', 'application/pdf'].includes(meta.mimeType) ||
      meta.name.endsWith('.txt') || meta.name.endsWith('.csv') || meta.name.endsWith('.md');

    if (!isText) {
      return NextResponse.json({
        error: `不支援的檔案類型：${meta.mimeType}。請使用 .txt、.csv、.md 或 PDF 檔案。`,
        meta,
      }, { status: 400 });
    }

    // 下載檔案內容
    const downloadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!downloadRes.ok) {
      return NextResponse.json({ error: `下載失敗 (${downloadRes.status})` }, { status: 500 });
    }

    let content: string;
    if (meta.mimeType === 'application/pdf') {
      // PDF 需透過 OCR（可在此整合 Google Cloud Vision）
      content = `[PDF 檔案: ${meta.name}] — 請使用 OCR 功能提取文字`;
    } else {
      content = await downloadRes.text();
    }

    return NextResponse.json({
      success: true,
      file: {
        name: meta.name,
        mimeType: meta.mimeType,
        size: meta.size,
        content: content.slice(0, 10000), // 限制大小
        contentLength: content.length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '下載失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
