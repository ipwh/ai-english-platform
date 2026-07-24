// Student Dashboard
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Play, Sparkles, Loader2, Trophy, Flame, Star, TrendingUp } from 'lucide-react';
import { logger } from '@/shared/logger/logger';
import StreakFlame from '@/components/shared/StreakFlame';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';
import KpiCard from '@/components/shared/KpiCard';
import { getGreeting } from '@/shared/utils/utils';
import { getLevelInfo, getDailyGoal, getStudyRecommendation, type BadgeDefinition, type BadgeCheckStats } from '@/modules/student/progress/services/gamification';
import { GamificationSkeleton } from '@/components/shared/Skeleton';
import OnboardingGuard from '@/components/shared/OnboardingGuard';

interface GamificationData {
  xp: number;
  level: { level: number; title: string; titleZh: string; xpRequired: number; xpToNext: number };
  badges: (BadgeDefinition & { unlocked: boolean })[];
  stats: Record<string, number>;
}

interface AIInsight {
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: string[];
  estimatedHkdseLevel?: string;
  estimatedCefrLevel?: string;
}

export default function StudentDashboardPage() {
  const { userDisplayName, getWeeklyStats, getMasteryBySkill, loadPracticeHistory, language, userId } = useAppStore();
  const { t } = useT();
  const displayName = userDisplayName || t('common.studentFallback');
  const [studentId, setStudentId] = useState('');
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [studentLevel, setStudentLevel] = useState('S4');
  const [recentPerformance, setRecentPerformance] = useState<{ date: string; accuracy: number; questionsDone: number }[]>([]);
  const [gamification, setGamification] = useState<GamificationData | null>(null);
  const [gamificationLoading, setGamificationLoading] = useState(true);

  // 載入練習歷史（解決重整後數據歸零）
  useEffect(() => {
    loadPracticeHistory();
    // 取得學生實際年級 + 近期練習記錄
    fetch('/api/auth/profile').then(r => r.json()).then(d => {
      const level = d?.user?.level || d?.user?.class?.gradeLevel;
      if (level && ['S1','S2','S3','S4','S5','S6'].includes(level)) setStudentLevel(level);
      const userId = d?.user?.id || '';
      if (userId) {
        setStudentId(userId);
        // Load gamification data
        fetch(`/api/gamification?studentId=${encodeURIComponent(userId)}`)
          .then(r => r.json())
          .then(data => {
            if (data && !data.error) setGamification(data);
          })
          .catch((e) => { logger.error({ module: 'student-dashboard', error: e instanceof Error ? e.message : String(e) }, 'Gamification fetch failed'); })
          .finally(() => setGamificationLoading(false));

        // 🎮 每日登入 XP（DB-based streak，取代 localStorage）
        if (userId) {
          fetch('/api/streak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: userId }),
          }).catch((e) => { logger.error({ module: 'student-dashboard', error: e instanceof Error ? e.message : String(e) }, 'Streak POST failed'); });
        }

        return fetch(`/api/practice?studentId=${encodeURIComponent(userId)}`).then(r => r.json());
      }
    }).then(data => {
      if (data?.sessions) {
        setRecentPerformance(data.sessions.slice(0, 5).map((s: any) => ({
          date: new Date(s.startedAt).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-HK'),
          accuracy: Math.round((s.correctCount / Math.max(1, s.totalQuestions)) * 100),
          questionsDone: s.totalQuestions,
        })));
      }
    }).catch((e) => { logger.error({ module: 'student-dashboard', error: e instanceof Error ? e.message : String(e) }, 'Practice history fetch failed'); });
  }, [loadPracticeHistory, language]);

  const weeklyStats = getWeeklyStats();
  const kpis = [
    { label: t('progress.weeklyLabel'), value: weeklyStats.questionsDone || 0, unit: t('common.question'), trend: 'up' as const, change: 0 },
    { label: t('progress.accuracyLabel'), value: weeklyStats.accuracy || 0, unit: t('common.percent'), trend: 'stable' as const, change: 0 },
    { label: t('progress.sessionsLabel'), value: weeklyStats.sessionsCount || 0, unit: t('common.sessions'), trend: 'up' as const, change: 0 },
    { label: t('student.streak'), value: weeklyStats.streakDays || 0, unit: t('common.days'), trend: 'stable' as const, change: 0 },
  ];

  const unlockedBadges = gamification?.badges?.filter(b => b.unlocked) || [];
  const xpProgress = gamification?.level
    ? Math.round((1 - gamification.level.xpToNext / (gamification.level.xpRequired + gamification.level.xpToNext || 1)) * 100)
    : 0;

  // === Render with OnboardingGuard for new students ===
  const dashboardContent = (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-teal-500 to-teal-600 rounded-2xl p-4 sm:p-6 text-white">
        <p className="text-teal-100 text-sm">{getGreeting(language)}, {displayName}!</p>
        <h1 className="text-2xl font-bold mt-1">{t('student.dashboard.title')}</h1>
        <Link href="/student/practice" className="mt-3 inline-block px-4 py-2 bg-white text-teal-600 rounded-xl font-medium text-sm">
          <Play className="w-4 h-4 inline mr-1" /> {t('student.dashboard.practice')}
        </Link>
        {/* 🔥 Streak + 每日目標 */}
        <div className="flex items-center gap-4 mt-3 text-teal-100 text-xs">
          {weeklyStats.streakDays > 0 && (
            <span className="flex items-center gap-1.5">
              <StreakFlame streakDays={weeklyStats.streakDays} size="sm" />
              {t('student.dashboard.streak', { n: weeklyStats.streakDays })}
            </span>
          )}
          <span>🎯 {t('student.dashboard.dailyGoal')}: {weeklyStats.questionsDone || 0} / {getDailyGoal(studentLevel).questions} {t('common.question')}</span>
        </div>
      </div>

      {/* 🏆 Gamification Section */}
      {gamificationLoading ? (
        <GamificationSkeleton />
      ) : gamification ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xl font-bold shadow-md">
                {gamification.level.level}
              </div>
              <Trophy className="absolute -top-1 -right-1 w-5 h-5 text-yellow-400 drop-shadow" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-gray-900 dark:text-white">
                  {gamification.level.titleZh} (Lv.{gamification.level.level})
                </span>
                <span className="text-xs text-gray-500">
                  {gamification.xp} XP
                </span>
              </div>
              <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
                  style={{ width: `${xpProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {gamification.level.xpToNext > 0
                  ? t('gamification.xpToNextShort').replace('{n}', String(gamification.level.xpToNext))
                  : t('gamification.maxLevel')}
              </p>
            </div>
          </div>

          {/* Badges */}
          {unlockedBadges.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-500" /> {t('gamification.badges')}
              </p>
              <div className="flex flex-wrap gap-2">
                {unlockedBadges.slice(0, 8).map(badge => (
                  <div
                    key={badge.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-full border border-yellow-200 dark:border-yellow-800 text-xs"
                    title={`${language === 'en' ? badge.name : badge.nameZh}: ${language === 'en' ? badge.description : badge.descriptionZh}`}
                  >
                    <span className="text-sm">{badge.icon}</span>
                    <span className="text-gray-700 dark:text-gray-300 font-medium">{language === 'en' ? badge.name : badge.nameZh}</span>
                  </div>
                ))}
                {unlockedBadges.length > 8 && (
                  <span className="text-xs text-gray-400 self-center">{t('student.dashboard.moreBadges').replace('{n}', String(unlockedBadges.length - 8))}</span>
                )}
              </div>
            </div>
          )}

          {/* 🔥 Streak Fire 動畫 */}
          {weeklyStats.streakDays >= 3 && (
            <div className="flex items-center gap-2 mt-2 text-xs text-orange-500 font-medium">
              <StreakFlame streakDays={weeklyStats.streakDays} size="md" />
              <span>{t('student.dashboard.streak').replace('{n}', String(weeklyStats.streakDays))} 🔥</span>
            </div>
          )}

          {/* 🤖 AI 學習推薦 */}
          {gamification?.stats && (() => {
            const rec = getStudyRecommendation(gamification.stats as unknown as BadgeCheckStats);
            return (
              <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
                <p className="text-xs font-medium text-purple-600 dark:text-purple-400 flex items-center gap-1">
                  💡 {language === 'en' ? 'Today\'s Focus' : '今日推薦'}：{language === 'en' ? rec.focus : rec.focusZh}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{language === 'en' ? rec.reason : rec.reasonZh}</p>
              </div>
            );
          })()}
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => <KpiCard key={i} data={kpi} />)}
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3">{t('student.dashboard.aiInsight')}</h2>
        {aiError && <p className="text-xs text-red-500 mb-2">{aiError}</p>}
        <button
          onClick={async () => {
            setAiLoading(true);
            setAiError('');
            try {
              const res = await fetch('/api/ai/analyze-progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  studentId: userId || undefined,
                  studentLevel: studentLevel,
                  overallAccuracy: weeklyStats.accuracy || 0,
                  weakSkills: getMasteryBySkill().filter(m => m.accuracy < 60),
                  recentPerformance,
                  streakDays: weeklyStats.streakDays || 0,
                }),
              });
              const json = await res.json();
              if (res.ok && json.analysis) {
                setAiInsight(json.analysis);
              } else {
                setAiError(json.error || t('student.dashboard.aiError'));
              }
            } catch {
              setAiError(t('student.dashboard.aiError'));
            } finally {
              setAiLoading(false);
            }
          }}
          disabled={aiLoading}
          className="px-3 py-1.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 rounded-lg disabled:opacity-50 flex items-center gap-1"
        >
          {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {aiLoading ? t('progress.analyzing') : t('student.dashboard.aiAnalysis')}
        </button>
        {aiInsight && <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{aiInsight.summary}</p>}
      </div>
    </div>
  );

  // Wrap with OnboardingGuard for new students
  if (studentId && !gamificationLoading) {
    return (
      <OnboardingGuard studentId={studentId}>
        {dashboardContent}
      </OnboardingGuard>
    );
  }

  return dashboardContent;
}
