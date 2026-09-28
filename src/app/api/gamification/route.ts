// ============================================
// Gamification API — XP、徽章、排行榜
// Sprint 61: Delegates to StudentStateMutationService (CQRS write path)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { buildLeaderboard } from '@/modules/student/progress/services/gamification';
import type { XpEvent } from '@/modules/student/progress/services/gamification';
import { resolveXpEventPolicy } from '@/modules/student/progress/services/xp-event-policy';
import { calculatePracticeStreak } from '@/modules/student/progress/services/streak-service';
import {
  resolveQuestionDifficulty,
  normalizePracticeDifficulty,
  type PracticeDifficulty,
} from '@/modules/exercise/services/question-difficulty-resolution';
import { getLeaderboard, getDailyGoalProgress, getWeeklyActiveDays, findUserByIdSelect, findPracticeSessionByClientId } from '@/modules/student';
import { studentStateMutationService } from '@/modules/student/state/StudentStateMutationService';
import { hkWeekStartUtc } from '@/shared/utils/hk-date';

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
export async function POST(req: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(req);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
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

    // 1) 事件白名單 + 伺服器建立去重鍵（去重鍵已按 studentId 界定）
    const policyResult = resolveXpEventPolicy(event.type, event.metadata, { studentId });
    if (!policyResult.ok) {
      return NextResponse.json({ error: policyResult.error }, { status: 400 });
    }
    const { policy } = policyResult;

    // 2) 難度：伺服器解析（永不採信 event.difficulty）
    let difficulty: PracticeDifficulty = 'core';
    if (policy.type === 'answerCorrect' || policy.type === 'answerIncorrect') {
      difficulty = await resolveQuestionDifficulty(policy.identifiers.questionId);
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

    // 3) 連續天數：伺服器計算（永不採信 event.streakDays）
    let streakDays: number | undefined;
    if (policy.type === 'dailyLogin') {
      streakDays = await calculatePracticeStreak(studentId);
    }

    // 4) 組合最終事件（metadata 只含伺服器解析出的識別碼與去重鍵）
    const resolvedEvent: XpEvent = {
      type: policy.type,
      difficulty,
      streakDays,
      metadata: {
        ...policy.identifiers,
        idempotencyKey: policy.idempotencyKey,
        source: 'api',
      },
    };

    const { xpGained, newLevel } = await studentStateMutationService.awardXp(studentId, resolvedEvent);

    return NextResponse.json({ xpGained, level: newLevel });
  } catch (error) {
    logger.error({ module: 'gamification', error: error instanceof Error ? error.message : String(error) }, 'Gamification POST failed');
    return NextResponse.json({ error: '記錄 XP 失敗 / Failed to record XP' }, { status: 500 });
  }
}

