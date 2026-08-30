// ============================================
// API: /api/vocabulary — 詞彙庫
// Sprint 104: Added Zod validation for POST
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { serializeVocab } from '@/shared/utils/utils';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { validateRequest } from '@/shared/validation/validate';
import { vocabularyCreateSchema } from '@/shared/validation/schemas';
import {
  addWord,
  listVocabPaginated,
  updateVocabWord,
  deleteVocabWord,
} from '@/modules/vocabulary/services/vocabulary-service';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    // Sprint 104: Zod-validated input
    const { studentId, word, partOfSpeech, translation: meaningZh, example: exampleSentence } =
      validateRequest(vocabularyCreateSchema, body);

    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能為自己的帳號新增單字 / You can only add words to your own account' }, { status: 403 });
    }

    // Use service layer — handles dedup internally (returns existing on duplicate)
    const result = await addWord({
      studentId, word: word.trim(),
      translation: meaningZh || '',
      partOfSpeech: partOfSpeech || 'unknown',
      example: exampleSentence,
      source: undefined,
    });

    return NextResponse.json({ vocab: serializeVocab(result) }, { status: 201 });
  } catch (err: unknown) {
    // Return NextResponse (e.g. from validateRequest) so it reaches the client
    // with its real status/body instead of an empty 500.
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : '未知錯誤';
    if (message.includes('Unique constraint') || message.includes('UNIQUE')) {
      return NextResponse.json(
        { error: 'duplicate', message: '此單字已在生字簿中 / This word is already in your vocabulary book' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能查看自己的生字簿 / You can only view your own vocabulary book' }, { status: 403 });
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '50')));
    const familiarity = searchParams.get('familiarity') || undefined;
    const pos = searchParams.get('pos') || undefined;
    const sort = (searchParams.get('sort') || 'recent') as 'recent' | 'alpha' | 'mastery';
    const search = searchParams.get('search') || undefined;

    const result = await listVocabPaginated(studentId, page, limit, {
      familiarity, pos, sort, search,
    });

    // 2026-08-30 audit (R7): 生字簿為個人資料 — 快取標為 private，
    // 不得進入共用/CDN 快取（原 cacheFor 用 public）。
    return NextResponse.json({
      vocab: result.vocab.map(serializeVocab),
      pagination: result.pagination,
    }, { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load vocabulary';
    // Intentional: return empty [] and default pagination so client renders graceful empty state
    logger.error({ module: 'vocabulary', error: err instanceof Error ? err.message : String(err) }, 'Vocabulary GET failed');
    return NextResponse.json({ error: message, vocab: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, familiarity, masteryLevel, nextReviewDate, reviewInterval, easeFactor, lastReviewedAt } = body;
    if (!id) return NextResponse.json({ error: 'id 為必填 / id is required' }, { status: 400 });

    const result = await updateVocabWord(id, authResult.userId!, authResult.role ?? 'student', {
      familiarity, masteryLevel, nextReviewDate, reviewInterval, easeFactor, lastReviewedAt,
    });

    if (result.error === 'NOT_FOUND') {
      return NextResponse.json({ error: '找不到此單字 / Word not found' }, { status: 404 });
    }
    if (result.error === 'FORBIDDEN') {
      return NextResponse.json({ error: '無權限修改其他用戶的生字簿 / You cannot edit another user\'s vocabulary book' }, { status: 403 });
    }
    if (result.error === 'NO_FIELDS') {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    return NextResponse.json({ vocab: serializeVocab(result.vocab!) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id 為必填 / id is required' }, { status: 400 });

    const result = await deleteVocabWord(id, authResult.userId!, authResult.role ?? 'student');

    if (result.error === 'NOT_FOUND') {
      return NextResponse.json({ error: '找不到此單字 / Word not found' }, { status: 404 });
    }
    if (result.error === 'FORBIDDEN') {
      return NextResponse.json({ error: '無權限刪除其他用戶的生字簿 / You cannot delete another user\'s vocabulary book' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
