// Sprint 35: GET /api/student/vocabulary-profile
// Sprint 58: Delegates through StudentTwin (canonical entry point)
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { validateQuery } from '@/shared/validation/schemas';
import { vocabProfileQuerySchema } from '@/modules/vocabulary-intelligence/schemas';
import { studentTwinService } from '@/modules/student-twin/services/student-twin-service';

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = validateQuery(vocabProfileQuerySchema, searchParams);
    const { studentId, status, difficulty, includeWordFamilies, reviewLimit } = query;

    // Ownership
    if (
      authResult.role !== 'teacher' &&
      authResult.role !== 'admin' &&
      studentId !== authResult.userId
    ) {
      return NextResponse.json(
        { error: 'You can only view your own vocabulary profile' },
        { status: 403 },
      );
    }

    const profile = await studentTwinService.getVocabProfile(studentId);

    // Filter by status if requested
    if (status) {
      // Map hyphenated query param to camelCase property
      const statusKey = status === 'need-review' ? 'needReview' : status;
      const filtered = (profile as unknown as Record<string, unknown>)[statusKey] as typeof profile.known ?? [];
      return NextResponse.json({
        studentId,
        status,
        words: filtered,
        count: filtered.length,
        generatedAt: profile.generatedAt,
      });
    }

    // Filter by difficulty
    if (difficulty) {
      const allWords = [
        ...profile.known, ...profile.learning, ...profile.weak,
        ...profile.forgotten, ...profile.mastered, ...profile.needReview,
      ].filter(w => w.difficulty === difficulty);
      return NextResponse.json({
        studentId,
        difficulty,
        words: allWords,
        count: allWords.length,
        generatedAt: profile.generatedAt,
      });
    }

    // Limit review queue
    if (reviewLimit < 10) {
      profile.reviewQueue = profile.reviewQueue.slice(0, reviewLimit);
    }

    // Optionally strip word families
    const response = { ...profile } as unknown as Record<string, unknown>;
    if (!includeWordFamilies) {
      delete response.wordFamilies;
    }

    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'vocabulary-intelligence', error: message }, 'GET /api/student/vocabulary-profile failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
