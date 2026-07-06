// ============================================
// 教師端 — 單一班級詳情
// TODO: connect to API
// ============================================
'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users, TrendingUp, Target, Download, ChevronRight } from 'lucide-react';
import { mockClasses, mockClassStudents, mockSkillHeatmap } from '@/lib/mock-data';
import ProgressBar from '@/components/shared/ProgressBar';
import { getRiskColor, formatDate } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ClassDetailPage() {
  const params = useParams();
  const classId = params.classId as string;
  const cls = mockClasses.find(c => c.id === classId) || mockClasses[0];
  const students = mockClassStudents;

  const masteryData = [
    { unit: '時態', 掌握度: 72 },
    { unit: '關係子句', 掌握度: 45 },
    { unit: '條件句', 掌握度: 58 },
    { unit: '被動語態', 掌握度: 63 },
    { unit: '詞彙搭配', 掌握度: 55 },
    { unit: '片語動詞', 掌握度: 40 },
    { unit: '閱讀主旨', 掌握度: 70 },
    { unit: '閱讀推論', 掌握度: 52 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/teacher/classes" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{cls.name} 班級詳情</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{cls.gradeLevel}（中{cls.gradeLevel.slice(1)}）· {cls.studentCount} 名學生</p>
        </div>
      </div>

      {/* 班級摘要卡 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '學生人數', value: cls.studentCount, unit: '人', icon: Users, color: 'text-blue-600' },
          { label: '平均正確率', value: cls.avgAccuracy, unit: '%', icon: Target, color: 'text-green-600' },
          { label: '平均完成率', value: cls.avgCompletionRate, unit: '%', icon: TrendingUp, color: 'text-teal-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <span className="text-xs text-gray-500">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}<span className="text-sm text-gray-400 ml-1">{stat.unit}</span></p>
          </div>
        ))}
      </div>

      {/* 單元 mastery 長條圖 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">單元掌握度</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={masteryData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
            <YAxis dataKey="unit" type="category" tick={{ fontSize: 12 }} width={80} />
            <Tooltip />
            <Bar dataKey="掌握度" fill="#3b82f6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* 學生列表表格 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">學生列表</h2>
          <button className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            <Download className="w-3 h-3" /> 匯出
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="text-left py-2 text-gray-500 font-medium">姓名</th>
                <th className="text-center py-2 text-gray-500 font-medium">完成率</th>
                <th className="text-center py-2 text-gray-500 font-medium">正確率</th>
                <th className="text-left py-2 text-gray-500 font-medium">最弱技能</th>
                <th className="text-left py-2 text-gray-500 font-medium">最後登入</th>
                <th className="text-center py-2 text-gray-500 font-medium">風險</th>
                <th className="text-right py-2 text-gray-500 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">{s.nameZh.charAt(0)}</div>
                      <span className="font-medium text-gray-900 dark:text-white">{s.nameZh}</span>
                    </div>
                  </td>
                  <td className="text-center py-3">
                    <div className="flex items-center justify-center gap-1">
                      <ProgressBar value={s.completionRate} size="sm" showPercentage={false} className="w-16" />
                      <span className="text-xs">{s.completionRate}%</span>
                    </div>
                  </td>
                  <td className="text-center py-3">
                    <span className={`font-medium ${s.accuracy >= 70 ? 'text-green-600' : s.accuracy >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{s.accuracy}%</span>
                  </td>
                  <td className="py-3 text-xs text-gray-500">{s.weakSkill}</td>
                  <td className="py-3 text-xs text-gray-400">{s.lastLogin}</td>
                  <td className="text-center py-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getRiskColor(s.riskLevel)}`}>
                      {s.riskLevel === 'high' ? '高' : s.riskLevel === 'medium' ? '中' : '低'}
                    </span>
                  </td>
                  <td className="text-right py-3">
                    <Link href={`/teacher/students/${s.id}`} className="text-blue-600 text-xs hover:underline flex items-center justify-end gap-1">
                      詳情 <ChevronRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 全班常錯題型 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3">全班常錯題型</h2>
        <div className="space-y-2">
          {[
            { type: '關係子句選擇題', count: 18, pct: 56 },
            { type: '片語動詞填充', count: 15, pct: 47 },
            { type: '條件句辨識', count: 12, pct: 38 },
            { type: '被動語態改寫', count: 10, pct: 31 },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300 w-40">{item.type}</span>
              <div className="flex-1">
                <ProgressBar value={item.pct} size="sm" showPercentage={false} />
              </div>
              <span className="text-xs text-gray-400">{item.count} 人答錯</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
