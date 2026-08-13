// Sprint 111: Writing Coach API — uses unified AI-powered WritingCoachService
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { writingCoachService, WritingScoringUnavailableError } from '@/modules/writing-coach/services/writing-coach-service';
import type { EssaySubmission } from '@/modules/writing-coach/types';
import { logger } from '@/shared/logger/logger';

export async function POST(request: NextRequest) {
  const auth = await verifyApiAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'review': {
        const essay: EssaySubmission = {
          studentId: auth.userId || '',
          essayId: body.essayId || `essay_${Date.now()}`,
          title: body.title || '',
          content: body.content || '',
          textType: body.textType || 'essay',
          gradeLevel: body.gradeLevel || 'S4',
          wordCount: (body.content || '').split(/\s+/).length,
          submittedAt: new Date().toISOString(),
        };
        const review = await writingCoachService.analyzeEssay(essay);
        writingCoachService.saveRevision(essay.essayId, {
          versionId: `v${Date.now()}`,
          content: essay.content,
          submittedAt: essay.submittedAt,
          score: review.totalScore,
          changes: 'Initial submission',
        });
        return NextResponse.json(review);
      }
      case 'quick': {
        const essay: EssaySubmission = {
          studentId: auth.userId || '',
          essayId: body.essayId || `essay_${Date.now()}`,
          title: body.title || '',
          content: body.content || '',
          textType: body.textType || 'essay',
          gradeLevel: body.gradeLevel || 'S4',
          wordCount: (body.content || '').split(/\s+/).length,
          submittedAt: new Date().toISOString(),
        };
        const feedback = await writingCoachService.quickFeedback(essay);
        return NextResponse.json(feedback);
      }
      case 'compare': {
        const original: EssaySubmission = {
          studentId: auth.userId || '', essayId: body.originalId, title: '',
          content: body.originalContent || '', textType: body.textType || 'essay',
          gradeLevel: 'S4', wordCount: (body.originalContent || '').split(/\s+/).length,
          submittedAt: '',
        };
        const revised: EssaySubmission = {
          studentId: auth.userId || '', essayId: body.revisedId, title: '',
          content: body.revisedContent || '', textType: body.textType || 'essay',
          gradeLevel: 'S4', wordCount: (body.revisedContent || '').split(/\s+/).length,
          submittedAt: '',
        };
        const comparison = await writingCoachService.compareRevisions(original, revised);
        return NextResponse.json(comparison);
      }
      case 'history':
        return NextResponse.json(
          writingCoachService.getRevisionHistory(body.essayId) || { essayId: body.essayId, versions: [] }
        );
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof WritingScoringUnavailableError) {
      // FAIL CLOSED: infrastructure/model failure is never a student mark.
      return NextResponse.json(
        { status: err.status, reason: err.message, retryable: err.retryable },
        { status: 503 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ module: 'writing-coach-api', error: msg }, 'POST /api/writing-coach failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
