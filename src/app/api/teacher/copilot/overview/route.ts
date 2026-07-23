// Sprint 38: GET /api/teacher/copilot/overview — teacher dashboard overview
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { teacherCopilotService } from '@/modules/teacher/copilot/services/teacher-copilot-service';
import { logger } from '@/shared/logger/logger';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  try {
    const overview = await teacherCopilotService.getOverview(authResult.userId!);
    return NextResponse.json({ overview });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'teacher-copilot', error: msg }, 'Overview failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
