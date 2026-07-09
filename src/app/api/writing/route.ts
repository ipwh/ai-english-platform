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
        status: true,
        aiSuggestions: true,
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

// PATCH — 更新寫作草稿（儲存新版本、送出覆核等）
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { id, draft, revisedVersion, aiSuggestions, chinglishWarnings, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'id 為必填' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (draft !== undefined) data.draft = draft;
    if (revisedVersion !== undefined) data.revisedVersion = revisedVersion;
    if (aiSuggestions !== undefined) data.aiSuggestions = JSON.stringify(aiSuggestions);
    if (chinglishWarnings !== undefined) data.chinglishWarnings = JSON.stringify(chinglishWarnings);
    if (status !== undefined) data.status = status;

    const updated = await db.writingDraft.update({
      where: { id, studentId: userId },
      data,
    });

    return NextResponse.json({ draft: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
