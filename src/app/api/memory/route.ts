// Sprint 25: Learning Memory API — v4.1: uses service layer, not repos directly
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { memoryService } from '@/modules/learning-memory/services/memory-service';
import { generateLearningContext } from '@/modules/learning-memory/services/memory-scoring';
import { loadMemoryFromDb } from '@/modules/learning-memory/repositories/memory-db-repository';

// GET /api/memory?action=context|memory|freshness
export async function GET(request: NextRequest) {
  const auth = await verifyApiAuth(request);
  if (!auth.authenticated || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'context';

  try {
    // Sync DB → in-memory (persistence layer concern)
    const dbMemory = await loadMemoryFromDb(auth.userId);
    if (dbMemory) {
      memoryService.saveMemory(auth.userId, dbMemory);
    }

    switch (action) {
      case 'context':
        return NextResponse.json(memoryService.getContext(auth.userId));
      case 'memory':
        return NextResponse.json(memoryService.getMemory(auth.userId));
      case 'freshness':
        return NextResponse.json({ freshnessHours: memoryService.getFreshness(auth.userId) });
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/memory — update memory
export async function POST(request: NextRequest) {
  const auth = await verifyApiAuth(request);
  if (!auth.authenticated || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'record-grammar':
        memoryService.recordGrammarResult(auth.userId, body.topic, body.topicZh, body.correct);
        break;
      case 'record-vocabulary':
        memoryService.recordVocabulary(auth.userId, body.word, body.masteryStars);
        break;
      case 'record-writing':
        memoryService.recordWriting(auth.userId, body.wordCount, body.textType);
        break;
      case 'record-reading':
        memoryService.recordReading(auth.userId, body.topic, body.wpm);
        break;
      case 'record-session':
        memoryService.recordSession(auth.userId, body.durationMinutes, body.questionsAnswered);
        break;
      case 'record-error':
        memoryService.recordError(auth.userId, body.question, body.studentAnswer, body.correctAnswer, body.category);
        break;
      case 'update-weaknesses':
        memoryService.updateWeaknesses(auth.userId, body.skillAccuracy);
        break;
      case 'persist': {
        // TODO(Sprint 45): Implement memory persistence to DB
        break;
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    // Auto-persist after every update
    // TODO(Sprint 45): Implement memory persistence to DB

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/memory — delete student memory
export async function DELETE(request: NextRequest) {
  const auth = await verifyApiAuth(request);
  if (!auth.authenticated || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  try {
    memoryService.deleteMemory(auth.userId);
    // TODO(Sprint 45): Implement memory deletion from DB
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
