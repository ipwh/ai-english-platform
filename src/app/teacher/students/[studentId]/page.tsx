// ============================================
// 教師端 — 個別學生分析
// TODO: connect to API
// ============================================
'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, Target, BookOpen, MessageSquare, FileText } from 'lucide-react';
import { mockClassStudents, mockPracticeTrend, mockSkillProgress, mockMistakes } from '@/lib/mock-data';
import ProgressBar from '@/components/shared/ProgressBar';
import SkillChip from '@/components/shared/SkillChip';
import { formatDate, getRiskColor } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

export default function StudentDetailPage() {
  const params = useParams();
  const studentId = params.studentId as string;
  const student = mockClassStudents.find(s => s.id === studentId) || mockClassStudents[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/teacher/students" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">學生分析</h1>
      </div>

      {/* 基本資料卡 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center text-2xl font-bold text-blue-600 dark:text-blue-300">
            {student.nameZh.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{student.nameZh}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{student.nameEn}</p>
            <div className="flex items-center gap-3 mt-2 text-sm text-gray-600 dark:text-gray-400">
              <span>完成率 {student.completionRate}%</span>
              <span>·</span>
              <span>正確率 {student.accuracy}%</span>
              <span>·</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRiskColor(student.riskLevel)}`}>
                {student.riskLevel === 'high' ? '高風險' : student.riskLevel === 'medium' ? '中風險' : '低風險'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 練習趨勢圖 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-500" /> 練習趨勢
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={mockPracticeTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="練習量" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
            <Line type="monotone" dataKey="正確率" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b' }} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* 技能掌握 + 最近錯題 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-green-500" /> 技能掌握
          </h2>
          <div className="space-y-3">
            {mockSkillProgress.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 dark:text-gray-400 w-20">{s.skill}</span>
                <div className="flex-1">
                  <ProgressBar value={s.現在} size="sm" showPercentage={true} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-red-500" /> 最近錯題
          </h2>
          <div className="space-y-2">
            {mockMistakes.slice(0, 5).map((m, i) => (
              <div key={i} className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{m.questionSummary}</p>
                  <p className="text-[10px] text-gray-400">{formatDate(m.date)}</p>
                </div>
                <span className={`text-xs ${m.reviewed ? 'text-green-500' : 'text-orange-500'}`}>
                  {m.reviewed ? '已溫習' : '待溫習'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 教師備註 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-purple-500" /> 教師備註
        </h2>
        <textarea
          placeholder="在此輸入對這位學生的觀察備註..."
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <button className="mt-2 px-4 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600">儲存備註</button>
      </section>

      {/* 家長面談摘要卡 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-500" /> 家長面談摘要卡
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">整體表現</p>
            <p className="font-medium text-gray-900 dark:text-white">中等偏下，持續改善中</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">需關注範疇</p>
            <p className="font-medium text-gray-900 dark:text-white">文法（關係子句）、詞彙</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">進步範疇</p>
            <p className="font-medium text-green-600">時態運用 (+7%)</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">學習態度</p>
            <p className="font-medium text-gray-900 dark:text-white">認真，但有時欠交功課</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">建議行動</p>
            <p className="font-medium text-gray-900 dark:text-white">每日練習 15 分鐘，重點溫習錯題</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">上次面談</p>
            <p className="font-medium text-gray-900 dark:text-white">2026年5月15日</p>
          </div>
        </div>
      </section>
    </div>
  );
}
