// ============================================
// GET/POST/PATCH /api/writing — 寫作草稿 CRUD
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import {
  listDrafts,
  createDraft,
  findDraftById,
  updateDraft,
  findDraftWithRevisions,
  findLatestDraft,
} from '@/modules/student';

// GET — 取得學生的寫作草稿列表
export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;
  try {

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;

    const drafts = await listDrafts(userId, status);

    return NextResponse.json({ drafts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — 建立新的寫作草稿
export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;
  try {

    const body = await request.json();
    const { title, prompt, draft, aiSuggestions, chinglishWarnings } = body;

    if (!title) {
      return NextResponse.json({ error: 'title 為必填' }, { status: 400 });
    }

    const writingDraft = await createDraft({
      studentId: userId,
      title,
      prompt: prompt || '',
      draft: draft || '',
      aiSuggestions,
      chinglishWarnings,
    });

    return NextResponse.json({ draft: writingDraft }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH — 更新寫作草稿（自動 upsert + 版本歷史）
export async function PATCH(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;
  try {

    const body = await request.json();
    const { id, draft, revisedVersion, aiSuggestions, chinglishWarnings, status, title } = body;

    const data: Record<string, unknown> = {};
    if (draft !== undefined) data.draft = draft;
    if (aiSuggestions !== undefined) data.aiSuggestions = JSON.stringify(aiSuggestions);
    if (chinglishWarnings !== undefined) data.chinglishWarnings = JSON.stringify(chinglishWarnings);
    if (status !== undefined) data.status = status;

    // Version history: append to revisions when revisedVersion is provided
    if (revisedVersion !== undefined) {
      data.revisedVersion = revisedVersion;
    }

    // Helper: append revision entry to existing revisions array
    const appendRevision = (existingRevisions: string | null): string => {
      const prev = existingRevisions ? JSON.parse(existingRevisions) : [];
      prev.push({
        draft: draft || '',
        revisedVersion: revisedVersion || '',
        aiSuggestions: aiSuggestions || null,
        createdAt: new Date().toISOString(),
      });
      // Keep last 10 versions max
      return JSON.stringify(prev.slice(-10));
    };

    // If id is provided and is a real UUID, update that specific draft
    if (id && id !== 'current' && /^[a-zA-Z0-9_-]{10,}$/.test(id)) {
      const existing = await findDraftWithRevisions(id);
      if (!existing || existing.studentId !== userId) {
        return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
      }
      if (revisedVersion !== undefined && existing) {
        data.revisions = appendRevision(existing.revisions);
      }
      const updated = await updateDraft(id, data);
      return NextResponse.json({ draft: updated });
    }

    // Upsert: find most recent draft for this student, or create new
    const existing = await findLatestDraft(userId);

    if (existing) {
      if (revisedVersion !== undefined) {
        data.revisions = appendRevision(existing.revisions);
      }
      const updated = await updateDraft(existing.id, data);
      return NextResponse.json({ draft: updated });
    }

    // Create new draft
    const created = await createDraft({
      studentId: userId,
      title: title || 'Untitled Draft',
      draft: draft || '',
      aiSuggestions,
      chinglishWarnings,
    });
    return NextResponse.json({ draft: created }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    logger.error({ module: 'writing', error: msg }, 'Writing PATCH failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
