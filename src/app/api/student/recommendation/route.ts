// Sprint 33: GET /api/student/recommendation
// Returns adaptive recommendations based on mastery + weakness + exam weights
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { validateQuery } from '@/shared/validation/schemas';
import { recommendationQuerySchema } from '@/modules/recommendation-v2/schemas';
import {
  getFullRecommendations,
  recommendGrammar,
  recommendVocabulary,
  recommendWritingTopic,
} from '@/modules/recommendation-v2/services/recommendation-engine';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = validateQuery(recommendationQuerySchema, searchParams);
    const { studentId, type, limit, includeBreakdown } = query;

    // Ownership: students can only see their own recommendations
    if (
      authResult.role !== 'teacher' &&
      authResult.role !== 'admin' &&
      studentId !== authResult.userId
    ) {
      return NextResponse.json(
        { error: 'You can only view your own recommendations' },
        { status: 403 },
      );
    }

    // Route to specific recommendation function based on type
    if (type === 'grammar') {
      const result = await recommendGrammar(studentId, limit);
      return NextResponse.json({ studentId, type, recommendations: result, generatedAt: new Date() });
    }

    if (type === 'vocabulary') {
      const result = await recommendVocabulary(studentId, limit);
      return NextResponse.json({ studentId, type, recommendations: result, generatedAt: new Date() });
    }

    if (type === 'writing') {
      const result = await recommendWritingTopic(studentId, limit);
      return NextResponse.json({ studentId, type, recommendations: result, generatedAt: new Date() });
    }

    // Default: full recommendations
    const result = await getFullRecommendations(studentId, limit);

    if (!includeBreakdown) {
      // Strip breakdown for lighter response
      const stripBreakdown = (r: typeof result.topRecommendations) =>
        r.map(({ candidate, totalScore, rank }) => ({ candidate, totalScore, rank }));
      return NextResponse.json({
        ...result,
        topRecommendations: stripBreakdown(result.topRecommendations),
        recommendedGrammar: stripBreakdown(result.recommendedGrammar),
        recommendedVocabulary: stripBreakdown(result.recommendedVocabulary),
        recommendedWriting: stripBreakdown(result.recommendedWriting),
        recommendedExercise: stripBreakdown(result.recommendedExercise),
      });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'recommendation-v2', error: message }, 'GET /api/student/recommendation failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
