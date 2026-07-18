// ============================================
// 學生端 — 我的進度頁面
// 整合練習記錄、技能掌握度、AI 建議
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, Target, Flame, Sparkles, Loader2, Clock } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line,
} from 'recharts';
import KpiCard from '@/components/shared/KpiCard';
import ProgressBar from '@/components/shared/ProgressBar';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';
import { getDifficultyLabel } from '@/shared/utils/nav';

export default function StudentProgressPage() {
  const store = useAppStore();
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<{
    summary: string; urgentAreas: string[]; studyPlan: string; encouragementMessage: string;
  } | null>(null);

  // 載入練習歷史（先確保 session 就緒）
  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    store.initSession()
      .then(() => store.loadPracticeHistory())
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const weeklyStats = store.getWeeklyStats();
  const masteryBySkill = store.getMasteryBySkill();
  const recentSessions = store.getRecentSessions(5);

  // 合併 KPI（優先使用實際練習數據）
  const kpis = [
    { label: t('progress.weeklyLabel'), value: weeklyStats.questionsDone || 0, unit: t('common.question'), trend: 'up' as const, change: 0 },
    { label: t('progress.accuracyLabel'), value: weeklyStats.accuracy || 0, unit: t('common.percent'), trend: 'up' as const, change: 0 },
    { label: t('progress.sessionsLabel'), value: weeklyStats.sessionsCount || 0, unit: t('common.sessions'), trend: 'stable' as const, change: 0 },
  ];

  // 合併技能掌握度（mock + 實際）
  const displayMastery = masteryBySkill.length > 0
    ? masteryBySkill.map(m => ({ subSkill: m.skillZh, percentage: m.accuracy }))
    : [];

  // 雷達圖資料 — 直接使用真實技能數據，無數據時為空
  const radarData = displayMastery.length > 0
    ? displayMastery.slice(0, 6).map(m => ({ skill: m.subSkill, value: m.percentage }))
    : [];

  // 練習趨勢圖 — 由最近練習記錄生成（按日期分組）
  const trendData = (() => {
    const dayMap = new Map<string, { questions: number; correct: number }>();
    for (const s of recentSessions) {
      const day = new Date(s.startedAt).toLocaleDateString(
        store.language === 'en' ? 'en-US' : 'zh-HK',
        { month: 'numeric', day: 'numeric' }
      );
      const entry = dayMap.get(day) || { questions: 0, correct: 0 };
      entry.questions += s.totalQuestions;
      entry.correct += s.correctCount;
      dayMap.set(day, entry);
    }
    return Array.from(dayMap.entries()).map(([day, d]) => ({
      day,
      [t('progress.volumeChart')]: d.questions,
      [t('progress.accuracyChart')]: d.questions > 0 ? Math.round((d.correct / d.questions) * 100) : 0,
    }));
  })();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('progress.title')}</h1>

      {/* 載入中 */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
      )}

      {/* 載入失敗 */}
      {!loading && loadError && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center shadow-sm border">
          <p className="text-gray-500 mb-3">{t('progress.loadFailed')}</p>
          <button onClick={() => { setLoading(true); setLoadError(false); store.initSession().then(() => store.loadPracticeHistory()).finally(() => setLoading(false)); }} className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm">{t('progress.retry')}</button>
        </div>
      )}

      {!loading && !loadError && (<>
      {/* KPI 卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {kpis.map((kpi, i) => <KpiCard key={i} data={kpi} />)}
      </div>

      {/* 練習趨勢圖 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-teal-500" />
          {t('progress.trend')}
        </h2>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip />
              <Line type="monotone" dataKey={t('progress.volumeChart')} stroke="#14b8a6" strokeWidth={2} dot={{ fill: '#14b8a6' }} />
              <Line type="monotone" dataKey={t('progress.accuracyChart')} stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b' }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[220px] text-sm text-gray-400">
            {t('progress.emptyTrend')}
          </div>
        )}
      </section>

      {/* 技能掌握度 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-teal-500" />
          {t('progress.skillMastery')}
        </h2>
        <div className="space-y-3">
          {displayMastery.map((m, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-28 flex-shrink-0">
                <span className="text-xs text-gray-600 dark:text-gray-400">{m.subSkill}</span>
              </div>
              <div className="flex-1">
                <ProgressBar value={m.percentage} size="sm" showPercentage={true} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 雷達圖 + 進步對比 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t('progress.radar')}</h2>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar dataKey="value" stroke="#14b8a6" fill="#14b8a6" fillOpacity={0.2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-sm text-gray-400">
              {t('progress.emptyRadar')}
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t('progress.monthly')}</h2>
          {displayMastery.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={displayMastery.map(m => ({ skill: m.subSkill, [t('progress.accuracyChart')]: m.percentage }))} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis dataKey="skill" type="category" tick={{ fontSize: 12 }} width={80} />
                <Tooltip />
                <Bar dataKey={t('progress.accuracyChart')} fill="#14b8a6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-sm text-gray-400">
              {t('progress.emptyBar')}
            </div>
          )}
        </section>
      </div>

      {/* 最近練習記錄 */}
      {recentSessions.length > 0 && (
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-teal-500" />
            {t('progress.recentSessions')}
          </h2>
          <div className="space-y-2">
            {recentSessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.skillZh}</span>
                    {s.source === 'ai-generated' && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-full">AI</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">{s.totalQuestions} {t('progress.questionsSuffix')}{getDifficultyLabel(s.difficulty, store.language)}</p>
                </div>
                <span className="text-lg font-bold text-teal-600">
                  {Math.round((s.correctCount / s.totalQuestions) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* AI 個人化分析 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          {t('progress.aiAnalysis')}
        </h2>
        {!aiAnalysis ? (
          <>
            <button
              onClick={async () => {
                setAiLoading(true);
                setAiError('');
                try {
                  const weakSkills = masteryBySkill
                    .filter(m => m.accuracy < 70)
                    .map(m => ({ name: m.skillZh, nameZh: m.skillZh, accuracy: m.accuracy }));
                  const res = await fetch('/api/ai/analyze-progress', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      studentId: store.userId,
                      studentLevel: 'S4',
                      overallAccuracy: weeklyStats.accuracy || 0,
                      weakSkills: weakSkills.length > 0 ? weakSkills : [{ name: 'general', nameZh: '綜合', accuracy: weeklyStats.accuracy || 50 }],
                      recentPerformance: recentSessions.slice(0, 7).map(s => ({
                        date: new Date(s.startedAt).toLocaleDateString(),
                        accuracy: Math.round((s.correctCount / Math.max(1, s.totalQuestions)) * 100),
                        questionsDone: s.totalQuestions,
                      })),
                      streakDays: weeklyStats.streakDays || 0,
                    }),
                  });
                  const data = await res.json();
                  if (data.analysis) {
                    setAiAnalysis(data.analysis);
                  } else {
                    setAiError(data.error || t('progress.aiError'));
                  }
                } catch {
                  setAiError(t('progress.aiError'));
                } finally { setAiLoading(false); }
              }}
              disabled={aiLoading}
              className="w-full py-3 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-xl text-sm font-medium hover:bg-purple-100 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {aiLoading ? t('progress.analyzing') : t('progress.generateAnalysis')}
            </button>
            {aiError && <p className="text-xs text-red-500 mt-2">{aiError}</p>}
          </>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-gray-700 dark:text-gray-300">{aiAnalysis.summary}</p>
            {aiAnalysis.urgentAreas?.length > 0 && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="font-medium text-red-700 dark:text-red-400 text-xs mb-1">{t('progress.urgentAreas')}</p>
                <ul className="list-disc list-inside text-xs text-red-600 dark:text-red-300 space-y-0.5">
                  {aiAnalysis.urgentAreas.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
            {aiAnalysis.studyPlan && (
              <div className="p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
                <p className="font-medium text-teal-700 dark:text-teal-400 text-xs mb-1">{t('progress.studyPlan')}</p>
                <p className="text-xs text-teal-600 dark:text-teal-300 whitespace-pre-wrap">{aiAnalysis.studyPlan}</p>
              </div>
            )}
            {aiAnalysis.encouragementMessage && (
              <p className="text-purple-600 dark:text-purple-400 font-medium">💜 {aiAnalysis.encouragementMessage}</p>
            )}
          </div>
        )}
      </section>

      </>)}
    </div>
  );
}
