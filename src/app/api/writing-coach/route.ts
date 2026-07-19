// Sprint 27: Writing Coach API
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { reviewEssay, compareRevisions, saveRevision, getRevisionHistory } from '@/modules/writing-coach/services/writing-coach';
import type { EssaySubmission } from '@/modules/writing-coach/types';

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
          studentId: auth.userId || '', essayId: body.essayId || `essay_${Date.now()}`,
          title: body.title || '', content: body.content || '', textType: body.textType || 'essay',
          gradeLevel: body.gradeLevel || 'S4', wordCount: (body.content || '').split(/\s+/).length,
          submittedAt: new Date().toISOString(),
        };
        const review = reviewEssay(essay);
        saveRevision(essay.essayId, { versionId: `v${Date.now()}`, content: essay.content, submittedAt: essay.submittedAt, score: review.totalScore, changes: 'Initial submission' });
        return NextResponse.json(review);
      }
      case 'compare': {
        const original: EssaySubmission = {
          studentId: auth.userId || '', essayId: body.originalId, title: '', content: body.originalContent || '',
          textType: body.textType || 'essay', gradeLevel: 'S4', wordCount: (body.originalContent || '').split(/\s+/).length, submittedAt: '',
        };
        const revised: EssaySubmission = {
          studentId: auth.userId || '', essayId: body.revisedId, title: '', content: body.revisedContent || '',
          textType: body.textType || 'essay', gradeLevel: 'S4', wordCount: (body.revisedContent || '').split(/\s+/).length, submittedAt: '',
        };
        return NextResponse.json(compareRevisions(original, revised));
      }
      case 'history':
        return NextResponse.json(getRevisionHistory(body.essayId) || { essayId: body.essayId, versions: [] });
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
