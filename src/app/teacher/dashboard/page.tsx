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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { ClassInfo } from '@/shared/types/types';

interface StudentBrief {
  id: string;
  nameZh?: string;
  nameEn?: string;
  overallAccuracy?: number | null;
  class?: { name: string } | null;
  lastActiveAt?: string | null;
  /** 2026-09-21：伺服器計算的活動狀態（單一門檻 owner） */
  daysInactive?: number | null;
  activityStatus?: 'never-started' | 'inactive' | 'low' | 'active';
  _count?: { sessions?: number; writingDrafts?: number };
}

interface AssignmentBrief {
  classId?: string | null;
  completionRate?: number | null;
}

/** 班級練習數據（GET /api/teacher/class-stats；見 class-stats-service.ts 契約） */
interface ClassPracticeStats {
  classId: string;
  className: string;
  gradeLevel: string;
  studentCount: number;
  participantCount: number;
  /** 0-100；null = 名單為空（顯示「—」） */
  participationRate: number | null;
  /** 完成次數（全歷史練習場次） */
  sessionsCount: number;
  /** 0-100；null = 無可驗證證據（顯示「—」，不得當 0%） */
  accuracy: number | null;
}

/** 百分比顯示；null（無資料）一律「—」，不得顯示 0% */
function formatPercent(value: number | null | undefined): string {
  return value == null ? '—' : `${value}%`;
}

/** 圖表 tooltip：一次顯示該班全部數據（完成次數／參與人數／參與率／正確率） */
function ClassStatsTooltip({
  active, payload, t,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ClassPracticeStats & { displayName?: string } }>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-gray-900 dark:text-white mb-1">{row.displayName || row.className || t('teacher.classStats.unnamedClass')}</p>
      <div className="space-y-0.5 text-gray-600 dark:text-gray-300">
        <p>{t('teacher.studentCount')}: {row.studentCount}</p>
        <p>{t('teacher.classStats.participants')}: {row.participantCount}</p>
        <p>{t('teacher.classStats.completions')}: {row.sessionsCount}</p>
        <p>{t('teacher.classStats.participationRate')}: {formatPercent(row.participationRate)}</p>
        <p>{t('teacher.tableAccuracy')}: {formatPercent(row.accuracy)}</p>
      </div>
    </div>
  );
}

/** Days since last activity; null = unknown (never active / no data). */
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.floor((Date.now() - d) / 86400000);
}

