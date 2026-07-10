// Student Dashboard
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Play, Sparkles, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';
import KpiCard from '@/components/shared/KpiCard';
import { getGreeting } from '@/lib/utils';

export default function StudentDashboardPage() {
  const { userDisplayName, getWeeklyStats, getMasteryBySkill, loadPracticeHistory } = useAppStore();
  const { t } = useT();
  const displayName = userDisplayName || 'Student';
  const [aiInsight, setAiInsight] = useState<any>(null);
  const [studentLevel, setStudentLevel] = useState('S4');

  // 載入練習歷史（解決重整後數據歸零）
  useEffect(() => {
    loadPracticeHistory();
    // 取得學生實際年級
    fetch('/api/auth/profile').then(r => r.json()).then(d => {
      if (d?.level) setStudentLevel(d.level);
    }).catch(() => {});
  }, [loadPracticeHistory]);

  const weeklyStats = getWeeklyStats();
  const kpis = [
    { label: '本週練習', value: weeklyStats.questionsDone || 0, unit: '題', trend: 'up' as const, change: 0 },
    { label: '正確率', value: weeklyStats.accuracy || 0, unit: '%', trend: 'stable' as const, change: 0 },
    { label: '練習次數', value: weeklyStats.sessionsCount || 0, unit: '次', trend: 'up' as const, change: 0 },
    { label: '連續天數', value: weeklyStats.streakDays || 0, unit: '天', trend: 'stable' as const, change: 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-teal-500 to-teal-600 rounded-2xl p-6 text-white">
        <p className="text-teal-100 text-sm">{getGreeting()}, {displayName}!</p>
        <h1 className="text-2xl font-bold mt-1">{t('student.dashboard.title')}</h1>
        <Link href="/student/practice" className="mt-3 inline-block px-4 py-2 bg-white text-teal-600 rounded-xl font-medium text-sm">
          <Play className="w-4 h-4 inline mr-1" /> {t('student.dashboard.practice')}
        </Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => <KpiCard key={i} data={kpi} />)}
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3">{t('student.dashboard.aiInsight')}</h2>
        <button
          onClick={async () => {
            const res = await fetch('/api/ai/analyze-progress', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                studentLevel: studentLevel,
                overallAccuracy: weeklyStats.accuracy || 0,
                weakSkills: getMasteryBySkill().filter(m => m.accuracy < 60),
                recentPerformance: [],
                streakDays: weeklyStats.streakDays || 0,
              }),
            });
            const json = await res.json();
            if (res.ok && json.analysis) setAiInsight(json.analysis);
          }}
          className="px-3 py-1.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 rounded-lg"
        >
          <Sparkles className="w-3 h-3 inline mr-1" /> {t('student.dashboard.aiAnalysis')}
        </button>
        {aiInsight && <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{aiInsight.summary}</p>}
      </div>
    </div>
  );
}
