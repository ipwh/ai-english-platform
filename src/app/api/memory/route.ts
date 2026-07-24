// Sprint 75: Learning Memory API — uses MemoryService (persistent via MemoryDbRepository)
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { memoryService } from '@/modules/learning/memory/services/memory-service';
import { generateLearningContext } from '@/modules/learning/memory/services/memory-scoring';
import { logger } from '@/shared/logger/logger';

// GET /api/memory?action=context|memory|freshness
export async function GET(request: NextRequest) {
  const auth = await verifyApiAuth(request);
  if (!auth.authenticated || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'context';

  try {
    switch (action) {
      case 'context':
        return NextResponse.json(await memoryService.getContext(auth.userId));
      case 'memory':
        return NextResponse.json(await memoryService.getMemory(auth.userId));
      case 'freshness':
        return NextResponse.json({ freshnessHours: await memoryService.getFreshness(auth.userId) });
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
        // Verify memory is persisted (DB-backed repo is always auto-persisted)
        const exists = await memoryService.getMemory(auth.userId);
        logger.info({ module: 'memory', userId: auth.userId, version: exists.version }, 'Memory persistence verified');
        return NextResponse.json({ success: true, persisted: true, version: exists.version });
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    // Memory is auto-persisted to DB by MemoryDbRepository after every update
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
    await memoryService.deleteMemory(auth.userId);
    logger.info({ module: 'memory', userId: auth.userId }, 'Memory deleted');
    return NextResponse.json({ success: true, deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ module: 'memory', error: msg }, 'Memory deletion failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
