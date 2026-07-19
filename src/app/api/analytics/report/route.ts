// Sprint 40: POST /api/analytics/report — AI Learning Analytics
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { learningAnalyticsAI } from '@/modules/analytics/services/analytics-pro';
import { logger } from '@/shared/logger/logger';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { studentId, type, ...analyticsInput } = body;

    if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

    if (authResult.role === 'student' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能查看自己的分析報告' }, { status: 403 });
    }

    const input = { studentId, ...analyticsInput };

    switch (type) {
      case 'weekly':
        return NextResponse.json({ report: learningAnalyticsAI.generateWeeklyReport(input) });
      case 'monthly':
        return NextResponse.json({ report: learningAnalyticsAI.generateMonthlyReport(input) });
      case 'mastery':
        return NextResponse.json({ report: learningAnalyticsAI.generateMasteryTrend(input) });
      case 'retention':
        return NextResponse.json({ report: learningAnalyticsAI.generateRetentionPrediction(input) });
      case 'dashboard':
        return NextResponse.json({ dashboard: learningAnalyticsAI.generateDashboard(input) });
      default:
        return NextResponse.json({
          weekly: learningAnalyticsAI.generateWeeklyReport(input),
          mastery: learningAnalyticsAI.generateMasteryTrend(input),
          retention: learningAnalyticsAI.generateRetentionPrediction(input),
          dashboard: learningAnalyticsAI.generateDashboard(input),
        });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'analytics-pro', error: msg }, 'Analytics generation failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
