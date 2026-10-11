// ============================================
// 管理員數據儀表板 — /admin/reports
// 使用 Recharts 顯示全校統計圖表
// ============================================
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  TrendingUp, Users, BookOpen, AlertTriangle,
  RefreshCw, GraduationCap, Target,
} from 'lucide-react';

import { useT } from '@/hooks/use-i18n';

// ---- Types ----
interface StatsData {
  overview: {
    totalStudents: number;
    totalTeachers: number;
    totalAdmins: number;
    totalSessions: number;
    totalMistakes: number;
    totalAssignments: number;
  };
  byLevel: { level: string; studentCount: number; avgAccuracy: number | null }[];
  byClass: { className: string; gradeLevel: string; studentCount: number; avgAccuracy: number | null }[];
  monthlyTrend: { month: string; sessions: number; accuracy: number | null }[];
  accuracyDistribution: { range: string; count: number }[];
}

const COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee'];
const LEVEL_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088fe', '#00C49F'];

// ---- Stat Card ----
function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string; value: number | string;
  icon: React.ComponentType<{ className?: string }>; color: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

// ---- Custom Tooltip ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium text-gray-700 dark:text-gray-300">{label}</p>
        {payload.map((p: { name?: string; value?: unknown; dataKey?: string }, i: number) => (
          <p key={i} className="text-gray-600 dark:text-gray-400">
            {/* 2026-09-21：無資料的準確率為 null → 顯示「—」而非「null%」 */}
            {p.name}: <span className="font-semibold">{p.value == null ? '—' : String(p.value)}{p.value != null && (p.dataKey === 'avgAccuracy' || p.dataKey === 'accuracy' || p.dataKey === 'avgScore') ? '%' : ''}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
}

// ============================================
// Main Page
// ============================================

export default function AdminReportsPage() {
  const { t } = useT();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/stats');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('admin.reports.loadFailed'));
      setStats(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('admin.reports.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Deferred to a microtask so no state is set synchronously during the effect
  // (react-hooks/set-state-in-effect).
  useEffect(() => { void Promise.resolve().then(fetchStats); }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-center">
          <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
          <button onClick={fetchStats} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">{t('admin.reports.retry')}</button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('admin.reports.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t('admin.reports.subtitle')}</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label={t('admin.reports.totalStudents')} value={stats.overview.totalStudents} icon={Users} color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <StatCard label={t('admin.reports.totalTeachers')} value={stats.overview.totalTeachers} icon={GraduationCap} color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
        <StatCard label={t('admin.reports.totalSessions')} value={stats.overview.totalSessions} icon={Target} color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" />
        <StatCard label={t('admin.reports.totalMistakes')} value={stats.overview.totalMistakes} icon={AlertTriangle} color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" />
        <StatCard label={t('admin.reports.totalAssignments')} value={stats.overview.totalAssignments} icon={BookOpen} color="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" />
        <StatCard label={t('admin.reports.totalAdmins')} value={stats.overview.totalAdmins} icon={TrendingUp} color="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400" />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart: Accuracy by Level */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.reports.accuracyByLevel')}
          </h3>
          {stats.byLevel.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.byLevel} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="level" stroke="#9ca3af" fontSize={12} />
                <YAxis domain={[0, 100]} stroke="#9ca3af" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avgAccuracy" name={t('admin.reports.avgAccuracy')} radius={[6, 6, 0, 0]}>
                  {stats.byLevel.map((_, i) => (
                    <Cell key={i} fill={LEVEL_COLORS[i % LEVEL_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-16">{t('admin.reports.noData')}</p>
          )}
        </div>

        {/* Bar Chart: Accuracy by Class */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.reports.accuracyByClass')}
          </h3>
          {stats.byClass.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.byClass.slice(0, 12)} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="className" stroke="#9ca3af" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#9ca3af" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avgAccuracy" name={t('admin.reports.avgAccuracy')} fill="#8884d8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-16">{t('admin.reports.noData')}</p>
          )}
        </div>

        {/* Line Chart: Monthly Trend */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.reports.monthlyTrend')}
          </h3>
          {stats.monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stats.monthlyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#9ca3af" fontSize={11} />
                <YAxis yAxisId="left" stroke="#9ca3af" fontSize={12} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="#9ca3af" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="sessions" name={t('admin.reports.sessionsLabel')} stroke="#8884d8" strokeWidth={2} dot={{ r: 4 }} />
                <Line yAxisId="right" type="monotone" dataKey="accuracy" name={t('admin.reports.accuracyLabel')} stroke="#82ca9d" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-16">{t('admin.reports.noData')}</p>
          )}
        </div>

        {/* Pie Chart: Accuracy Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.reports.accuracyDistribution')}
          </h3>
          {stats.accuracyDistribution.some(d => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.accuracyDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="count"
                  nameKey="range"
                  label={({ name, value }: { name?: string; value?: number }) =>
                    value && value > 0 ? `${name || ''}%` : ''
                  }
                >
                  {stats.accuracyDistribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend formatter={(value) => `${value}%`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-16">{t('admin.reports.noData')}</p>
          )}
        </div>
      </div>

      {/* Level Detail Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('admin.reports.levelDetail')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-600 dark:text-gray-300">{t('admin.reports.level')}</th>
                <th className="text-center px-6 py-3 font-medium text-gray-600 dark:text-gray-300">{t('admin.reports.studentCount')}</th>
                <th className="text-center px-6 py-3 font-medium text-gray-600 dark:text-gray-300">{t('admin.reports.avgAccuracy')}</th>
                <th className="text-center px-6 py-3 font-medium text-gray-600 dark:text-gray-300">{t('admin.reports.progressBar')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {stats.byLevel.map(l => (
                <tr key={l.level} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">{l.level}</td>
                  <td className="px-6 py-3 text-center text-gray-600 dark:text-gray-400">{l.studentCount}</td>
                  <td className="px-6 py-3 text-center">
                    {/* 2026-09-21：無可驗證資料 ⇒ 「—」，不得顯示 0%（紅色） */}
                    {l.avgAccuracy == null ? (
                      <span className="font-medium text-gray-400">—</span>
                    ) : (
                      <span className={`font-medium ${l.avgAccuracy >= 70 ? 'text-green-600' : l.avgAccuracy >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {l.avgAccuracy}%
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                      <div
                        className="h-2.5 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all"
                        style={{ width: `${Math.min(100, l.avgAccuracy ?? 0)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {stats.byLevel.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">{t('admin.reports.noData')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
