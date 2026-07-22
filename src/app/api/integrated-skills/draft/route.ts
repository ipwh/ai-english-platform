// ============================================
// API: /api/integrated-skills/draft — 儲存與載入 Integrated Skills 草稿
// GET:  載入草稿
// POST: 儲存草稿
// DELETE: 清除草稿
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { logger } from '@/shared/logger/logger';
import { verifyApiAuth } from '@/shared/auth/api-auth';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;
  try {

    const draft = await db.integratedSkillsDraft.findUnique({
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
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { studentNotes, studentWriting, taskData, stage, activeStep, listeningCompleted } = body;

    const draft = await db.integratedSkillsDraft.upsert({
      where: { userId },
      create: {
        userId,
        studentNotes: studentNotes || '',
        studentWriting: studentWriting || '',
        taskData: taskData ? JSON.stringify(taskData) : null,
        stage: stage || 'config',
        activeStep: activeStep || 1,
        listeningCompleted: listeningCompleted || false,
      },
      update: {
        studentNotes: studentNotes !== undefined ? studentNotes : undefined,
        studentWriting: studentWriting !== undefined ? studentWriting : undefined,
        taskData: taskData !== undefined ? JSON.stringify(taskData) : undefined,
        stage: stage !== undefined ? stage : undefined,
        activeStep: activeStep !== undefined ? activeStep : undefined,
        listeningCompleted: listeningCompleted !== undefined ? listeningCompleted : undefined,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, updatedAt: draft.updatedAt });
  } catch (err) {
    logger.error({ module: 'integrated-skills-draft', error: err instanceof Error ? err.message : String(err) }, 'Draft POST failed');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await db.integratedSkillsDraft.deleteMany({ where: { userId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ module: 'integrated-skills-draft', error: err instanceof Error ? err.message : String(err) }, 'Draft DELETE failed');
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
