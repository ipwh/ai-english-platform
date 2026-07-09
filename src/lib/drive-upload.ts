// ============================================
// Google Drive 上傳工具
// 將 PDF/DOCX 報告上傳至平台共用雲端硬碟
// ============================================

import { GoogleAuth } from 'google-auth-library';

function getCredentials(): object {
  if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
  }
  // 本地開發用
  const fs = require('fs');
  const path = require('path');
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(process.cwd(), 'materials', 'gcp-service-account.json');
  if (fs.existsSync(credPath)) {
    return JSON.parse(fs.readFileSync(credPath, 'utf-8'));
  }
  throw new Error('找不到 GCP 憑證。請設定 GCP_SERVICE_ACCOUNT_JSON 環境變數。');
}

/** 上傳檔案到 Google Drive，回傳 webViewLink */
export async function uploadToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId?: string,
): Promise<{ id: string; webViewLink: string }> {
  const credentials = getCredentials();
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  // 建立 multipart 上傳
  const boundary = `----drive_upload_${Date.now()}`;
  const metadata = {
    name: fileName,
    mimeType,
    ...(folderId ? { parents: [folderId] } : {}),
  };

  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    'Content-Transfer-Encoding: base64',
    '',
    fileBuffer.toString('base64'),
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken.token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive 上傳失敗 (${res.status}): ${errText}`);
  }

  const data = await res.json() as { id: string; webViewLink: string };

  // 設定檔案權限為「知道連結的人可檢視」
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone',
    }),
  });

  return data;
}

/** 確保目標資料夾存在（在平台共用雲端硬碟下），回傳 folderId */
export async function ensureDriveFolder(
  folderName: string,
  parentFolderId?: string,
): Promise<string> {
  const credentials = getCredentials();
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  // 搜尋是否已存在同名資料夾
  let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  }

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken.token}` } },
  );

  if (searchRes.ok) {
    const searchData = await searchRes.json() as { files: { id: string }[] };
    if (searchData.files?.length > 0) {
      return searchData.files[0].id;
    }
  }

  // 建立新資料夾
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentFolderId ? { parents: [parentFolderId] } : {}),
    }),
  });

  if (!createRes.ok) {
    throw new Error(`無法建立 Drive 資料夾: ${await createRes.text()}`);
  }

  const createData = await createRes.json() as { id: string };
  return createData.id;
}
