// ============================================
// API: /api/groups — 教師自訂組別 CRUD
// GET:  列出教師建立的組別（含成員人數）
// POST: 建立新組別
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifySessionToken } from '@/lib/jwt';

async function getTeacherId(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get('session_token')?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload && (payload.role === 'teacher' || payload.role === 'admin')) {
      return payload.userId;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const teacherId = await getTeacherId(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const groups = await db.group.findMany({
      where: { createdBy: teacherId },
      include: {
        _count: { select: { members: true, assignments: true } },
        members: {
          include: {
            student: {
              select: { id: true, name: true, nameZh: true, email: true, class: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      groups: groups.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        memberCount: g._count.members,
        assignmentCount: g._count.assignments,
        members: g.members.map(m => ({
          id: m.student.id,
          name: m.student.nameZh || m.student.name || m.student.email,
          className: m.student.class?.name || '',
          joinedAt: m.joinedAt.toISOString(),
        })),
      })),
    });
  } catch (err) {
    console.error('[groups GET]', err);
    return NextResponse.json({ error: 'Server error', groups: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const teacherId = await getTeacherId(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, studentIds } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: '組別名稱為必填' }, { status: 400 });
    }

    const group = await db.group.create({
      data: {
        name: name.trim(),
        description: description || null,
        createdBy: teacherId,
        ...(studentIds?.length ? {
          members: {
            create: studentIds.map((sid: string) => ({ studentId: sid })),
          },
        } : {}),
      },
      include: { _count: { select: { members: true } } },
    });

    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    console.error('[groups POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
