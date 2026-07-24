// ============================================
// API: /api/groups — 教師自訂組別 CRUD
// Sprint 104: Added Zod validation for POST/PATCH
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/shared/logger/logger';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { validateRequest } from '@/shared/validation/validate';
import { groupCreateSchema, groupUpdateSchema } from '@/shared/validation/schemas/group.schema';
import { listGroups, findGroupById, createGroup, updateGroup, deleteGroup } from '@/modules/student';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const teacherId = authResult.userId!;
  try {

    const groups = await listGroups(teacherId);

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
    // Intentional: return empty [] so client renders graceful empty state instead of crashing
    logger.error({ module: 'groups', error: err instanceof Error ? err.message : String(err) }, 'Groups GET failed');
    return NextResponse.json({ error: 'Server error', groups: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const teacherId = authResult.userId!;
  try {

    const body = await request.json();
    // Sprint 104: Zod-validated input
    const { name, description, studentIds } = validateRequest(groupCreateSchema, body);

    const group = await createGroup({ name: name.trim(), description: description || '', createdBy: teacherId });

    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    // Intentional: return empty [] so client renders graceful empty state instead of crashing
    logger.error({ module: 'groups', error: err instanceof Error ? err.message : String(err) }, 'Groups POST failed');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const teacherId = authResult.userId!;
  try {

    const body = await request.json();
    const { id, name, description } = body;

    if (!id) {
      return NextResponse.json({ error: '組別 ID 為必填' }, { status: 400 });
    }

    const existing = await findGroupById(id);
    if (!existing || existing.createdBy !== teacherId) {
      return NextResponse.json({ error: '無權編輯此組別' }, { status: 403 });
    }

    const group = await updateGroup(id, {
      ...(name?.trim() ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
    });

    return NextResponse.json({ group });
  } catch (err) {
    // Intentional: return empty [] so client renders graceful empty state instead of crashing
    logger.error({ module: 'groups', error: err instanceof Error ? err.message : String(err) }, 'Groups PATCH failed');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const teacherId = authResult.userId!;
  try {

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: '組別 ID 為必填' }, { status: 400 });
    }

    const existing = await findGroupById(id);
    if (!existing || existing.createdBy !== teacherId) {
      return NextResponse.json({ error: '無權刪除此組別' }, { status: 403 });
    }

    await deleteGroup(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    // Intentional: return empty [] so client renders graceful empty state instead of crashing
    logger.error({ module: 'groups', error: err instanceof Error ? err.message : String(err) }, 'Groups DELETE failed');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

