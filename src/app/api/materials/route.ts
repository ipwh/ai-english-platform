import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// GET/POST /api/materials — 教材列表與上傳
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { config } from '@/shared/config/config';
import { logger } from '@/shared/logger/logger';
import { z } from 'zod';
import { listMaterialsFull, createMaterial, findMaterialById, updateMaterial, deleteMaterial, deleteMaterialChunks, countMaterials } from '@/modules/student';

// ============================================
// 上傳限制常數
// ============================================

const MAX_FILE_SIZE = config.upload.maxFileSize; // 10MB
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt'];
const MAX_CONTENT_LENGTH = config.upload.maxContentLength;

/** OCR a PDF via Google Cloud Vision — fallback when pdf-parse can't extract text */
async function extractTextFromPdfViaOcr(buffer: Buffer): Promise<string | null> {
  try {
    // Try using sharp to render the first page to an image, then OCR it
    const sharp = (await import('sharp')).default;
    const imageBuffer = await sharp(buffer, { page: 0, density: 150 })
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    // Use Google Cloud Vision API for text detection
    const { ImageAnnotatorClient } = await import('@google-cloud/vision');
    let client: import('@google-cloud/vision').ImageAnnotatorClient;

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      client = new ImageAnnotatorClient();
    } else if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
      const credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
      client = new ImageAnnotatorClient({ credentials });
    } else {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const keyPath = path.join(process.cwd(), 'materials', 'gcp-service-account.json');
        const keyContent = await fs.readFile(keyPath, 'utf-8');
        const credentials = JSON.parse(keyContent);
        client = new ImageAnnotatorClient({ credentials });
      } catch {
        logger.warn({ module: 'materials' }, 'No GCP credentials available for PDF OCR fallback');
        return null;
      }
    }

    const [result] = await client.textDetection({
      image: { content: imageBuffer.toString('base64') },
      imageContext: { languageHints: ['en', 'zh-Hant', 'zh-Hans'] },
    });

    const text = result.textAnnotations?.[0]?.description?.trim();
    if (text && text.length >= 10) {
      logger.info({ module: 'materials', textLength: text.length }, 'PDF OCR fallback succeeded');
      return text;
    }
    return null;
  } catch (e) {
    logger.warn({ module: 'materials', error: e instanceof Error ? e.message : String(e) }, 'PDF OCR fallback failed');
    return null;
  }
}

// ============================================
// JSON body Zod schema（POST/PATCH 共用）
// ============================================

const materialBodySchema = z.object({
  title: z.string().min(1, 'title 為必填').max(200),
  description: z.string().max(2000).optional().nullable(),
  type: z.enum(['pdf', 'docx', 'txt', 'text', 'image']).default('text'),
  gradeLevel: z.enum(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']).optional().nullable(),
  strand: z.enum(['interpersonal', 'knowledge', 'experience']).optional().nullable(),
  content: z.string().max(MAX_CONTENT_LENGTH).optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).optional().nullable(),
  fileSize: z.number().max(MAX_FILE_SIZE).optional().nullable(),
});

/** 伺服器端從 PDF/DOCX/TXT 檔案提取文字 */
async function extractTextFromFile(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (ext === 'pdf') {
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = (pdfParseModule as Record<string, unknown>).default || pdfParseModule;
      const data = await (pdfParse as (buf: Buffer) => Promise<{ text: string }>)(buffer);
      return data.text?.trim() || null;
    }
    if (ext === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value?.trim() || null;
    }
    if (ext === 'txt') {
      return await file.text();
    }
  } catch {
    // extraction failed, fall through to null
  }
  return null;
}

