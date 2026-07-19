// ============================================
// API: /api/groups — 教師自訂組別 CRUD
// GET:   列出教師建立的組別（含成員人數）
// POST:  建立新組別
// PATCH: 編輯組別名稱/描述
// DELETE: 刪除組別
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifySessionToken } from '@/shared/auth/jwt';
import { validateRequest, groupCreateSchemaApi, groupUpdateSchemaApi } from '@/shared/validation/schemas';
import { logger } from '@/shared/logger/logger';

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
    logger.error({ module: 'groups', error: (err as Error).message }, 'GET failed');
    return NextResponse.json({ error: 'Server error', groups: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const teacherId = await getTeacherId(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 🔒 Zod validation
    const body = await request.json();
    const parsed = validateRequest(groupCreateSchemaApi, body);
    const { name, description, studentIds } = parsed;

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
    logger.error({ module: 'groups', error: (err as Error).message }, 'POST failed');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const teacherId = await getTeacherId(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 🔒 Zod validation
    const body = await request.json();
    const parsed = validateRequest(groupUpdateSchemaApi, body);
    const { id, name, description } = parsed;

    // 驗證所有權
    const existing = await db.group.findUnique({ where: { id }, select: { createdBy: true } });
    if (!existing || existing.createdBy !== teacherId) {
      return NextResponse.json({ error: '無權編輯此組別' }, { status: 403 });
    }

    const group = await db.group.update({
      where: { id },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
      },
    });

    return NextResponse.json({ group });
  } catch (err) {
    logger.error({ module: 'groups', error: (err as Error).message }, 'PATCH failed');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const teacherId = await getTeacherId(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: '組別 ID 為必填' }, { status: 400 });
    }

    // 驗證所有權
    const existing = await db.group.findUnique({ where: { id }, select: { createdBy: true } });
    if (!existing || existing.createdBy !== teacherId) {
      return NextResponse.json({ error: '無權刪除此組別' }, { status: 403 });
    }

    // 先移除關聯的 assignments，再刪除 group
    await db.assignmentGroup.deleteMany({ where: { groupId: id } });
    await db.groupMember.deleteMany({ where: { groupId: id } });
    await db.group.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ module: 'groups', error: (err as Error).message }, 'DELETE failed');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
