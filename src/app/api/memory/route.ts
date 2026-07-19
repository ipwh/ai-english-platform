// Sprint 25: Learning Memory API
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { memoryService } from '@/modules/learning-memory/services/memory-service';
import { memoryRepo } from '@/modules/learning-memory/repositories/memory-repository';
import { generateLearningContext } from '@/modules/learning-memory/services/memory-scoring';
import { persistMemoryToDb, loadMemoryFromDb, deleteMemoryFromDb } from '@/modules/learning-memory/repositories/memory-db-repository';

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
      case 'context': {
        // Try loading from DB first
        const dbMemory = await loadMemoryFromDb(auth.userId);
        if (dbMemory) {
          memoryRepo.save(auth.userId, dbMemory);
        }
        const ctx = memoryService.getContext(auth.userId);
        return NextResponse.json(ctx);
      }
      case 'memory': {
        const dbMemory = await loadMemoryFromDb(auth.userId);
        if (dbMemory) memoryRepo.save(auth.userId, dbMemory);
        return NextResponse.json(memoryService.getMemory(auth.userId));
      }
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
        const mem = memoryService.getMemory(auth.userId);
        await persistMemoryToDb(auth.userId, mem);
        break;
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    // Auto-persist after every update
    const mem = memoryService.getMemory(auth.userId);
    persistMemoryToDb(auth.userId, mem).catch(() => {});

    return NextResponse.json({ success: true, version: mem.version });
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
    await deleteMemoryFromDb(auth.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
