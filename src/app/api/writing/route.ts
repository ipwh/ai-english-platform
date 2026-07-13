// ============================================
// GET/POST/PATCH /api/writing — 寫作草稿 CRUD
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/jwt';
import { auth } from '@/lib/auth-next';

async function getUserId(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get('session_token')?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) return payload.userId;
  }
  const session = await auth();
  if (session?.user?.id) return session.user.id;
  return null;
}

// GET — 取得學生的寫作草稿列表
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;

    const drafts = await db.writingDraft.findMany({
      where: {
        studentId: userId,
        ...(status ? { status } : {}),
      },
      select: {
        id: true,
        title: true,
        prompt: true,
        draft: true,
        revisedVersion: true,
        status: true,
        aiSuggestions: true,
        chinglishWarnings: true,
        teacherComment: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ drafts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — 建立新的寫作草稿
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { title, prompt, draft, aiSuggestions, chinglishWarnings } = body;

    if (!title) {
      return NextResponse.json({ error: 'title 為必填' }, { status: 400 });
    }

    const writingDraft = await db.writingDraft.create({
      data: {
        studentId: userId,
        title,
        prompt: prompt || '',
        draft: draft || '',
        aiSuggestions: aiSuggestions ? JSON.stringify(aiSuggestions) : null,
        chinglishWarnings: chinglishWarnings ? JSON.stringify(chinglishWarnings) : null,
        status: 'draft',
      },
    });

    return NextResponse.json({ draft: writingDraft }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH — 更新寫作草稿（自動 upsert + 版本歷史）
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

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
      const existing = await db.writingDraft.findUnique({ where: { id, studentId: userId }, select: { revisions: true, draft: true } });
      if (revisedVersion !== undefined && existing) {
        data.revisions = appendRevision(existing.revisions);
      }
      const updated = await db.writingDraft.update({
        where: { id, studentId: userId },
        data,
      });
      return NextResponse.json({ draft: updated });
    }

    // Upsert: find most recent draft for this student, or create new
    const existing = await db.writingDraft.findFirst({
      where: { studentId: userId },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      if (revisedVersion !== undefined) {
        data.revisions = appendRevision(existing.revisions);
      }
      const updated = await db.writingDraft.update({
        where: { id: existing.id },
        data,
      });
      return NextResponse.json({ draft: updated });
    }

    // Create new draft
    const created = await db.writingDraft.create({
      data: {
        studentId: userId,
        title: title || 'Untitled Draft',
        prompt: '',
        draft: draft || '',
        aiSuggestions: aiSuggestions ? JSON.stringify(aiSuggestions) : null,
        chinglishWarnings: chinglishWarnings ? JSON.stringify(chinglishWarnings) : null,
        status: 'draft',
        ...data,
      },
    });
    return NextResponse.json({ draft: created }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    console.error('[writing PATCH]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