export default function TeacherDashboardPage() {
  const { t } = useT();
  const { userDisplayName } = useAppStore();
  const displayName = userDisplayName || t('common.teacherFallback');

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [students, setStudents] = useState<StudentBrief[]>([]);
  const [assignments, setAssignments] = useState<AssignmentBrief[]>([]);
  // 2026-10-01：班級練習數據（全校每班一列；不再以「最新 8 班」在客戶端拼圖表）
  const [classStats, setClassStats] = useState<ClassPracticeStats[]>([]);
  const [classStatsError, setClassStatsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/classes').then(r => r.json()),
      fetch('/api/teacher/students').then(r => r.json().catch(() => ({ students: [] as StudentBrief[] }))),
      fetch('/api/assignments').then(r => r.json().catch(() => ({ assignments: [] as AssignmentBrief[] }))),
      fetch('/api/teacher/class-stats')
        .then(async (res) => {
          const json = await res.json().catch(() => ({ classes: [] as ClassPracticeStats[] }));
          return { ok: res.ok, classes: (json.classes || []) as ClassPracticeStats[] };
        })
        .catch(() => ({ ok: false, classes: [] as ClassPracticeStats[] })),
    ])
      .then(([classData, studentData, assignmentData, statsData]) => {
        const classList: ClassInfo[] = classData.classes || [];
        setStudents(studentData.students || []);
        setAssignments(assignmentData.assignments || []);
        setClasses(classList);
        setClassStats(statsData.classes);
        // 查詢失敗 ≠ 沒有班別數據：分開標示，不得混為一談
        setClassStatsError(!statsData.ok);
      })
      .catch(() => {
        setClasses([]);
        setLoadError(t('common.somethingWrong'));
      })
      .finally(() => setLoading(false));
  }, [t]);

  // Build KPI cards from real class data
  const totalStudents = classes.reduce((sum, c) => sum + (c.studentCount || 0), 0);
  const scoredStudents = students.filter((student): student is StudentBrief & { overallAccuracy: number } => student.overallAccuracy != null);
  const overallAvgAccuracy = scoredStudents.length > 0
    ? Math.round(scoredStudents.reduce((sum, student) => sum + student.overallAccuracy, 0) / scoredStudents.length)
    : null;
  const assignmentsWithRate = assignments.filter((assignment): assignment is AssignmentBrief & { completionRate: number } => assignment.completionRate != null);
  const avgCompletionRate = assignmentsWithRate.length > 0
    ? Math.round(assignmentsWithRate.reduce((sum, assignment) => sum + assignment.completionRate, 0) / assignmentsWithRate.length)
    : null;

  // Sprint 133: behavior-based monitoring — disengagement first
  // 2026-09-21：優先採用伺服器計算的狀態；「從未開始」與「長期未活動」
  // 在 UI 上分開顯示（教學處理不同）。
  const isInactive = (s: StudentBrief) => {
    if (s.activityStatus) return s.activityStatus === 'inactive' || s.activityStatus === 'never-started';
    const days = s.daysInactive ?? daysSince(s.lastActiveAt);
    if (days === null) return (s._count?.sessions ?? 0) === 0;
    return days >= 14;
  };
  const inactiveStudents = students.filter(isInactive);
  // 無可驗證證據（overallAccuracy = null）**不得**當成 0% 列入低準確率；
  // 那類學生屬「未開始／無資料」，已在失聯名單處理。
  const lowAccuracyStudents = students.filter(s =>
    s.overallAccuracy != null && s.overallAccuracy < 50 && (s._count?.sessions ?? 0) >= 1,
  );
  const atRiskByStudentId = new Map<string, StudentBrief & { kind: 'inactive' | 'low' }>();
  for (const student of lowAccuracyStudents) atRiskByStudentId.set(student.id, { ...student, kind: 'low' });
  for (const student of inactiveStudents) atRiskByStudentId.set(student.id, { ...student, kind: 'inactive' });
  const atRiskList = Array.from(atRiskByStudentId.values());
  const inactiveCount = inactiveStudents.length;

  // 2026-10-01：圖表與明細表直接使用伺服器端聚合（全校所有班別）。
  // 舊碼只取 `classes.slice(0, 8)` 並以作業完成率／學生快取準確率在客戶端拼合
  // → 第 9 班之後的班別不存在、沒有作業的班別整條棒空白（用戶回報）。
  const hasClassStats = classStats.length > 0 && !classStatsError;
  // KPI「班級數／學生人數」與下方總覽同源：教師帳號未有 TeacherClass 連結時
  // `/api/classes` 為空 → 舊 KPI 會顯示 0 班 0 人，與全校圖表自相矛盾。
  const classCountKpi = hasClassStats ? classStats.length : classes.length;
  const studentCountKpi = hasClassStats
    ? classStats.reduce((sum, c) => sum + c.studentCount, 0)
    : totalStudents;
  // 未命名班別（資料庫存在 name='' 的匯入殘留）顯示型別安全的名稱
  const classNameOf = (c: ClassPracticeStats) => (c.className?.trim() ? c.className : t('teacher.classStats.unnamedClass'));
  const classChartData = classStats.map((c) => ({ ...c, displayName: classNameOf(c) }));
  const weakestClasses = classStats
    .filter((c): c is ClassPracticeStats & { accuracy: number } => c.accuracy != null)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);

  const kpis = [
    { label: t('teacher.classCount'), value: classCountKpi, unit: t('generic.classes'), trend: 'stable' as const },
    { label: t('teacher.avgAccuracy'), value: overallAvgAccuracy ?? '—', unit: overallAvgAccuracy === null ? '' : '%', trend: 'stable' as const },
    { label: t('teacher.studentCount'), value: studentCountKpi, unit: t('generic.people'), trend: 'stable' as const },
    { label: t('teacher.completionRate'), value: avgCompletionRate ?? '—', unit: avgCompletionRate === null ? '' : '%', trend: 'stable' as const },
    { label: t('teacher.dashboard.inactiveStudents'), value: inactiveCount, unit: t('generic.people'), trend: 'stable' as const },
  ];

  // AI advice
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string>('');
  const [aiError, setAiError] = useState('');

  const handleAITeachingAdvice = async () => {
    // 2026-09-21：「無資料 ≠ 0」。舊碼送 `overallAvgAccuracy ?? 0`，
    // 令 AI 以「全班準確率 0%」為前提給建議（假前提、假建議）。
    if (overallAvgAccuracy === null) {
      setAiError(t('teacher.dashboard.notEnoughDataForAdvice'));
      return;
    }
    setAiLoading(true); setAiError(''); setAiAdvice('');
    try {
      const res = await fetch('/api/ai/analyze-progress', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentLevel: classes[0]?.gradeLevel || 'S4', overallAccuracy: overallAvgAccuracy,
          // 2026-10-01：改用伺服器聚合數據（全歷史已驗證正確率；完成量＝練習場次）
          weakSkills: weakestClasses.map((c) => ({ name: c.className, nameZh: c.className, accuracy: c.accuracy })),
          recentPerformance: classStats.filter((c): c is ClassPracticeStats & { accuracy: number } => c.accuracy != null).slice(0, 5).map((c) => ({ date: c.className, accuracy: c.accuracy, questionsDone: c.sessionsCount })), streakDays: 0,
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {kpis.map((kpi, i) => <KpiCard key={i} data={kpi} />)}
        </div>
      )}

      {/* Class overview (all classes) + AI advice */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 lg:col-span-2">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" /> {t('teacher.classStats.title')}
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-4">{t('teacher.classStats.caption')}</p>
          {classStatsError ? (
            <p className="text-sm text-red-500 text-center py-16">{t('teacher.classStats.loadFailed')}</p>
          ) : classChartData.length > 0 ? (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={classChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="displayName" tick={{ fontSize: 11 }} interval={0} angle={-40} textAnchor="end" height={48} />
                  <YAxis yAxisId="rate" tick={{ fontSize: 12 }} domain={[0, 100]} unit="%" />
                  {/* 練習次數是「次」不是百分比 → 另設右軸，否則 0-100% 的尺度會把它壓平 */}
                  <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip content={<ClassStatsTooltip t={t} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="count" dataKey="sessionsCount" name={t('teacher.classStats.completions')} fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="rate" dataKey="participationRate" name={t('teacher.classStats.participationRate')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="rate" dataKey="accuracy" name={t('teacher.tableAccuracy')} fill="#14b8a6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* 每個班別明細（全校；可滾動；完成次數／正確率／參與人數／參與率） */}
              <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-100 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left py-2 px-3 font-medium text-gray-500">{t('teacher.classStats.className')}</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-500">{t('teacher.studentCount')}</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-500">{t('teacher.classStats.participants')}</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-500">{t('teacher.classStats.participationRate')}</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-500">{t('teacher.classStats.completions')}</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-500">{t('teacher.tableAccuracy')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classChartData.map((c) => (
                      <tr key={c.classId} className="border-b border-gray-50 dark:border-gray-700/50">
                        <td className="py-2 px-3 font-medium text-gray-900 dark:text-white">{c.displayName}</td>
                        <td className="py-2 px-2 text-center text-gray-600 dark:text-gray-300">{c.studentCount}</td>
                        <td className="py-2 px-2 text-center text-gray-600 dark:text-gray-300">{c.participantCount}</td>
                        <td className="py-2 px-2 text-center text-gray-600 dark:text-gray-300">{formatPercent(c.participationRate)}</td>
                        <td className="py-2 px-2 text-center text-gray-600 dark:text-gray-300">{c.sessionsCount}</td>
                        <td className="py-2 px-3 text-center">
                          {c.accuracy != null ? (
                            <span className={`font-medium ${c.accuracy >= 70 ? 'text-green-600' : c.accuracy >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {c.accuracy}%
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
              {atRiskList.length > 0 && (
                <span className="text-xs font-normal text-gray-400">({atRiskList.length})</span>
              )}
            </h2>
            {/* 2026-09-21：「查看全部」必須帶入篩選，否則第 7 名之後的高風險學生
                在 UI 上等於不存在（舊碼只連到無篩選的完整名單）。 */}
            <Link href="/teacher/students?risk=inactive" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              {atRiskList.length > 6
                ? t('teacher.dashboard.viewAllAtRisk', { n: atRiskList.length })
                : t('common.viewAll')} <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {atRiskList.slice(0, 6).map((s) => {
              const days = s.daysInactive ?? daysSince(s.lastActiveAt);
              return (
              <Link key={s.id} href={`/teacher/students/${s.id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300 flex-shrink-0">
                  {(s.nameZh || s.nameEn || '?').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{s.nameZh || s.nameEn}</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {s.kind === 'inactive'
                      ? (days === null ? t('teacher.dashboard.neverActive') : t('teacher.dashboard.inactiveDays', { n: days }))
                      : `${t('teacher.dashboard.lowAccuracy')} · ${s.overallAccuracy != null ? `${Math.round(s.overallAccuracy)}%` : '—'}`}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.kind === 'inactive' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
                  {s.kind === 'inactive' ? t('teacher.students.inactive') : t('teacher.dashboard.lowAccuracy')}
                </span>
              </Link>
              );
            })}
            {atRiskList.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{t('teacher.dashboard.atRiskEmpty')}</p>}
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
