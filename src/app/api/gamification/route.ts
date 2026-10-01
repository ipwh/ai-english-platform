// ============================================
// Gamification API — XP、徽章、排行榜
// Sprint 61: Delegates to StudentStateMutationService (CQRS write path)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { buildLeaderboard, isAnswerXpEventType } from '@/modules/student/progress/services/gamification';
import type { XpEvent } from '@/modules/student/progress/services/gamification';
import { resolveXpEventPolicy } from '@/modules/student/progress/services/xp-event-policy';
import { calculatePracticeStreak } from '@/modules/student/progress/services/streak-service';
import {
  resolveAnswerXpIdentity,
  normalizePracticeDifficulty,
  type AnswerXpIdentity,
  type PracticeDifficulty,
} from '@/modules/exercise/services/question-difficulty-resolution';
import { getLeaderboard, getDailyGoalProgress, getWeeklyActiveDays, findUserByIdSelect, findPracticeSessionByClientId } from '@/modules/student';
import { studentStateMutationService } from '@/modules/student/state/StudentStateMutationService';
import { VocabularyRepo, MistakeRepo } from '@/modules/repositories';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { hkWeekStartUtc } from '@/shared/utils/hk-date';

// 2026-10-01：XP 端點原本**完全無限流**，配合「任意唯一字串即可領取」的缺陷
// 可被腳本大量刷分。正常使用每題／每場各一個請求（<20/分鐘）；60/分鐘上限
// 足以阻斷腳本，亦不影響正常作答。（與其他路由相同的 in-memory limiter：
// per-instance 有效，非全域精確 —— 防護而非保證。）
const XP_RATE_LIMIT = { maxRequests: 60, windowMs: 60_000 } as const;

// GET — 取得學生 gamification 狀態
export async function GET(req: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(req);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');
    const action = searchParams.get('action') || 'status';

    if (!studentId) {
      return NextResponse.json({ error: '缺少 studentId / studentId is required' }, { status: 400 });
    }

    // 🔒 Ownership: students can only view their own gamification data
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能查看自己的遊戲化數據 / You can only view your own gamification data' }, { status: 403 });
    }

    if (action === 'leaderboard') {
      const students = await getLeaderboard(50);

      // Sprint 133: 初中（S1-S3）排行榜改按「本週活躍日數」而非總 XP，
      // 避免強化刷題；高中維持 XP 排名。
      const viewer = await findUserByIdSelect(studentId, { level: true }).catch(() => null) as { level?: string | null } | null;
      const junior = viewer?.level ? ['S1', 'S2', 'S3'].includes(viewer.level) : false;
      let options: { metric: 'xp' | 'weekly-active-days'; weeklyActiveDays?: Map<string, number> } = { metric: 'xp' };
      if (junior) {
        // 2026-09-20 稽核：本週活躍日窗口用香港日界線（原本為 UTC 午夜）
        const weekStart = hkWeekStartUtc(6);
        const weeklyActiveDays = await getWeeklyActiveDays(students.map((s: { id: string }) => s.id), weekStart);
        options = { metric: 'weekly-active-days', weeklyActiveDays };
      }

      const leaderboard = buildLeaderboard(
        students.map(s => ({
          ...s,
          xp: (s as { xp?: number }).xp ?? 0,
          overallAccuracy: s.overallAccuracy ?? undefined,
        })),
        options,
      );

      return NextResponse.json({ leaderboard });
    }

    // Default: student stats + badges — delegated to mutation service
    const { allBadges, newBadges } = await studentStateMutationService.checkAndAwardBadges(studentId);
    const engagement = await studentStateMutationService.getEngagementStats(studentId);

    // Sprint 133: daily goal with depth requirement
    const viewer = await findUserByIdSelect(studentId, { level: true }).catch(() => null) as { level?: string | null } | null;
    const dailyGoal = await getDailyGoalProgress(studentId, viewer?.level ?? undefined);

    return NextResponse.json({
      xp: engagement.xp,
      level: { level: engagement.level, title: `Level ${engagement.level}`, titleZh: `第 ${engagement.level} 級` },
      badges: allBadges,
      stats: engagement.stats,
      newBadges: newBadges.length > 0 ? newBadges : undefined,
      dailyGoal,
    });
  } catch (error) {
    logger.error({ module: 'gamification', error: error instanceof Error ? error.message : String(error) }, 'Gamification GET failed');
    return NextResponse.json({ error: 'Failed to load gamification data' }, { status: 500 });
  }
}

