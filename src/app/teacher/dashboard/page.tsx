// ============================================
// 教師端首頁 Dashboard — 真實資料版
// ============================================
'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Users, BarChart3, ChevronRight, BookOpen, Sparkles, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import KpiCard from '@/components/shared/KpiCard';
import { useT } from '@/hooks/use-i18n';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ClassInfo } from '@/lib/types';

interface StudentBrief {
  id: string;
  nameZh?: string;
  nameEn?: string;
  overallAccuracy?: number | null;
  class?: { name: string } | null;
}

export default function TeacherDashboardPage() {
  const { t } = useT();
  const { userDisplayName } = useAppStore();
  const displayName = userDisplayName || t('common.teacherFallback');

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/classes').then(r => r.json()),
      fetch('/api/teacher/students').then(r => r.json().catch(() => ({ students: [] as StudentBrief[] }))),
    ])
      .then(([classData, studentData]) => {
        const classList: ClassInfo[] = classData.classes || [];
        const students: StudentBrief[] = studentData.students || [];
        // Enrich classes with accuracy data from students
        const enriched: ClassInfo[] = classList.map((c) => {
          const classStudents = students.filter((s) => s.class?.name === c.name);
          const accuracies = classStudents
            .map((s) => s.overallAccuracy)
            .filter((a): a is number => a != null);
          const avgAcc = accuracies.length > 0
            ? Math.round(accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length)
            : 0;
          return { ...c, avgAccuracy: avgAcc };
        });
        setClasses(enriched);
      })
      .catch(() => {
        setClasses([]);
        setLoadError(t('common.somethingWrong'));
      })
      .finally(() => setLoading(false));
  }, []);

  // Build KPI cards from real class data
  const totalStudents = classes.reduce((sum, c) => sum + (c.studentCount || 0), 0);
  const overallAvgAccuracy = classes.length > 0
    ? Math.round(classes.reduce((sum, c) => sum + (c.avgAccuracy || 0), 0) / classes.length)
    : 0;
  // 計算真實的平均完成率（從班級數據中獲取）
  const avgCompletionRate = classes.length > 0
    ? Math.round(classes.reduce((sum, c) => sum + ((c as any).completionRate || 0), 0) / classes.length)
    : 0;
  const kpis = [
    { label: t('teacher.classCount'), value: classes.length, unit: t('generic.classes'), trend: 'stable' as const },
    { label: t('teacher.avgAccuracy'), value: overallAvgAccuracy || '—', unit: '%', trend: 'stable' as const },
    { label: t('teacher.studentCount'), value: totalStudents, unit: t('generic.people'), trend: 'stable' as const },
    { label: t('teacher.completionRate'), value: `${avgCompletionRate || 0}`, unit: '%', trend: 'stable' as const },
  ];

  // Class chart data from real classes with accuracy
  const classChartData = classes.slice(0, 8).map((c) => ({
    name: c.name,
    [t('teacher.avgAccuracy')]: c.avgAccuracy || 0,
    [t('teacher.studentCount')]: c.studentCount || 0,
  }));

  // AI advice
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string>('');
  const [aiError, setAiError] = useState('');

  const handleAITeachingAdvice = async () => {
    setAiLoading(true); setAiError(''); setAiAdvice('');
    try {
      const res = await fetch('/api/ai/analyze-progress', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentLevel: classes[0]?.gradeLevel || 'S4', overallAccuracy: overallAvgAccuracy || 0,
          weakSkills: classes.slice(0, 3).map((c) => ({ name: c.name, nameZh: c.name, accuracy: c.avgAccuracy || 0 })),
          recentPerformance: classes.slice(0, 5).map((c) => ({ date: c.name, accuracy: c.avgAccuracy || 0, questionsDone: c.studentCount || 0 })), streakDays: 0,
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) setAiAdvice(json.analysis.summary + '\n\n' + (json.analysis.studyPlan || ''));
      else setAiError(json.error || t('teacher.aiUnavailable'));
    } catch { setAiError(t('teacher.aiConnectionFailed')); }
    finally { setAiLoading(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {loadError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-red-600 dark:text-red-400 underline hover:no-underline shrink-0"
          >
            {t('common.reloadPage')}
          </button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.dashboard.title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('teacher.greeting', { name: displayName })}</p>
      </div>

      {/* KPI */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((kpi, i) => <KpiCard key={i} data={kpi} />)}
        </div>
      )}

      {/* Class chart + AI advice */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" /> {t('teacher.classCompletion')}
          </h2>
          {classChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={classChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey={t('teacher.completionRate')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey={t('teacher.avgAccuracy')} fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-16">{t('generic.noData')}</p>
          )}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" /> {t('teacher.aiAdvice')}
          </h2>
          {aiAdvice ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{aiAdvice}</p>
              <button onClick={handleAITeachingAdvice} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> {t('teacher.reanalyze')}
              </button>
            </div>
          ) : aiError ? (
            <div className="space-y-3">
              <p className="text-sm text-red-500">{aiError}</p>
              <button onClick={handleAITeachingAdvice} className="text-xs text-blue-600 hover:underline">{t('admin.reports.retry')}</button>
            </div>
          ) : (
            <button
              onClick={handleAITeachingAdvice}
              disabled={aiLoading}
              className="w-full py-3 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-xl text-sm font-medium hover:bg-purple-100 dark:hover:bg-purple-900/30 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {aiLoading ? t('teacher.analyzing') : t('teacher.getAiAdvice')}
            </button>
          )}
        </section>
      </div>

      {/* Recent tasks + Quick links */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-red-500" /> {t('teacher.atRiskStudents')}
            </h2>
            <Link href="/teacher/students" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              {t('common.viewAll')} <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {classes.slice(0, 4).map((c) => (
              <Link key={c.id} href={`/teacher/classes/${c.id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300 flex-shrink-0">
                  {c.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{c.studentCount || 0} {t('teacher.classCount').toLowerCase()}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
            ))}
            {classes.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{t('generic.noData')}</p>}
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-500" /> {t('teacher.recentTasks')}
            </h2>
            <Link href="/teacher/assignments" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              {t('common.viewAll')} <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            <Link href="/teacher/assignments/new" className="block p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30">
              + {t('teacher.newAssignment')}
            </Link>
            <Link href="/teacher/import" className="block p-3 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm font-medium hover:bg-green-100 dark:hover:bg-green-900/30">
              + {t('teacher.import.title')}
            </Link>
            <Link href="/teacher/materials" className="block p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-sm font-medium hover:bg-purple-100 dark:hover:bg-purple-900/30">
              + {t('teacher.uploadMaterial')}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
