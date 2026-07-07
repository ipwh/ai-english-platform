// ============================================
// 教師端首頁 Dashboard
// TODO: connect to API
// ============================================
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Users, ClipboardCheck, AlertTriangle, BarChart3, ChevronRight, Clock, BookOpen, Sparkles, Loader2 } from 'lucide-react';
import { mockTeacher, mockTeacherKpis, mockSkillHeatmap, mockAtRiskStudents, mockTeacherAssignments } from '@/lib/mock-data';
import KpiCard from '@/components/shared/KpiCard';
import ProgressBar from '@/components/shared/ProgressBar';
import { formatDate, getRiskColor } from '@/lib/utils';
import { useT } from '@/hooks/use-i18n';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const heatmapColors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-400', 'bg-teal-500'];

function getHeatColor(val: number): string {
  if (val >= 75) return 'bg-teal-500';
  if (val >= 65) return 'bg-green-400';
  if (val >= 50) return 'bg-yellow-400';
  if (val >= 40) return 'bg-orange-400';
  return 'bg-red-400';
}

export default function TeacherDashboardPage() {
  const { t } = useT();
  const teacher = mockTeacher;
  const kpis = mockTeacherKpis;
  const recentAssignments = mockTeacherAssignments.slice(0, 3);

  // === AI 教學建議 ===
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string>('');
  const [aiError, setAiError] = useState('');

  const handleAITeachingAdvice = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/ai/analyze-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentLevel: 'S4',
          overallAccuracy: 65,
          weakSkills: [
            { name: 'relative-clauses', nameZh: '關係子句', accuracy: 45 },
            { name: 'phrasal-verbs', nameZh: '片語動詞', accuracy: 40 },
            { name: 'conditionals', nameZh: '條件句', accuracy: 58 },
          ],
          recentPerformance: [],
          streakDays: 0,
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        setAiAdvice(json.analysis.summary + '\n\n' + (json.analysis.studyPlan || ''));
      } else {
        setAiError(json.error || '無法獲取 AI 建議');
      }
    } catch {
      setAiError('AI 服務連線失敗');
    } finally {
      setAiLoading(false);
    }
  };

  // 班級完成率圖表資料
  const classChartData = [
    { name: '4A', 完成率: 75, 正確率: 68 },
    { name: '4B', 完成率: 80, 正確率: 72 },
    { name: '5C', 完成率: 70, 正確率: 65 },
    { name: '5D', 完成率: 62, 正確率: 60 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.dashboard.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('teacher.greeting', { name: teacher.nameZh })}</p>
        </div>
      </div>

      {/* KPI 橫列 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => <KpiCard key={i} data={kpi} />)}
      </div>

      {/* 中間：班級完成率圖 + 技能弱點熱圖 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 班級完成率圖 */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" /> {t('teacher.classCompletion')}
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={classChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="完成率" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="正確率" fill="#14b8a6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        {/* 技能弱點熱圖 */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" /> {t('teacher.skillHeatmap')}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left py-1 text-gray-400 font-medium">{t('teacher.skill')}</th>
                  <th className="px-2 py-1 text-gray-400 font-medium">4A</th>
                  <th className="px-2 py-1 text-gray-400 font-medium">4B</th>
                  <th className="px-2 py-1 text-gray-400 font-medium">5C</th>
                  <th className="px-2 py-1 text-gray-400 font-medium">5D</th>
                </tr>
              </thead>
              <tbody>
                {mockSkillHeatmap.map((row, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-1.5 text-gray-700 dark:text-gray-300">{row.itemZh}</td>
                    {['4A','4B','5C','5D'].map((col) => {
                      const val = row[col as keyof typeof row] as number;
                      return (
                        <td key={col} className="px-2 py-1.5 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-white text-[10px] font-medium ${getHeatColor(val)}`}>
                            {val}%
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* 下方：需跟進學生 + 最近任務 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 需跟進學生名單 */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-red-500" /> 需跟進學生
            </h2>
            <Link href="/teacher/students" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              查看全部 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {mockAtRiskStudents.map((s) => (
              <Link key={s.id} href={`/teacher/students/${s.id}`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300 flex-shrink-0">
                  {s.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{s.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getRiskColor(s.risk)}`}>{s.risk}風險</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.reason}</p>
                </div>
                <span className="text-xs text-gray-400">{s.accuracy}%</span>
              </Link>
            ))}
          </div>
        </section>

        {/* 最近任務 */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" /> 最近任務
            </h2>
            <Link href="/teacher/assignments" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              管理任務 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {recentAssignments.map((a) => (
              <Link key={a.id} href={`/teacher/assignments`} className="block p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{a.title}</span>
                  <span className="text-xs text-gray-400">{a.className}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <ProgressBar value={a.completionRate} size="sm" showPercentage={true} />
                  <span className="text-xs text-gray-400">{a.completionRate}%</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* AI 教學建議 */}
      <section className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-6 border border-purple-200 dark:border-purple-800">
        <h2 className="font-semibold text-purple-800 dark:text-purple-200 mb-3 flex items-center gap-2">
          <Sparkles className="w-5 h-5" /> AI 教學建議
        </h2>

        {!aiAdvice && !aiError && (
          <button
            onClick={handleAITeachingAdvice}
            disabled={aiLoading}
            className="w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2"
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {aiLoading ? 'AI 分析中...' : '獲取 AI 教學建議'}
          </button>
        )}

        {aiError && (
          <p className="text-sm text-purple-600 dark:text-purple-400">{aiError}</p>
        )}

        {aiAdvice && (
          <div className="space-y-3">
            <p className="text-sm text-purple-700 dark:text-purple-300 whitespace-pre-line">{aiAdvice}</p>
            <button
              onClick={handleAITeachingAdvice}
              disabled={aiLoading}
              className="text-xs text-purple-500 hover:text-purple-700 underline disabled:opacity-50"
            >
              {aiLoading ? '分析中...' : '🔄 重新分析'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
