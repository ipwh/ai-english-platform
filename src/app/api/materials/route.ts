// ============================================
// GET/POST /api/materials — 教材列表與上傳
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/jwt';
import { auth } from '@/lib/auth-next';

/** 伺服器端從 PDF/DOCX/TXT 檔案提取文字 */
async function extractTextFromFile(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (ext === 'pdf') {
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = (pdfParseModule as any).default || pdfParseModule;
      const data = await pdfParse(buffer);
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

export async function GET() {
  try {
    const materials = await db.material.findMany({
      where: {
        isSystem: false,
      },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        gradeLevel: true,
        strand: true,
        tags: true,
        ocrStatus: true,
        ragStatus: true,
        fileSize: true,
        createdAt: true,
        uploader: { select: { name: true, nameZh: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const formatted = materials.map(m => ({
      ...m,
      tags: m.tags ? JSON.parse(m.tags) : [],
    }));

    return NextResponse.json({ materials: formatted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // 取得真實 userId：先查 JWT，再查 NextAuth
    let userId = 'system';
    const jwtToken = request.cookies.get('session_token')?.value;
    if (jwtToken) {
      const payload = await verifySessionToken(jwtToken);
      if (payload) userId = payload.userId;
    }
    if (userId === 'system') {
      const session = await auth();
      if (session?.user?.id) userId = session.user.id;
    }

    const contentType = request.headers.get('content-type') || '';

    // === 新：multipart file upload（PDF/DOCX/TXT 伺服器端文字提取）===
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: '未提供檔案' }, { status: 400 });
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || 'unknown';
      const content = await extractTextFromFile(file);

      if (!content || content.length < 10) {
        return NextResponse.json(
          { error: `無法從 ${ext.toUpperCase()} 檔案提取文字，請確認檔案是否為文字型 PDF 或嘗試使用 OCR。` },
          { status: 422 }
        );
      }

      const material = await db.material.create({
        data: {
          title: file.name,
          type: ext,
          content: content.slice(0, 100000),
          fileSize: file.size,
          uploadedBy: userId,
          ocrStatus: 'done',
          ragStatus: 'none',
        },
      });

      return NextResponse.json({ material }, { status: 201 });
    }

    // === 現有：JSON body（文字/圖片 OCR 結果）===
    const body = await request.json();
    const { title, description, type, gradeLevel, strand, content, tags, fileSize } = body;

    if (!title) {
      return NextResponse.json({ error: 'title 為必填' }, { status: 400 });
    }

    const material = await db.material.create({
      data: {
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
      },
    });

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
  try {
    let userId = 'system';
    const jwtToken = request.cookies.get('session_token')?.value;
    if (jwtToken) {
      const payload = await verifySessionToken(jwtToken);
      if (payload) userId = payload.userId;
    }
    if (userId === 'system') {
      const session = await auth();
      if (session?.user?.id) userId = session.user.id;
    }

    const body = await request.json();
    const { id, title, description, tags, gradeLevel, strand } = body;

    if (!id) {
      return NextResponse.json({ error: 'Material ID is required' }, { status: 400 });
    }

    // Auth: only allow teachers/admins or the original uploader
    const existing = await db.material.findUnique({ where: { id }, select: { uploadedBy: true } });
    if (!existing) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }
    if (userId === 'system' || (existing.uploadedBy && existing.uploadedBy !== userId)) {
      // Fall back to role check via JWT
      const jwtToken = request.cookies.get('session_token')?.value;
      if (jwtToken) {
        const payload = await verifySessionToken(jwtToken);
        if (!payload || (payload.role !== 'teacher' && payload.role !== 'admin')) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
      } else {
        const session = await auth();
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
      }
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

    const material = await db.material.update({ where: { id }, data: updateData });
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
  try {
    let userId = 'system';
    const jwtToken = request.cookies.get('session_token')?.value;
    if (jwtToken) {
      const payload = await verifySessionToken(jwtToken);
      if (payload) userId = payload.userId;
    }
    if (userId === 'system') {
      const session = await auth();
      if (session?.user?.id) userId = session.user.id;
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Material ID is required' }, { status: 400 });
    }

    // Auth check: require teacher/admin
    const existing = await db.material.findUnique({ where: { id }, select: { uploadedBy: true } });
    if (!existing) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }
    if (userId === 'system') {
      const jwtToken = request.cookies.get('session_token')?.value;
      if (jwtToken) {
        const payload = await verifySessionToken(jwtToken);
        if (!payload || (payload.role !== 'teacher' && payload.role !== 'admin')) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
      } else {
        const session = await auth();
        if (!session?.user?.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
      }
    }

    // Clean up RAG chunks + the material itself
    const deletedChunks = await db.materialChunk.deleteMany({ where: { materialId: id } });
    await db.material.delete({ where: { id } });

    console.log(`[Materials] Deleted material ${id} with ${deletedChunks.count} RAG chunks`);
    return NextResponse.json({ success: true, deletedChunks: deletedChunks.count });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
