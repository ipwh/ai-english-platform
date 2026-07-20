// ============================================
// POST /api/ocr/essay — OCR 作文上傳
// 使用 Google Cloud Vision API 辨識手寫/印刷文字
// 支援 JPG/PNG/WebP 圖片（最大 10MB）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/shared/auth/jwt';
import { logger } from '@/shared/logger/logger';
import { auth } from '@/shared/auth/auth-next';
import sharp from 'sharp';

// 延遲載入 Vision API（減少 cold start）
let visionClient: import('@google-cloud/vision').ImageAnnotatorClient | null = null;

async function getVisionClient(): Promise<import('@google-cloud/vision').ImageAnnotatorClient> {
  if (visionClient) return visionClient;

  const { ImageAnnotatorClient } = await import('@google-cloud/vision');

  // 方案 1: GOOGLE_APPLICATION_CREDENTIALS 環境變數（指向 JSON 檔案路徑）
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      visionClient = new ImageAnnotatorClient();
      return visionClient;
    } catch { /* 繼續嘗試其他方案 */ }
  }

  // 方案 2: GCP_SERVICE_ACCOUNT_JSON 環境變數（直接包含 JSON 內容，適用於 Vercel）
  if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
    try {
      const credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
      visionClient = new ImageAnnotatorClient({ credentials });
      return visionClient;
    } catch (e) {
      logger.error({ module: 'ocr', error: e instanceof Error ? e.message : String(e) }, 'Failed to parse GCP_SERVICE_ACCOUNT_JSON');
    }
  }

  // 方案 3: 從 materials/gcp-service-account.json 讀取（本機開發用）
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const keyPath = path.join(process.cwd(), 'materials', 'gcp-service-account.json');
    const keyContent = await fs.readFile(keyPath, 'utf-8');
    const credentials = JSON.parse(keyContent);
    visionClient = new ImageAnnotatorClient({ credentials });
    return visionClient;
  } catch {
    throw new Error(
      '無法載入 GCP 憑證。請在 Vercel 環境變數中設定 GCP_SERVICE_ACCOUNT_JSON（貼上完整的 service account JSON 內容）。'
    );
  }
}

/** 驗證使用者已登入（支援 JWT + NextAuth） */
async function authenticateUser(request: NextRequest): Promise<string | null> {
  // JWT token
  const token = request.cookies.get('session_token')?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) return payload.userId;
  }
  // NextAuth session
  const session = await auth();
  if (session?.user?.id) return session.user.id;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    // 認證
    const userId = await authenticateUser(request);
    if (!userId) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }

    // 解析上傳檔案
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '請上傳圖片檔案' }, { status: 400 });
    }

    // 驗證檔案類型與大小
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `不支援的檔案格式：${file.type}。請上傳 JPG、PNG、WebP 或 BMP 圖片。` },
        { status: 400 }
      );
    }

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `檔案大小 ${(file.size / 1024 / 1024).toFixed(1)}MB 超過上限 10MB。` },
        { status: 400 }
      );
    }

    // 讀取圖片並預處理
    let imageBuffer = Buffer.from(await file.arrayBuffer());

    // 使用 sharp 壓縮/最佳化圖片（減少 Vision API 成本）
    try {
      imageBuffer = await sharp(imageBuffer)
        .resize({ width: 1600, withoutEnlargement: true }) // 限制寬度
        .jpeg({ quality: 85 }) // 轉 JPEG
        .toBuffer();
    } catch {
      // 若 sharp 無法處理（罕見格式），使用原始圖片
      console.warn('[ocr] sharp preprocessing failed, using original image');
    }

    // 呼叫 Google Cloud Vision API
    const client = await getVisionClient();
    const [result] = await client.textDetection({
      image: { content: imageBuffer.toString('base64') },
      imageContext: {
        languageHints: ['en', 'zh-Hant', 'zh-Hans'],
      },
    });

    const annotations = result.textAnnotations;
    if (!annotations || annotations.length === 0) {
      return NextResponse.json({
        text: '',
        warning: '圖片中未偵測到文字。請確認圖片清晰且包含文字內容。',
      });
    }

    // 第一筆為整頁文字（包含換行）
    const fullText = annotations[0].description || '';

    return NextResponse.json({
      text: fullText,
      confidence: annotations[0].confidence || undefined,
      wordCount: fullText.split(/\s+/).filter(Boolean).length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'OCR 處理失敗';
    logger.error({ module: 'ocr-essay', error: msg }, 'OCR essay failed');

    // 偵測常見錯誤
    if (msg.includes('Could not load the default credentials')) {
      return NextResponse.json(
        { error: 'GCP 憑證未設定。請在 Vercel 環境變數中設定 GOOGLE_APPLICATION_CREDENTIALS。' },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
