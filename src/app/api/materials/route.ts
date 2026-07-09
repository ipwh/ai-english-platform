// ============================================
// GET/POST /api/materials — 教材列表與上傳
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/jwt';
import { auth } from '@/lib/auth-next';

export async function GET() {
  try {
    const materials = await db.material.findMany({
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
