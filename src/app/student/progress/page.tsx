// ============================================
// 學生端 — 我的進度頁面
// 整合練習記錄、技能掌握度、AI 建議
// ============================================
'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Target, Sparkles, Loader2, CalendarDays, ChevronDown } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line,
} from 'recharts';
import KpiCard from '@/components/shared/KpiCard';
import ProgressBar from '@/components/shared/ProgressBar';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';
import { getDifficultyLabel } from '@/shared/utils/nav';
import { hkMonthKey, nextMonthKey, previousMonthKey } from '@/shared/utils/hk-date';
import { formatHistoryMonthLabel, formatHistoryDayLabel, formatHistoryTime } from '@/shared/utils/practice-history-format';

// ============================================
// 練習歷史（逐日回顧）型別與格式化 — 2026-10-01
// 「每日練習次數及類型」由 /api/practice/history 提供（月摘要＝DB 聚合；
// 日明細＝單日有界查詢）。絕不由「最近 N 筆」視窗推算。
// ============================================
interface HistoryDaySkill {
  skill: string;
  skillZh: string;
  sessionsCount: number;
  questionsTotal: number;
}

interface HistoryDay {
  dayKey: string;
  sessionsCount: number;
  questionsTotal: number;
  skills: HistoryDaySkill[];
}

interface HistorySession {
  id: string;
  skill: string;
  skillZh: string;
  difficulty: string;
  totalQuestions: number;
  correctCount: number;
  source: string;
  startedAt: string;
  completedAt: string | null;
  verified:
    | { status: 'verified'; totalQuestions: number; correctCount: number; accuracy: number | null }
    | { status: 'unverifiable'; reason: string };
}

interface HistoryDayDetailState {
  loading: boolean;
  sessions: HistorySession[] | null;
  error: boolean;
}

