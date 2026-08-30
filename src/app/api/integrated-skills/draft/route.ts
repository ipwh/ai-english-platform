import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// API: /api/integrated-skills/draft — 儲存與載入 Integrated Skills 草稿
// GET:  載入草稿
// POST: 儲存草稿
// DELETE: 清除草稿
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/shared/logger/logger';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { upsertIntegratedSkillsDraft, deleteIntegratedSkillsDraft } from '@/modules/student';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;
  try {

    const draft = await adminDbQuery('integratedSkillsDraft', 'findUnique', {
      where: { userId },
      select: {
        studentNotes: true,
        studentWriting: true,
        taskData: true,
        stage: true,
        activeStep: true,
        listeningCompleted: true,
        updatedAt: true,
      },
    });

    if (!draft) {
      return NextResponse.json({ draft: null });
    }

    return NextResponse.json({
      draft: {
        ...draft,
        taskData: draft.taskData ? JSON.parse(draft.taskData) : null,
      },
    });
  } catch (err) {
    logger.error({ module: 'integrated-skills-draft', error: err instanceof Error ? err.message : String(err) }, 'Draft GET failed');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;
  try {

    const body = await request.json();
    const { studentNotes, studentWriting, taskData, stage, activeStep, listeningCompleted } = body;

    const draftData: Record<string, unknown> = {
      studentNotes: studentNotes !== undefined ? studentNotes : undefined,
      studentWriting: studentWriting !== undefined ? studentWriting : undefined,
      taskData: taskData !== undefined ? JSON.stringify(taskData) : undefined,
      stage: stage !== undefined ? stage : undefined,
      activeStep: activeStep !== undefined ? activeStep : undefined,
      listeningCompleted: listeningCompleted !== undefined ? listeningCompleted : undefined,
      updatedAt: new Date(),
    };
    const draft = await upsertIntegratedSkillsDraft(userId, draftData);

    return NextResponse.json({ success: true, updatedAt: draft.updatedAt });
  } catch (err) {
    logger.error({ module: 'integrated-skills-draft', error: err instanceof Error ? err.message : String(err) }, 'Draft POST failed');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;
  try {

    await deleteIntegratedSkillsDraft(userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ module: 'integrated-skills-draft', error: err instanceof Error ? err.message : String(err) }, 'Draft DELETE failed');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

