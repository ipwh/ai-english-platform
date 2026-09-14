import { adminDbQuery } from '@/modules/admin/services/admin-operations';
// ============================================
// API: /api/mistakes — 錯題記錄
// P1: Migrated to MistakeRepo
// 2026-09-14: 技能／題型歸屬 — 伺服器解析正典題目定義，客戶端自報值只作後備；
//             GET 回傳 breakdown（技能／題型弱項聚合）。
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { MistakeRepo } from '@/modules/repositories';
import {
  EMPTY_SKILL_IDENTITY,
  resolveMistakeSkillIdentities,
  sanitizeClientSkillClaims,
  sanitizeQuestionSummary,
  type MistakeSkillIdentity,
} from '@/modules/exercise/services/mistake-skill-identity';
import { buildMistakeSkillBreakdown } from '@/modules/mistake/intelligence/services/mistake-skill-breakdown';
import { nextMistakeReviewState } from '@/modules/mistake/db/services/mistake-tracker';

const MISTAKE_TYPES = new Set([
  'grammar', 'vocabulary', 'comprehension', 'careless', 'time-management', 'chinglish',
]);

export async function POST(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { studentId, questionId, studentAnswer, correctAnswer, mistakeType, aiExplanation } = body;

    if (!studentId || !questionId) {
      return NextResponse.json({ error: 'studentId, questionId 為必填 / studentId and questionId are required' }, { status: 400 });
    }

    // 🔒 Ownership: only allow creating mistakes for yourself (teachers use separate routes)
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能為自己的帳號新增錯題 / You can only add mistakes to your own account' }, { status: 403 });
    }

    // 🔒 技能歸屬：先查正典題目定義（ReadingQuestion / GrammarQuestion）。
    //    查不到（例如即時生成、未持久化的聆聽題目）才採用客戶端自報值，
    //    且必須通過白名單；解析失敗不得阻止錯題記錄。
    let canonical: MistakeSkillIdentity = EMPTY_SKILL_IDENTITY;
    try {
      const resolved = await resolveMistakeSkillIdentities([String(questionId)]);
      canonical = resolved.get(String(questionId)) ?? EMPTY_SKILL_IDENTITY;
    } catch (err) {
      logger.warn(
        { module: 'mistakes', error: err instanceof Error ? err.message : String(err) },
        'Canonical skill resolution failed — falling back to client claims',
      );
    }

    const claims = sanitizeClientSkillClaims({
      languageSkill: body.languageSkill,
      questionType: body.questionType,
    });
    const identity: MistakeSkillIdentity = canonical.skillSource === 'canonical'
      ? canonical
      : {
          languageSkill: claims.languageSkill,
          grammarItem: null,
          questionType: claims.questionType,
          skillSource: claims.languageSkill || claims.questionType ? 'client-claimed' : 'unresolved',
          questionSummary: null,
        };

    const claimedType = MISTAKE_TYPES.has(String(mistakeType)) ? String(mistakeType) : 'grammar';
    // 閱讀／聆聽題目一律歸為 comprehension（不採用客戶端分類）
    const effectiveType = identity.languageSkill === 'reading' || identity.languageSkill === 'listening'
      ? 'comprehension'
      : claimedType;

    // 摘要優先採用伺服器持有的題目文字；客戶端文字只作顯示後備
    const questionSummary = identity.questionSummary
      || sanitizeQuestionSummary(body.questionSummary)
      || '';

    // R3.10-E.2 P0-2: 原子 insert-if-absent（唯一鍵 studentId+questionId）。
    // 同一 (studentId, questionId) 只保留一筆；重複自報不回傳錯誤。
    await MistakeRepo.createMistakeIfAbsent({
      studentId,
      questionId,
      questionSummary,
      studentAnswer: studentAnswer || '',
      correctAnswer: correctAnswer || '',
      mistakeType: effectiveType,
      aiExplanation,
      languageSkill: identity.languageSkill,
      grammarItem: identity.grammarItem,
      questionType: identity.questionType,
      skillSource: identity.skillSource,
    });
    const mistake = await MistakeRepo.findMistakeByQuestion(studentId, questionId);

    return NextResponse.json({ mistake }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

    // 🔒 Ownership: students can only read their own mistakes
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能查看自己的錯題 / You can only view your own mistakes' }, { status: 403 });
    }

    const raw = await MistakeRepo.listMistakes(studentId, 100);

    // 2026-09-14: 移除「依 questionSummary 去重」的過濾。
    // 唯一鍵 (studentId, questionId) 已保證不重複；而該過濾會把
    // questionSummary 為空（舊版客戶端未送摘要）的錯題整批隱藏。
    const mistakes = raw.map((m) => ({
      ...m,
      date: m.createdAt.toISOString(),
    }));

    // 技能／題型弱項聚合 — 讓「不能重考同一題」的閱讀／聆聽錯題仍有可執行的下一步
    const breakdown = buildMistakeSkillBreakdown(raw);

    return NextResponse.json({ mistakes, breakdown });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    logger.error({ module: 'mistakes', error: message }, 'Mistakes GET failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, reviewed, inReviewList } = body;

    if (!id) {
      return NextResponse.json({ error: 'id 為必填 / id is required' }, { status: 400 });
    }

    // 🔒 Ownership: verify the mistake belongs to this student
    const existing = await MistakeRepo.findMistakeById(id);
    if (!existing) {
      return NextResponse.json({ error: '找不到此錯題 / Mistake not found' }, { status: 404 });
    }
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && existing.studentId !== authResult.userId) {
      return NextResponse.json({ error: '無權限修改其他用戶的錯題 / You cannot edit another user\'s mistakes' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (typeof reviewed === 'boolean') updateData.reviewed = reviewed;
    if (typeof inReviewList === 'boolean') updateData.inReviewList = inReviewList;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // 2026-09-14: 標記已溫習時同步排定下次複習（SM-2，與 /api/srs/review 同一 owner）。
    // 學生自報「已溫習」＝品質良好 → quality 4；不更新日期會令卡片永遠到期。
    if (reviewed === true) {
      const schedule = nextMistakeReviewState(existing, 4, new Date());
      updateData.nextReviewDate = schedule.nextReviewDate;
      updateData.reviewInterval = schedule.reviewInterval;
      updateData.easeFactor = schedule.easeFactor;
      updateData.lastReviewedAt = schedule.lastReviewedAt;
    }

    const mistake = await MistakeRepo.updateMistake(id, updateData);

    // 記錄複習歷史 — uses db directly (MistakeReviewLog has no dedicated repo yet)
    try {
      const action = inReviewList === true ? 'addToReviewList'
        : inReviewList === false ? 'removeFromReviewList'
        : 'reviewed';
      await adminDbQuery('mistakeReviewLog', 'create', {
        data: {
          mistakeId: id,
          studentId: mistake.studentId,
          action,
          outcome: reviewed ? 'correct' : undefined,
        },
      });
    } catch { /* 歷史記錄非致命 */ }

    return NextResponse.json({ mistake });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id 為必填 / id is required' }, { status: 400 });

    // 🔒 Ownership: verify the mistake belongs to this student
    const existing = await MistakeRepo.findMistakeById(id);
    if (!existing) {
      return NextResponse.json({ error: '找不到此錯題 / Mistake not found' }, { status: 404 });
    }
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && existing.studentId !== authResult.userId) {
      return NextResponse.json({ error: '無權限刪除其他用戶的錯題 / You cannot delete another user\'s mistakes' }, { status: 403 });
    }

    await MistakeRepo.deleteMistake(id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