export default function StudentProgressPage() {
  const store = useAppStore();
  const { t, language } = useT();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<{
    summary: string; urgentAreas: string[]; studyPlan: string; encouragementMessage: string;
  } | null>(null);

  // === 練習歷史（逐日回顧）狀態 ===
  const [historyMonth, setHistoryMonth] = useState('');
  const [historyDays, setHistoryDays] = useState<HistoryDay[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [dayDetails, setDayDetails] = useState<Record<string, HistoryDayDetailState>>({});

  // 載入練習歷史（先確保 session 就緒）
  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    store.initSession()
      .then(() => store.loadPracticeHistory())
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  // 預設顯示香港當前月份（在 effect 設定，避免 SSR/hydration 跨日界線不一致）
  useEffect(() => {
    setHistoryMonth((prev) => prev || hkMonthKey());
  }, []);

  const loadHistoryMonth = useCallback(async (month: string) => {
    if (!store.userId) return;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const res = await fetch(`/api/practice/history?studentId=${encodeURIComponent(store.userId)}&view=month&month=${month}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.days)) {
        setHistoryDays(data.days as HistoryDay[]);
      } else {
        setHistoryDays([]);
        setHistoryError(true);
      }
    } catch {
      setHistoryDays([]);
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, [store.userId]);

  useEffect(() => {
    if (historyMonth) void loadHistoryMonth(historyMonth);
  }, [historyMonth, loadHistoryMonth]);

  const toggleHistoryDay = useCallback((dayKey: string) => {
    setExpandedDay((prev) => (prev === dayKey ? null : dayKey));
    const cached = dayDetails[dayKey];
    if (cached?.sessions || cached?.loading) return;
    setDayDetails((prev) => ({ ...prev, [dayKey]: { loading: true, sessions: null, error: false } }));
    void (async () => {
      try {
        const res = await fetch(`/api/practice/history?studentId=${encodeURIComponent(store.userId ?? '')}&view=day&day=${encodeURIComponent(dayKey)}`);
        const data = await res.json();
        if (res.ok && Array.isArray(data.sessions)) {
          setDayDetails((cur) => ({ ...cur, [dayKey]: { loading: false, sessions: data.sessions as HistorySession[], error: false } }));
        } else {
          setDayDetails((cur) => ({ ...cur, [dayKey]: { loading: false, sessions: null, error: true } }));
        }
      } catch {
        setDayDetails((cur) => ({ ...cur, [dayKey]: { loading: false, sessions: null, error: true } }));
      }
    })();
  }, [dayDetails, store.userId]);

  const weeklyStats = store.getWeeklyStats();
  const masteryBySkill = store.getMasteryBySkill();
  const recentSessions = store.getRecentSessions(5);

  // 合併 KPI（優先使用實際練習數據）
  // R3.10-C.2: 準確率 KPI 只計 verified evidence（由 store 計算）；題數為 engagement 量。
  const kpis = [
    { label: t('progress.weeklyLabel'), value: weeklyStats.questionsDone || 0, unit: t('common.question'), trend: 'up' as const, change: 0 },
    // 2026-09-20 稽核：無已驗證資料時顯示「—」（不得顯示 0%）
    { label: `${t('progress.accuracyLabel')}${store.language === 'en' ? ' (verified)' : '（已驗證）'}`, value: weeklyStats.accuracy === null ? '—' : weeklyStats.accuracy, unit: weeklyStats.accuracy === null ? undefined : t('common.percent'), trend: 'up' as const, change: 0 },
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
  // R3.10-C.2: 題數（engagement）保持原始；準確率只計 verified evidence。
  const trendData = (() => {
    const dayMap = new Map<string, { questions: number; vTotal: number; vCorrect: number }>();
    for (const s of recentSessions) {
      const day = new Date(s.startedAt).toLocaleDateString(
        store.language === 'en' ? 'en-US' : 'zh-HK',
        { month: 'numeric', day: 'numeric' }
      );
      const entry = dayMap.get(day) || { questions: 0, vTotal: 0, vCorrect: 0 };
      entry.questions += s.totalQuestions;
      const v = s.verified;
      if (v && v.status === 'verified') {
        entry.vTotal += v.totalQuestions ?? 0;
        entry.vCorrect += v.correctCount ?? 0;
      }
      dayMap.set(day, entry);
    }
    return Array.from(dayMap.entries()).map(([day, d]) => ({
      day,
      [t('progress.volumeChart')]: d.questions,
      [t('progress.accuracyChart')]: d.vTotal > 0 ? Math.round((d.vCorrect / d.vTotal) * 100) : 0,
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

      {/* 練習歷史 — 逐日回顧（2026-10-01：取代只列最近 5 筆的「最近練習記錄」） */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-teal-500" />
            {t('progress.historyTitle')}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryMonth(previousMonthKey(historyMonth))}
              disabled={!historyMonth || historyLoading}
              aria-label={t('progress.historyPrevMonth')}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              ‹
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[6.5rem] text-center">
              {historyMonth ? formatHistoryMonthLabel(historyMonth, language) : ''}
            </span>
            <button
              type="button"
              onClick={() => setHistoryMonth(nextMonthKey(historyMonth))}
              disabled={!historyMonth || historyMonth >= hkMonthKey() || historyLoading}
              aria-label={t('progress.historyNextMonth')}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>

        {historyLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
          </div>
        )}

        {!historyLoading && historyError && (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-500 mb-3">{t('progress.loadFailed')}</p>
            <button
              type="button"
              onClick={() => historyMonth && void loadHistoryMonth(historyMonth)}
              className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm"
            >
              {t('progress.retry')}
            </button>
          </div>
        )}

        {!historyLoading && !historyError && historyDays && historyDays.length === 0 && (
          <p className="text-sm text-gray-400 py-8 text-center">{t('progress.historyEmpty')}</p>
        )}

        {!historyLoading && !historyError && historyDays && historyDays.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-2">{t('progress.historyDayHint')}</p>
            {historyDays.map((day) => {
              const detail = dayDetails[day.dayKey];
              const isExpanded = expandedDay === day.dayKey;
              return (
                <div key={day.dayKey} className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleHistoryDay(day.dayKey)}
                    aria-expanded={isExpanded}
                    className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{formatHistoryDayLabel(day.dayKey, language)}</span>
                        <span className="text-xs text-gray-400">
                          {day.sessionsCount} {t('common.sessions')} · {day.questionsTotal}{t('progress.questionsSuffix')}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {day.skills.map((skill) => (
                          <span
                            key={skill.skill}
                            className="text-[11px] px-2 py-0.5 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 rounded-full"
                          >
                            {skill.skillZh || skill.skill} ×{skill.sessionsCount}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2">
                      {detail?.loading && (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                        </div>
                      )}
                      {!detail?.loading && detail?.error && (
                        <p className="text-xs text-gray-400 py-3 text-center">{t('progress.loadFailed')}</p>
                      )}
                      {!detail?.loading && detail?.sessions && detail.sessions.length === 0 && (
                        <p className="text-xs text-gray-400 py-3 text-center">{t('progress.historyEmptyDay')}</p>
                      )}
                      {!detail?.loading && detail?.sessions && detail.sessions.length > 0 && (
                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                          {detail.sessions.map((s) => (
                            <div key={s.id} className="flex items-center justify-between gap-3 py-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-gray-400">{formatHistoryTime(s.startedAt)}</span>
                                  <span className="text-sm text-gray-700 dark:text-gray-300">{s.skillZh || s.skill}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full">
                                    {getDifficultyLabel(s.difficulty, store.language)}
                                  </span>
                                  {s.source === 'ai-generated' && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-full">AI</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">{s.totalQuestions}{t('progress.questionsSuffix')}</p>
                              </div>
                              <span className="text-sm font-semibold text-teal-600 shrink-0">
                                {s.verified.status === 'verified'
                                  ? `${Math.round(((s.verified.correctCount ?? 0) / Math.max(1, s.verified.totalQuestions ?? 0)) * 100)}%`
                                  : (
                                    <span className="text-xs font-medium text-gray-400">{t('progress.unverified')}</span>
                                  )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* AI 個人化分析 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          {t('progress.aiAnalysis')}
        </h2>
        {!aiAnalysis ? (
          <>
            <p className="text-xs text-gray-400 mb-3">
              {t('progress.aiClickToAnalyze')}
            </p>
            <button
              onClick={async () => {
                setAiLoading(true);
                setAiError('');
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 30_000);
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
                      // R3.10-C.2: 只送 verified row-derived 資料；不可驗證 session 不產生資料點。
                      recentPerformance: recentSessions.slice(0, 7).flatMap(s => {
                        const v = s.verified;
                        if (!v || v.status !== 'verified') return [];
                        return [{
                          date: new Date(s.startedAt).toLocaleDateString(),
                          accuracy: Math.round(((v.correctCount ?? 0) / Math.max(1, v.totalQuestions ?? 0)) * 100),
                          questionsDone: v.totalQuestions ?? 0,
                        }];
                      }),
                      streakDays: weeklyStats.streakDays || 0,
                    }),
                    signal: controller.signal,
                  });
                  clearTimeout(timeout);
                  const data = await res.json();
                  if (data.analysis) {
                    setAiAnalysis(data.analysis);
                  } else {
                    setAiError(data.error || t('progress.aiError'));
                  }
                } catch (err: unknown) {
                  if (err instanceof DOMException && err.name === 'AbortError') {
                    setAiError(t('progress.aiTimeout'));
                  } else {
                    setAiError(t('progress.aiError'));
                  }
                } finally {
                  clearTimeout(timeout);
                  setAiLoading(false);
                }
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
