// Sprint 32: GET /api/student/weakness
// Returns top 10 weaknesses, most frequent mistakes, improvement trend, recommendations
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { validateQuery } from '@/shared/validation/schemas';
import { weaknessQuerySchema } from '@/modules/mistake-intelligence/schemas';
import { buildWeaknessProfile } from '@/modules/mistake-intelligence/services/mistake-intelligence-service';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = validateQuery(weaknessQuerySchema, searchParams);
    const { studentId, limit, category, includeRecommendations } = query;

    // Ownership: students can only see their own weakness data
    if (
      authResult.role !== 'teacher' &&
      authResult.role !== 'admin' &&
      studentId !== authResult.userId
    ) {
      return NextResponse.json(
        { error: 'You can only view your own weakness data' },
        { status: 403 },
      );
    }

    const profile = await buildWeaknessProfile(studentId, limit, includeRecommendations);

    // If a specific category is requested, filter
    if (category) {
      const filtered = profile.topWeaknesses.filter(
        w => w.grammarCategory === category,
      );
      return NextResponse.json({
        studentId,
        category,
        weaknesses: filtered,
        trend: profile.improvementTrend,
        generatedAt: profile.generatedAt,
      });
    }

    return NextResponse.json(profile);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'mistake-intelligence', error: message }, 'GET /api/student/weakness failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
