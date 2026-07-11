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
  const [recentPerformance, setRecentPerformance] = useState<{ date: string; accuracy: number; questionsDone: number }[]>([]);

  // 載入練習歷史（解決重整後數據歸零）
  useEffect(() => {
    loadPracticeHistory();
    // 取得學生實際年級 + 近期練習記錄
    fetch('/api/auth/profile').then(r => r.json()).then(d => {
      const level = d?.user?.level || d?.user?.class?.gradeLevel;
      if (level && ['S1','S2','S3','S4','S5','S6'].includes(level)) setStudentLevel(level);
      const userId = d?.user?.id || '';
      if (userId) {
        return fetch(`/api/practice?studentId=${encodeURIComponent(userId)}`).then(r => r.json());
      }
    }).then(data => {
      if (data?.sessions) {
        setRecentPerformance(data.sessions.slice(0, 5).map((s: any) => ({
          date: new Date(s.startedAt).toLocaleDateString('zh-HK'),
          accuracy: Math.round((s.correctCount / Math.max(1, s.totalQuestions)) * 100),
          questionsDone: s.totalQuestions,
        })));
      }
    }).catch(() => {});
  }, [loadPracticeHistory]);

  const weeklyStats = getWeeklyStats();
  const kpis = [
    { label: t('progress.weeklyLabel'), value: weeklyStats.questionsDone || 0, unit: t('common.question'), trend: 'up' as const, change: 0 },
    { label: t('progress.accuracyLabel'), value: weeklyStats.accuracy || 0, unit: t('common.percent'), trend: 'stable' as const, change: 0 },
    { label: t('progress.sessionsLabel'), value: weeklyStats.sessionsCount || 0, unit: t('common.sessions'), trend: 'up' as const, change: 0 },
    { label: t('student.streak'), value: weeklyStats.streakDays || 0, unit: t('common.days'), trend: 'stable' as const, change: 0 },
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
                recentPerformance,
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
