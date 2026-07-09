// ============================================
// 學生端 — 我的進度頁面
// 整合練習記錄、技能掌握度、AI 建議
// ============================================
'use client';

import { useState } from 'react';
import { TrendingUp, Award, Target, Flame, Sparkles, Loader2, Clock } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line,
} from 'recharts';
import KpiCard from '@/components/shared/KpiCard';
import ProgressBar from '@/components/shared/ProgressBar';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';

export default function StudentProgressPage() {
  const store = useAppStore();
  const { t } = useT();
  const weeklyStats = store.getWeeklyStats();
  const masteryBySkill = store.getMasteryBySkill();
  const recentSessions = store.getRecentSessions(5);

  // 合併 KPI（優先使用實際練習數據）
  const kpis = [
    { label: '本週練習量', value: weeklyStats.questionsDone || 32, unit: '題', trend: 'up' as const, change: 0 },
    { label: '正確率', value: weeklyStats.accuracy || 68, unit: '%', trend: 'up' as const, change: 0 },
    { label: '練習次數', value: weeklyStats.sessionsCount || 7, unit: '次', trend: 'stable' as const, change: 0 },
  ];

  // 合併技能掌握度（mock + 實際）
  const displayMastery = masteryBySkill.length > 0
    ? masteryBySkill.map(m => ({ subSkill: m.skillZh, percentage: m.accuracy }))
    : [];

  // 雷達圖資料
  const radarData = [
    { skill: '文法', value: displayMastery.filter(m => ['時態','關係子句','條件句','被動語態'].some(k => m.subSkill.includes(k))).reduce((a,b) => a + b.percentage, 0) / 4 || 60 },
    { skill: '詞彙', value: displayMastery.filter(m => ['詞彙','片語動詞'].some(k => m.subSkill.includes(k))).reduce((a,b) => a + b.percentage, 0) / 2 || 53 },
    { skill: '閱讀', value: displayMastery.filter(m => ['閱讀','主旨','推論'].some(k => m.subSkill.includes(k))).reduce((a,b) => a + b.percentage, 0) / 2 || 57 },
    { skill: '寫作', value: displayMastery.filter(m => ['寫作','文章','書信'].some(k => m.subSkill.includes(k))).reduce((a,b) => a + b.percentage, 0) / 2 || 50 },
    { skill: '改錯', value: displayMastery.filter(m => ['錯誤','辨析'].some(k => m.subSkill.includes(k))).reduce((a,b) => a + b.percentage, 0) / 1 || 60 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('progress.title')}</h1>

      {/* KPI 卡片 */}
      <div className="grid grid-cols-3 gap-3">
        {kpis.map((kpi, i) => <KpiCard key={i} data={kpi} />)}
      </div>

      {/* 練習趨勢圖 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-teal-500" />
          {t('progress.trend')}
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={[]}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <Tooltip />
            <Line type="monotone" dataKey="練習量" stroke="#14b8a6" strokeWidth={2} dot={{ fill: '#14b8a6' }} />
            <Line type="monotone" dataKey="正確率" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b' }} />
          </LineChart>
        </ResponsiveContainer>
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
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Radar dataKey="value" stroke="#14b8a6" fill="#14b8a6" fillOpacity={0.2} />
            </RadarChart>
          </ResponsiveContainer>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t('progress.monthly')}</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={[]} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <YAxis dataKey="skill" type="category" tick={{ fontSize: 12 }} width={60} />
              <Tooltip />
              <Bar dataKey="月初" fill="#d1d5db" radius={[0, 4, 4, 0]} />
              <Bar dataKey="現在" fill="#14b8a6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
                  <p className="text-xs text-gray-400">{s.totalQuestions} 題 · {s.difficulty === 'remedial' ? '補底' : s.difficulty === 'core' ? '核心' : '挑戰'}</p>
                </div>
                <span className="text-lg font-bold text-teal-600">
                  {Math.round((s.correctCount / s.totalQuestions) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 成就徽章 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Award className="w-5 h-5 text-yellow-500" />
          {t('progress.badges')}
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
          {null}
        </div>
      </section>
    </div>
  );
}