// POST — 記錄 XP 事件
//
// 2026-09-28 反刷分重寫（實證：一名學生以反覆切換單字熟悉度刷得 95,904 XP）：
//   1. **事件白名單** — 未知事件一律 400（從前可送任意 event）。
//   2. **去重鍵由伺服器建立** — `metadata.idempotencyKey` 客戶端送來的一律忽略；
//      缺少必要識別碼（questionId / mistakeId / wordId / attemptId / sessionId）
//      直接 400，讓可重複事件再也無法無限領取。
//   3. **難度由伺服器解析** — 忽略 `event.difficulty`（從前送 challenge 即 1.5×）。
//   4. **連續天數由伺服器計算** — 忽略 `event.streakDays`（從前可自報天文數字）。
//   5. **完成練習須對應真實場次** — 以 (studentId, clientSubmissionId) 驗證。
//
// 2026-10-01 同題重複稽核補強（實證：同一題內容以 7 個不同 questionId 重複
// 領取 XP；且任意唯一字串即可當識別碼）：
//   6. **答題事件須解析到正典題目** — 查無此題 ⇒ 404；鍵改用伺服器計算的
//      **內容指紋**（同一內容重生成的新 id 不再重複發放）。
//   7. **識別碼真實性** — `reviewMistake` 的錯題、`learnWord`/`masterWord` 的
//      生字必須**屬於該學生**，未知字串一律 404（從前無任何存在性檢查）。
//   8. **端點限流** — 每名學生 60 次/分鐘（腳本刷分的防護層）。
export async function POST(req: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(req);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    // 🔒 Rate limiting（2026-10-01；per-user，認證後才能識別）
    const rateLimit = await checkRateLimit({
      ...XP_RATE_LIMIT,
      identifier: `gamification:${authResult.userId ?? 'unknown'}`,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.message }, {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
      });
    }

    const body = await req.json();
    const { studentId, event } = body as {
      studentId: string;
      event: { type?: unknown; metadata?: unknown };
    };

    if (!studentId || !event) {
      return NextResponse.json({ error: '缺少必要參數 / Missing required parameters' }, { status: 400 });
    }

    // 🔒 Ownership: students can only record XP events for themselves
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能記錄自己的 XP 事件 / You can only record your own XP events' }, { status: 403 });
    }

    // 1) 答題事件：先解析正典題目身分（存在性 + 內容指紋）。
    //    解析不到 ⇒ 403/404 拒絕 —— 任意字串不得當 questionId；重新生成
    //    產生的新 id 亦因內容指紋相同而不重複發放。查詢失敗往外拋（5xx）
    //    ——「故障」與「查無此題」不得混為一談。
    let answerIdentity: AnswerXpIdentity | null = null;
    if (isAnswerXpEventType(event.type)) {
      const meta = typeof event.metadata === 'object' && event.metadata !== null
        ? event.metadata as Record<string, unknown>
        : {};
      const rawId = typeof meta.questionId === 'string' ? meta.questionId.trim() : '';
      if (!rawId) {
        return NextResponse.json({ error: `事件 ${event.type} 需要 metadata.questionId` }, { status: 400 });
      }
      answerIdentity = await resolveAnswerXpIdentity(rawId);
      if (!answerIdentity) {
        return NextResponse.json(
          { error: '找不到對應的正典題目，無法發放 XP / Canonical question not found' },
          { status: 404 },
        );
      }
    }

    // 2) 事件白名單 + 伺服器建立去重鍵（去重鍵已按 studentId 界定）
    const policyResult = resolveXpEventPolicy(event.type, event.metadata, {
      studentId,
      answerContentKey: answerIdentity?.contentKey ?? null,
    });
    if (!policyResult.ok) {
      return NextResponse.json({ error: policyResult.error }, { status: 400 });
    }
    const { policy } = policyResult;

    // 3) 難度：伺服器解析（永不採信 event.difficulty）
    let difficulty: PracticeDifficulty = 'core';
    if (answerIdentity) {
      difficulty = answerIdentity.difficulty;
    } else if (policy.type === 'completeSession') {
      const session = await findPracticeSessionByClientId(studentId, policy.identifiers.sessionId);
      if (!session) {
        return NextResponse.json(
          { error: '找不到對應的練習場次 / Practice session not found' },
          { status: 404 },
        );
      }
      difficulty = normalizePracticeDifficulty(session.difficulty);
    }

    // 3.5) 識別碼真實性（2026-10-01）：錯題／生字必須屬於該學生。
    //      從前任意唯一字串即可換取 XP（實測：無存在性檢查）。
    if (policy.type === 'reviewMistake') {
      const mistake = await MistakeRepo.findMistakeById(policy.identifiers.mistakeId);
      if (!mistake || mistake.studentId !== studentId) {
        return NextResponse.json({ error: '找不到對應的錯題 / Mistake not found' }, { status: 404 });
      }
    }
    if (policy.type === 'learnWord' || policy.type === 'masterWord') {
      const vocab = await VocabularyRepo.findVocabById(policy.identifiers.wordId);
      if (!vocab || vocab.studentId !== studentId) {
        return NextResponse.json({ error: '找不到對應的生字 / Vocabulary word not found' }, { status: 404 });
      }
    }

    // 4) 連續天數：伺服器計算（永不採信 event.streakDays）
    let streakDays: number | undefined;
    if (policy.type === 'dailyLogin') {
      streakDays = await calculatePracticeStreak(studentId);
    }

    // 5) 組合最終事件（metadata 只含伺服器解析出的識別碼與去重鍵）
    const resolvedEvent: XpEvent = {
      type: policy.type,
      difficulty,
      streakDays,
      metadata: {
        ...policy.identifiers,
        idempotencyKey: policy.idempotencyKey,
        source: 'api',
        ...(answerIdentity ? { contentKey: answerIdentity.contentKey } : {}),
      },
    };

    const { xpGained, newLevel } = await studentStateMutationService.awardXp(studentId, resolvedEvent);

    return NextResponse.json({ xpGained, level: newLevel });
  } catch (error) {
    logger.error({ module: 'gamification', error: error instanceof Error ? error.message : String(error) }, 'Gamification POST failed');
    return NextResponse.json({ error: '記錄 XP 失敗 / Failed to record XP' }, { status: 500 });
  }
}