export async function GET(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const materials = await listMaterialsFull({
      where: { isSystem: false },
      select: {
        id: true, title: true, description: true,
        type: true, gradeLevel: true, strand: true, tags: true,
        ocrStatus: true, ragStatus: true, fileSize: true, createdAt: true,
        uploader: { select: { name: true, nameZh: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const formatted = materials.map(m => ({
      ...m,
      tags: m.tags ? JSON.parse(m.tags) : [],
    }));

    // ETag 支援：基於 createdAt 最大值生成 cache key
    const latestUpdate = materials.reduce((max, m) => {
      const t = m.createdAt ? new Date(m.createdAt).getTime() : 0;
      return t > max ? t : max;
    }, 0);
    const etag = `"materials-${latestUpdate}"`;

    return NextResponse.json(
      { materials: formatted },
      {
        headers: {
          'ETag': etag,
          'Cache-Control': 'public, max-age=30, must-revalidate',
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // 🔒 Auth check — only teachers/admins can upload
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;

  try {
    const contentType = request.headers.get('content-type') || '';

    // === 新：multipart file upload（PDF/DOCX/TXT 伺服器端文字提取）===
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: '未提供檔案 / No file provided' }, { status: 400 });
      }

      // 🔒 Body size validation：檢查檔案大小
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `檔案大小超過上限（${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB）/ File size exceeds the limit (${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB)` },
          { status: 413 }
        );
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || 'unknown';

      // 🔒 副檔名白名單檢查
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return NextResponse.json(
          { error: `不支援的檔案格式：.${ext}。支援格式：${ALLOWED_EXTENSIONS.join(', ')} / Unsupported file type: .${ext}. Supported: ${ALLOWED_EXTENSIONS.join(', ')}` },
          { status: 415 }
        );
      }

      let content = await extractTextFromFile(file);

      // OCR fallback for PDFs that fail text extraction (image-based/scanned PDFs)
      if ((!content || content.length < 10) && ext === 'pdf') {
        logger.info({ module: 'materials', fileName: file.name }, 'PDF text extraction failed, trying OCR fallback');
        const buffer = Buffer.from(await file.arrayBuffer());
        const ocrText = await extractTextFromPdfViaOcr(buffer);
        if (ocrText && ocrText.length >= 10) {
          content = ocrText;
        }
      }

      if (!content || content.length < 10) {
        return NextResponse.json(
          { error: `無法從 ${ext.toUpperCase()} 檔案提取文字。${ext === 'pdf' ? '請確認 PDF 為文字型（非掃描圖片），或稍後重試 OCR。' : ''} / Could not extract text from the ${ext.toUpperCase()} file.${ext === 'pdf' ? ' Make sure the PDF is text-based (not a scanned image), or retry OCR later.' : ''}` },
          { status: 422 }
        );
      }

      const material = await adminDbQuery('material', 'create', {
        data: {
          title: file.name,
          type: ext,
          content: content.slice(0, MAX_CONTENT_LENGTH),
          fileSize: file.size,
          uploadedBy: userId,
          ocrStatus: 'done',
          ragStatus: 'none',
        },
      });

      return NextResponse.json({ material }, { status: 201 });
    }

    // === JSON body（文字/圖片 OCR 結果）— Zod 驗證 ===
    const rawBody = await request.json();

    // 🔒 檢查 body 大小
    const bodyStr = JSON.stringify(rawBody);
    if (bodyStr.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `請求內容超過上限（${Math.round(MAX_CONTENT_LENGTH / 1024)}KB）/ Request content exceeds the limit (${Math.round(MAX_CONTENT_LENGTH / 1024)}KB)` },
        { status: 413 }
      );
    }

    const parsed = materialBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      return NextResponse.json({ error: '輸入驗證失敗 / Validation failed', details: errors }, { status: 400 });
    }

    const { title, description, type, gradeLevel, strand, content, tags, fileSize } = parsed.data;

    const material = await createMaterial({
      title,
      description: description || null,
      type: type || 'text',
      gradeLevel: gradeLevel || null,
      strand: strand || null,
      content: content || null,
      tags: tags ? JSON.stringify(tags) : null,
      fileSize: fileSize || null,
      uploadedBy: userId,
      ocrStatus: 'none',
      ragStatus: 'none',
    });
    // Note: createMaterial accepts MaterialUncheckedCreateInput — no relation required

    return NextResponse.json({ material }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ============================================
// PATCH /api/materials — 編輯教材標題/描述/標籤
// ============================================
export async function PATCH(request: NextRequest) {
  // 🔒 Auth check — only teachers/admins
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;

  try {
    const body = await request.json();
    const { id, title, description, tags, gradeLevel, strand } = body;

    if (!id) {
      return NextResponse.json({ error: 'Material ID is required' }, { status: 400 });
    }

    const existing = await findMaterialById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }
    if (authResult.role !== 'admin' && existing.uploadedBy && existing.uploadedBy !== userId) {
      return NextResponse.json({ error: 'Unauthorized — not the uploader' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (title?.trim()) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (tags !== undefined) updateData.tags = JSON.stringify(tags);
    if (gradeLevel) updateData.gradeLevel = gradeLevel;
    if (strand) updateData.strand = strand;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const material = await updateMaterial(id, updateData);
    return NextResponse.json({ material });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ============================================
// DELETE /api/materials — 刪除教材
// ============================================
export async function DELETE(request: NextRequest) {
  // 🔒 Auth check — only teachers/admins
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Material ID is required' }, { status: 400 });
    }

    const existing = await findMaterialById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }
    if (authResult.role !== 'admin' && existing.uploadedBy && existing.uploadedBy !== userId) {
      return NextResponse.json({ error: 'Unauthorized — not the uploader' }, { status: 403 });
    }

    // Clean up RAG chunks + the material itself
    const deletedChunks = await deleteMaterialChunks(id);
    await deleteMaterial(id);

    logger.info({ module: 'materials', materialId: id, deletedChunks: deletedChunks.count }, 'Material deleted');
    return NextResponse.json({ success: true, deletedChunks: deletedChunks.count });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
